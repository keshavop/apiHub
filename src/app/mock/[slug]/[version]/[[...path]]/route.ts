import { loadVersion } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mockResponse } from "@/lib/spec/mock";

/**
 * Mock server: /mock/<slug>/<version>/<path> answers from the spec's examples or
 * generated samples. Send `Prefer: code=404` to get a specific documented response.
 * Requires the same access as the docs (session cookie).
 */
async function handle(req: Request, ctx: RouteContext<"/mock/[slug]/[version]/[[...path]]">) {
  const { slug, version, path } = await ctx.params;
  const found = await loadVersion(await getCurrentUser(), slug, version);
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });
  const prefer = /code=(\d{3}|default)/.exec(req.headers.get("prefer") ?? "")?.[1] ?? null;
  const result = mockResponse(JSON.parse(found.version.specJson), req.method, `/${(path ?? []).join("/")}`, prefer);
  const headers = new Headers(result.headers);
  if (result.contentType) headers.set("Content-Type", result.contentType);
  const body = result.body === null ? null : typeof result.body === "string" && !result.contentType?.includes("json") ? result.body : JSON.stringify(result.body, null, 2);
  return new Response(result.status === 204 ? null : body, { status: result.status, headers });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
