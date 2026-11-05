import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { VersionSelect } from "@/components/spec/version-select";
import { SpecViewer } from "@/components/spec/spec-viewer";
import { Badge, ButtonLink, Card, lifecycleTone } from "@/components/ui";
import { loadVersion } from "@/lib/access";
import { getCurrentUser, hasRole } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/email";
import type { LintIssue } from "@/lib/spec/lint";

export async function generateMetadata({ params }: PageProps<"/apis/[slug]/[version]">): Promise<Metadata> {
  const { slug, version } = await params;
  return { title: `${slug} ${version}` };
}

export default async function DocsPage({ params, searchParams }: PageProps<"/apis/[slug]/[version]">) {
  const { slug, version } = await params;
  const { tab } = await searchParams;
  const user = await getCurrentUser();
  const found = await loadVersion(user, slug, version);
  if (!found) {
    if (!user) redirect(`/login?next=/apis/${slug}/${version}`);
    notFound();
  }
  const { api, version: v, allowed } = found;
  const isStaff = user?.kind === "staff";
  const ref = v.channel === "main" ? "main" : v.version;
  const lint = JSON.parse(v.lint) as LintIssue[];
  const errors = lint.filter((i) => i.severity === "error").length;
  const warnings = lint.filter((i) => i.severity === "warning").length;
  const mockUrl = appUrl(`/mock/${slug}/${ref}`);

  const options = allowed
    .slice()
    .sort((a, b) => (a.channel === "main" ? -1 : b.channel === "main" ? 1 : b.createdAt.getTime() - a.createdAt.getTime()))
    .map((o) => ({
      value: o.channel === "main" ? "main" : o.version,
      label:
        o.channel === "main"
          ? `v${o.version} · draft (main)`
          : `v${o.version}${o.version === api.defaultVersion ? " · default" : ""}${o.lifecycle !== "published" ? ` · ${o.lifecycle}` : ""}`,
    }));
  const releases = allowed.filter((o) => o.channel === "release");
  const tabs = [
    { id: "docs", label: "Reference" },
    ...(v.changelog ? [{ id: "changelog", label: "Changelog" }] : []),
    ...(isStaff ? [{ id: "lint", label: `Lint (${lint.length})` }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? (tab as string) : "docs";

  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-muted">
              <Link href="/apis" className="hover:text-fg">
                {user?.kind === "partner" ? "My APIs" : "Registry"}
              </Link>{" "}
              / {api.slug}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">{api.title}</h1>
              <VersionSelect slug={slug} current={ref} options={options} />
              <Badge tone={lifecycleTone(v.lifecycle)}>{v.lifecycle}</Badge>
              {v.sunsetAt ? <Badge tone="red">sunset {v.sunsetAt.toISOString().slice(0, 10)}</Badge> : null}
              {isStaff ? <Badge>{api.visibility}</Badge> : null}
              <Badge mono>OAS {v.oasVersion}</Badge>
            </div>
            <p className="font-mono text-xs text-muted">
              {v.ref} · {v.commitSha.slice(0, 7)}
              {isStaff ? (
                <>
                  {" "}· lint {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-3.5 font-medium hover:bg-surface-2" href={`/api/specs/${slug}/${ref}?format=yaml`}>
              YAML
            </a>
            <a className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-3.5 font-medium hover:bg-surface-2" href={`/api/specs/${slug}/${ref}?format=json`}>
              JSON
            </a>
            <CopyButton value={mockUrl} label="Copy mock URL" />
            {releases.length > 1 || (isStaff && allowed.length > 1) ? (
              <ButtonLink href={`/apis/${slug}/compare?head=${ref}`}>Compare</ButtonLink>
            ) : null}
            {hasRole(user, "designer") ? (
              <ButtonLink href={`/apis/${slug}/edit`} variant="primary">
                Edit spec
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto flex max-w-[1400px] gap-1 px-4 sm:px-6">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === "docs" ? `/apis/${slug}/${ref}` : `/apis/${slug}/${ref}?tab=${t.id}`}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={`border-b-2 px-3 py-2.5 font-medium ${activeTab === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {activeTab === "docs" ? <SpecViewer spec={JSON.parse(v.specJson)} mockUrl={mockUrl} /> : null}

      {activeTab === "changelog" ? (
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <Card className="p-5">
            <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{v.changelog}</pre>
          </Card>
        </main>
      ) : null}

      {activeTab === "lint" ? (
        <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
          <Card>
            {lint.length === 0 ? (
              <p className="p-5 text-muted">No problems found.</p>
            ) : (
              <ul>
                {lint.map((i, n) => (
                  <li key={n} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-5 py-3 last:border-0">
                    <Badge tone={i.severity === "error" ? "red" : i.severity === "warning" ? "orange" : "blue"}>{i.severity}</Badge>
                    <code className="font-mono text-xs text-muted">{i.rule}</code>
                    <span className="flex-[1_1_300px]">{i.message}</span>
                    <span className="font-mono text-xs text-muted">Ln {i.line}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </main>
      ) : null}
    </div>
  );
}
