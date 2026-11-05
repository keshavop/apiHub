import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import semver from "semver";
import { CopyButton } from "@/components/copy-button";
import { Badge, Card, CardHeader, Notice, inputClass, type Tone } from "@/components/ui";
import { loadVersion } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { changelogMarkdown, checkVersionBump, diffSpecs, type ChangeKind } from "@/lib/spec/diff";

export const metadata: Metadata = { title: "Compare versions" };

const KINDS: { kind: ChangeKind; label: string; tone: Tone; hint: string }[] = [
  { kind: "breaking", label: "Breaking", tone: "red", hint: "Requires a major bump" },
  { kind: "additive", label: "Additive", tone: "green", hint: "Requires a minor bump" },
  { kind: "deprecation", label: "Deprecations", tone: "orange", hint: "Minor; set x-sunset" },
  { kind: "docs", label: "Docs only", tone: "blue", hint: "Patch is enough" },
];

const COUNT_COLOR: Record<ChangeKind, string> = {
  breaking: "text-del",
  additive: "text-post",
  deprecation: "text-put",
  docs: "text-get",
};

const RULES = [
  ["MAJOR", "red", "Removed or renamed operation, parameter or property; optional → required; new required input; narrowed type, format or enum in a request."],
  ["MINOR", "green", "New operation, optional parameter or response property; widened enum; deprecations."],
  ["PATCH", "blue", "Descriptions, summaries, examples, tags. No schema change."],
] as const;

export default async function ComparePage({ params, searchParams }: PageProps<"/apis/[slug]/compare">) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/apis/${slug}/compare`);
  const any = await loadVersion(user, slug, "latest");
  if (!any) notFound();

  const refOf = (v: { channel: string; version: string }) => (v.channel === "main" ? "main" : v.version);
  const ordered = any.allowed
    .slice()
    .sort((a, b) => (a.channel === "main" ? -1 : b.channel === "main" ? 1 : semver.rcompare(a.version, b.version)));
  if (ordered.length < 2) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Notice>Only one version of {any.api.title} is available to you, so there is nothing to compare yet.</Notice>
      </main>
    );
  }

  const headRef = typeof sp.head === "string" ? sp.head : refOf(ordered[0]);
  const headIdx = Math.max(0, ordered.findIndex((v) => refOf(v) === headRef));
  // Default base: the newest release older than head.
  const defaultBase =
    ordered.find((v, i) => i > headIdx && v.channel === "release" && v.version !== ordered[headIdx].version) ?? ordered[headIdx === 0 ? 1 : 0];
  const baseRef = typeof sp.base === "string" ? sp.base : refOf(defaultBase);

  const [base, head] = await Promise.all([loadVersion(user, slug, baseRef), loadVersion(user, slug, headRef)]);
  if (!base || !head) notFound();
  const changes = diffSpecs(JSON.parse(base.version.specJson), JSON.parse(head.version.specJson));
  const check = checkVersionBump(base.version.version, head.version.version, changes);
  const filter = typeof sp.kind === "string" ? sp.kind : "all";
  const shown = filter === "all" ? changes : changes.filter((c) => c.kind === filter);
  const changelog = changelogMarkdown(slug, head.version.version, changes);
  const label = (v: { channel: string; version: string }) => (v.channel === "main" ? `v${v.version} · draft (main)` : `v${v.version}`);
  const qs = (kind: string) => `?base=${baseRef}&head=${headRef}${kind === "all" ? "" : `&kind=${kind}`}`;

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 py-7 sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="text-[13px] text-muted">
          <Link href={`/apis/${slug}`} className="hover:text-fg">{any.api.title}</Link> / compare
        </div>
        <form className="flex flex-wrap items-end gap-3">
          <h1 className="mr-2 text-2xl font-bold tracking-tight">Compare versions</h1>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Base
            <select name="base" defaultValue={baseRef} className={`${inputClass} w-56 font-mono text-[13px]`}>
              {ordered.map((v) => <option key={v.id} value={refOf(v)}>{label(v)}</option>)}
            </select>
          </label>
          <span className="pb-2.5 text-muted" aria-hidden="true">→</span>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Head
            <select name="head" defaultValue={headRef} className={`${inputClass} w-56 font-mono text-[13px]`}>
              {ordered.map((v) => <option key={v.id} value={refOf(v)}>{label(v)}</option>)}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-surface-2">Compare</button>
        </form>
      </div>

      <div role={check.ok ? "status" : "alert"} className={`flex flex-col gap-1.5 rounded-xl border px-5 py-4 ${check.ok ? "border-post/40 bg-post-bg" : "border-del/50 bg-del-bg"}`}>
        <span className={`font-bold ${check.ok ? "text-post" : "text-del"}`}>
          {check.ok ? "Semver check passed" : "Semver check failed"} · {base.version.version} → {head.version.version}
        </span>
        {check.ok ? (
          <span>
            Changes need {check.required === "none" ? "no version change" : `a ${check.required} bump`}; the declared version satisfies it.
          </span>
        ) : (
          <ul className="list-disc pl-5">
            {check.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {!check.ok && check.required !== "none" ? (
          <span className="text-[13px] text-muted">
            Suggested version: <code className="font-mono text-fg">{check.suggested}</code>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {KINDS.map((k) => {
          const n = changes.filter((c) => c.kind === k.kind).length;
          return (
            <Link key={k.kind} href={qs(filter === k.kind ? "all" : k.kind)} aria-current={filter === k.kind ? "true" : undefined}
              className={`flex flex-col gap-1 rounded-xl border bg-surface p-4 ${filter === k.kind ? "border-accent" : "border-line"}`}>
              <span className={`text-2xl font-bold ${n ? COUNT_COLOR[k.kind] : "text-muted"}`}>{n}</span>
              <span className="font-medium">{k.label}</span>
              <span className="text-xs text-muted">{k.hint}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[999_1_560px] overflow-hidden">
          <CardHeader title={filter === "all" ? `All changes (${changes.length})` : `${KINDS.find((k) => k.kind === filter)?.label} (${shown.length})`}>
            {filter !== "all" ? <Link href={qs("all")} className="text-accent hover:underline">Show all</Link> : null}
          </CardHeader>
          {shown.length === 0 ? <p className="px-5 py-4 text-muted">No changes.</p> : null}
          <ul>
            {shown.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-line px-5 py-3 last:border-0">
                <span className="w-24"><Badge tone={KINDS.find((k) => k.kind === c.kind)!.tone}>{c.kind}</Badge></span>
                <code className="flex-[0_1_320px] font-mono text-xs break-all">{c.where}</code>
                <span className="flex-[1_1_220px] text-muted">
                  {c.message}
                  {c.removedWithoutDeprecation ? <span className="text-del"> Not deprecated first.</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <aside className="flex flex-[1_1_360px] flex-col gap-4">
          <Card>
            <CardHeader title="Patch conventions" />
            <ul>
              {RULES.map(([bump, tone, text]) => (
                <li key={bump} className="flex gap-3.5 border-b border-line px-5 py-3 last:border-0">
                  <span className="w-14 shrink-0"><Badge tone={tone} mono>{bump}</Badge></span>
                  <span className="leading-relaxed text-muted">{text}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-3 text-[13px] text-muted">
              Remove something only after a release that marked it <code className="font-mono">deprecated: true</code> (operations also need <code className="font-mono">x-sunset</code>).
            </p>
          </Card>
          <Card>
            <CardHeader title="Changelog">
              <CopyButton value={changelog} label="Copy" />
            </CardHeader>
            <pre className="m-0 overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">{changelog}</pre>
          </Card>
        </aside>
      </div>
    </main>
  );
}
