import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/email";
import { checkChange } from "@/lib/pr-check";
import { getSource } from "@/lib/source";
import { syncAll } from "@/lib/sync";

function validSignature(body: string, header: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** GitHub webhook: push / tag → sync; pull_request → apihub/semver commit status. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!validSignature(body, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body);
  const source = getSource();

  if (event === "ping") return Response.json({ ok: true });

  if (event === "push" || event === "create") {
    const ref: string = payload.ref ?? "";
    const isDefault = ref === `refs/heads/${source.defaultBranch}`;
    const isTag = ref.startsWith("refs/tags/") || payload.ref_type === "tag";
    if (isDefault || isTag) after(() => syncAll("webhook"));
    return Response.json({ queued: isDefault || isTag });
  }

  if (event === "pull_request" && ["opened", "synchronize", "reopened", "ready_for_review"].includes(payload.action)) {
    const head: string = payload.pull_request.head.sha;
    const base: string = payload.pull_request.base.sha;
    after(async () => {
      const result = await checkChange(head, base);
      const first = result.results[0];
      const target = first ? appUrl(`/apis/${first.slug}/compare?head=main`) : appUrl("/admin");
      await source.setStatus(result.headSha, result.ok, result.summary, target);
      await audit(null, "pr.semver_check", `#${payload.number}`, `${result.ok ? "pass" : "fail"}: ${result.summary}`);
    });
    return Response.json({ queued: true });
  }

  return Response.json({ ignored: event });
}
