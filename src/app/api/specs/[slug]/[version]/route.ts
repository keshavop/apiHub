import YAML from "yaml";
import { loadVersion } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";

/** Bundled spec download. Same access rules as the docs page. */
export async function GET(req: Request, ctx: RouteContext<"/api/specs/[slug]/[version]">) {
  const { slug, version } = await ctx.params;
  const found = await loadVersion(await getCurrentUser(), slug, version);
  if (!found) return new Response("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "yaml";
  const doc = JSON.parse(found.version.specJson);
  const name = `${slug}-${found.version.version}.${format === "json" ? "json" : "yaml"}`;
  return new Response(format === "json" ? JSON.stringify(doc, null, 2) : YAML.stringify(doc, { lineWidth: 0 }), {
    headers: {
      "Content-Type": format === "json" ? "application/json" : "application/yaml",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
