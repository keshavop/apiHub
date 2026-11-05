import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import semver from "semver";
import { Badge, ButtonLink, Card, inputClass, lifecycleTone, relativeTime } from "@/components/ui";
import { visibleApis } from "@/lib/access";
import { getCurrentUser, hasRole } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { listOperations } from "@/lib/spec/ops";

export const metadata: Metadata = { title: "APIs" };

type Search = { q?: string; visibility?: string; lifecycle?: string; tag?: string };

export default async function RegistryPage({ searchParams }: PageProps<"/apis">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/apis");
  const sp = (await searchParams) as Search;
  const q = (sp.q ?? "").trim().toLowerCase();

  const apis = (await visibleApis(user)).map((api) => {
    const releases = api.versions.filter((v) => v.channel === "release");
    const current =
      releases.find((v) => v.version === api.defaultVersion) ??
      releases[0] ??
      api.versions.find((v) => v.channel === "main")!;
    const ops = listOperations(JSON.parse(current.specJson));
    const tags = JSON.parse(api.tags) as string[];
    const haystack = [api.title, api.slug, api.description, ...tags, ...ops.map((o) => `${o.path} ${o.op.summary ?? ""} ${o.op.operationId ?? ""}`)]
      .join(" ")
      .toLowerCase();
    const lifecycle = releases.length ? current.lifecycle : "draft";
    return { api, current, releases, tags, haystack, lifecycle, opCount: ops.length };
  });

  const filtered = apis.filter(
    (a) =>
      (!q || a.haystack.includes(q)) &&
      (!sp.visibility || a.api.visibility === sp.visibility) &&
      (!sp.lifecycle || a.lifecycle === sp.lifecycle) &&
      (!sp.tag || a.tags.includes(sp.tag)),
  );
  const allTags = [...new Set(apis.flatMap((a) => a.tags))].sort();
  const lastSync = user.kind === "staff" ? await db.syncEvent.findFirst({ orderBy: { createdAt: "desc" } }) : null;
  const isPartner = user.kind === "partner";

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{isPartner ? "APIs shared with you" : "API Registry"}</h1>
          {isPartner ? (
            <p className="max-w-2xl text-muted">
              Your login can open only the API specs and version ranges assigned to <span className="font-mono text-fg">{user.email}</span>.
            </p>
          ) : lastSync ? (
            <p className="flex flex-wrap items-center gap-2 text-muted">
              <Badge tone={lastSync.status === "ok" ? "green" : "red"}>{lastSync.status === "ok" ? "Synced" : "Sync error"}</Badge>
              <span className="font-mono text-[13px]">{lastSync.ref}</span>· {relativeTime(lastSync.createdAt)}
            </p>
          ) : null}
        </div>
        {hasRole(user, "designer") ? <ButtonLink href="/apis/new" variant="primary">New API</ButtonLink> : null}
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-[240px] flex-[1_1_320px] flex-col gap-1.5 font-medium">
          Search
          <input name="q" defaultValue={sp.q} placeholder="APIs, paths, operations, tags…" className={inputClass} />
        </label>
        {!isPartner ? (
          <>
            <Select name="visibility" label="Visibility" value={sp.visibility} options={["internal", "partner", "public"]} />
            <Select name="lifecycle" label="Lifecycle" value={sp.lifecycle} options={["published", "draft", "deprecated"]} />
          </>
        ) : null}
        <Select name="tag" label="Tag" value={sp.tag} options={allTags} />
        <button type="submit" className="h-10 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-surface-2">Apply</button>
      </form>

      <p className="text-muted">
        {filtered.length} of {apis.length} API{apis.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted">
          {apis.length === 0
            ? isPartner
              ? "No APIs have been shared with your email yet. Ask your apiHub contact to grant access."
              : "No APIs yet. Add apis/<slug>/openapi.yaml to the spec repo, or create one with New API."
            : "Nothing matches these filters."}
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {filtered.map(({ api, current, releases, tags, lifecycle, opCount }) => (
            <Link key={api.id} href={`/apis/${api.slug}`} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 hover:border-accent">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-base font-semibold">{api.title}</span>
                  <span className="font-mono text-xs text-muted">apis/{api.slug}</span>
                </div>
                <Badge tone="accent" mono>
                  v{current.version}
                </Badge>
              </div>
              {api.description ? <p className="line-clamp-2 leading-relaxed text-muted">{api.description}</p> : null}
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={lifecycleTone(lifecycle)}>{lifecycle}</Badge>
                {!isPartner ? <Badge>{api.visibility}</Badge> : null}
                {isPartner && api.grant ? <Badge mono>access {api.grant.versionRange}</Badge> : null}
                {tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>
                  {opCount} operations · {releases.length} release{releases.length === 1 ? "" : "s"}
                  {semver.prerelease(current.version) ? " · pre-release" : ""}
                </span>
                <span>Updated {relativeTime(api.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      <select name={name} defaultValue={value ?? ""} className={`${inputClass} w-44`}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
