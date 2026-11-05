import type { Metadata } from "next";
import Link from "next/link";
import { AuditList } from "@/components/admin/audit-list";
import { SyncButton } from "@/components/admin/forms";
import { Badge, Card, CardHeader, relativeTime } from "@/components/ui";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { getSource } from "@/lib/source";
import type { LintIssue } from "@/lib/spec/lint";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverview() {
  const source = getSource();
  const [apis, partners, pendingPartners, events, versions, audit] = await Promise.all([
    db.api.findMany({ include: { versions: true }, orderBy: { title: "asc" } }),
    db.user.count({ where: { kind: "partner" } }),
    db.user.count({ where: { kind: "partner", status: "invited" } }),
    db.syncEvent.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    db.apiVersion.findMany({ select: { lint: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const lintErrors = versions.reduce((n, v) => n + (JSON.parse(v.lint) as LintIssue[]).filter((i) => i.severity === "error").length, 0);
  const releases = apis.reduce((n, a) => n + a.versions.filter((v) => v.channel === "release").length, 0);

  const tiles = [
    { label: "APIs", value: apis.length, hint: `${releases} releases` },
    { label: "Partner users", value: partners, hint: pendingPartners ? `${pendingPartners} haven't set a password` : "All active" },
    { label: "Lint errors", value: lintErrors, hint: "Across all versions" },
    { label: "Last sync", value: events[0] ? relativeTime(events[0].createdAt) : "never", hint: events[0]?.status === "error" ? "Failed" : "OK" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <Link href="/admin/partners" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:opacity-90">
          Add partner user
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="flex flex-col gap-1.5 p-4">
            <span className="text-[13px] text-muted">{t.label}</span>
            <span className="text-2xl font-bold">{t.value}</span>
            <span className="text-xs text-muted">{t.hint}</span>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-col gap-1">
              Spec source
              <span className="font-mono text-[13px] font-normal text-muted">
                {source.kind} · {source.label}
              </span>
            </span>
          }
        >
          <SyncButton />
        </CardHeader>
        <div className="border-b border-line px-5 py-3 text-[13px] text-muted">
          {source.kind === "github" ? (
            <>
              GitHub webhook URL: <code className="font-mono text-fg">{appUrl("/api/github/webhook")}</code> · events: push, pull_request, create · content type
              JSON · secret = GITHUB_WEBHOOK_SECRET
            </>
          ) : (
            <>Local git repository. Run “Sync now” after committing or tagging; set SPEC_SOURCE=github to use a GitHub repo with webhooks.</>
          )}
        </div>
        <ul>
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-5 py-2.5 last:border-0">
              <span className={`size-2 shrink-0 self-center rounded-full ${e.status === "ok" ? "bg-post" : "bg-del"}`} />
              <code className="w-36 font-mono text-xs text-muted">{e.trigger} {e.ref}</code>
              <span className="flex-[1_1_300px] whitespace-pre-wrap">{e.message}</span>
              <span className="text-xs text-muted">{relativeTime(e.createdAt)}</span>
            </li>
          ))}
          {events.length === 0 ? <li className="px-5 py-3 text-muted">No syncs yet.</li> : null}
        </ul>
      </Card>

      <Card>
        <CardHeader title="APIs and versions" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 font-semibold">API</th>
                <th className="px-5 py-2.5 font-semibold">Visibility</th>
                <th className="px-5 py-2.5 font-semibold">Default</th>
                <th className="px-5 py-2.5 font-semibold">Releases</th>
                <th className="px-5 py-2.5 font-semibold">Draft (main)</th>
              </tr>
            </thead>
            <tbody>
              {apis.map((a) => {
                const rel = a.versions.filter((v) => v.channel === "release");
                const draft = a.versions.find((v) => v.channel === "main");
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <Link href={`/apis/${a.slug}`} className="font-semibold hover:text-accent">{a.title}</Link>
                      <div className="font-mono text-xs text-muted">apis/{a.slug}</div>
                    </td>
                    <td className="px-5 py-3"><Badge>{a.visibility}</Badge></td>
                    <td className="px-5 py-3 font-mono text-xs">{a.defaultVersion ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rel.map((v) => (
                          <Badge key={v.id} mono tone={v.lifecycle === "deprecated" ? "red" : v.lifecycle === "retired" ? "neutral" : "green"}>
                            {v.version}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{draft ? draft.version : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Visibility, default version, deprecations and retirements live in <code className="font-mono">apis/&lt;slug&gt;/apihub.yaml</code>; releases are git tags{" "}
          <code className="font-mono">&lt;slug&gt;@&lt;semver&gt;</code>. Change them in the repo (or the editor) and sync.
        </p>
      </Card>

      <Card>
        <CardHeader title="Recent activity">
          <Link href="/admin/audit" className="text-accent hover:underline">Full audit log</Link>
        </CardHeader>
        <AuditList rows={audit} />
      </Card>
    </>
  );
}
