import "server-only";
import semver from "semver";
import YAML from "yaml";
import { db } from "./db";
import { changelogMarkdown, diffSpecs } from "./spec/diff";
import { lintSpec } from "./spec/lint";
import type { OpenApiDoc } from "./spec/ops";
import { errorMessage, parseSpec } from "./spec/parse";
import { getSource, type SpecSource } from "./source";

/** `apis/<slug>/openapi.yaml` (or .yml/.json) is one API. */
const SPEC_FILE = /^apis\/([a-z0-9][a-z0-9-]*)\/openapi\.(ya?ml|json)$/;
/** Git tag `<slug>@<semver>` publishes an immutable release. */
const RELEASE_TAG = /^([a-z0-9][a-z0-9-]*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export type ApiMeta = {
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  visibility?: "internal" | "partner" | "public";
  defaultVersion?: string;
  /** version → sunset date */
  deprecated?: Record<string, string>;
  retired?: string[];
};

function parseMeta(text: string | null): ApiMeta {
  if (!text) return {};
  const raw = (YAML.parse(text) ?? {}) as Record<string, unknown>;
  const visibility = ["internal", "partner", "public"].includes(String(raw.visibility))
    ? (raw.visibility as ApiMeta["visibility"])
    : undefined;
  const deprecated: Record<string, string> = {};
  if (raw.deprecated && typeof raw.deprecated === "object") {
    for (const [v, d] of Object.entries(raw.deprecated as Record<string, unknown>)) deprecated[v] = String(d ?? "");
  }
  return {
    title: raw.title ? String(raw.title) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    owner: raw.owner ? String(raw.owner) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    visibility,
    defaultVersion: raw.defaultVersion ? String(raw.defaultVersion) : undefined,
    deprecated,
    retired: Array.isArray(raw.retired) ? raw.retired.map(String) : [],
  };
}

function lifecycleFor(meta: ApiMeta, version: string) {
  if (meta.retired?.includes(version)) return { lifecycle: "retired", sunsetAt: null };
  if (meta.deprecated && version in meta.deprecated) {
    const d = new Date(meta.deprecated[version]);
    return { lifecycle: "deprecated", sunsetAt: Number.isNaN(d.getTime()) ? null : d };
  }
  return { lifecycle: "published", sunsetAt: null };
}

async function readSnapshot(source: SpecSource, sha: string, slug: string, files: string[]) {
  const root = files.find((f) => SPEC_FILE.exec(f)?.[1] === slug);
  if (!root) throw new Error(`apis/${slug}/openapi.yaml not found at ${sha.slice(0, 7)}`);
  const read = (p: string) => source.readFile(sha, p);
  const sourceYaml = (await read(root)) ?? "";
  const parsed = await parseSpec(root, read);
  const lint = await lintSpec(root, read).catch((e) => [
    { severity: "error" as const, rule: "lint-crashed", message: errorMessage(e), path: "", line: 1 },
  ]);
  const meta = parseMeta(await read(`apis/${slug}/apihub.yaml`));
  return { parsed, sourceYaml, lint, meta };
}

async function upsertApi(slug: string, meta: ApiMeta, doc: OpenApiDoc) {
  const data = {
    title: meta.title ?? doc.info?.title ?? slug,
    description: meta.description ?? String(doc.info?.description ?? "").split("\n")[0].slice(0, 300),
    owner: meta.owner ?? "",
    tags: JSON.stringify(meta.tags ?? []),
    visibility: meta.visibility ?? "internal",
  };
  return db.api.upsert({ where: { slug }, create: { slug, ...data }, update: data });
}

export type SyncSummary = { ok: boolean; message: string; apis: number; newReleases: string[]; errors: string[] };

let running: Promise<SyncSummary> | null = null;

/** Pulls every API and release from the spec repo. Concurrent calls share one run. */
export function syncAll(trigger: "webhook" | "manual" | "startup") {
  running ??= doSync(trigger).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(trigger: "webhook" | "manual" | "startup"): Promise<SyncSummary> {
  const source = getSource();
  const errors: string[] = [];
  const newReleases: string[] = [];
  let mainSha = "";
  try {
    mainSha = await source.resolve(source.defaultBranch);
    const mainFiles = await source.listFiles(mainSha);
    const slugs = [...new Set(mainFiles.map((f) => SPEC_FILE.exec(f)?.[1]).filter(Boolean))] as string[];
    const metaBySlug = new Map<string, ApiMeta>();

    for (const slug of slugs) {
      try {
        const snap = await readSnapshot(source, mainSha, slug, mainFiles);
        metaBySlug.set(slug, snap.meta);
        const api = await upsertApi(slug, snap.meta, snap.parsed.doc);
        const row = {
          ref: source.defaultBranch,
          commitSha: mainSha,
          lifecycle: "draft",
          specJson: JSON.stringify(snap.parsed.doc),
          sourceYaml: snap.sourceYaml,
          oasVersion: snap.parsed.oasVersion,
          opCount: snap.parsed.opCount,
          lint: JSON.stringify(snap.lint),
        };
        // One working draft per API: replace it when info.version changes.
        await db.apiVersion.deleteMany({
          where: { apiId: api.id, channel: "main", NOT: { version: snap.parsed.version } },
        });
        await db.apiVersion.upsert({
          where: { apiId_channel_version: { apiId: api.id, channel: "main", version: snap.parsed.version } },
          create: { apiId: api.id, channel: "main", version: snap.parsed.version, ...row },
          update: row,
        });
      } catch (e) {
        errors.push(`${slug} (${source.defaultBranch}): ${errorMessage(e)}`);
      }
    }

    const tags = (await source.listTags())
      .map((t) => ({ ...t, m: RELEASE_TAG.exec(t.name) }))
      .filter((t) => t.m)
      .sort((a, b) => semver.compare(a.m![2], b.m![2]));

    for (const tag of tags) {
      const [, slug, version] = tag.m!;
      try {
        const existing = await db.apiVersion.findFirst({
          where: { channel: "release", version, api: { slug } },
        });
        if (existing) continue; // releases are immutable
        const files = await source.listFiles(tag.sha);
        const snap = await readSnapshot(source, tag.sha, slug, files);
        if (snap.parsed.version !== version) {
          throw new Error(`tag says ${version} but info.version is ${snap.parsed.version}`);
        }
        const api =
          (await db.api.findUnique({ where: { slug } })) ??
          (await upsertApi(slug, metaBySlug.get(slug) ?? snap.meta, snap.parsed.doc));

        const previous = (
          await db.apiVersion.findMany({ where: { apiId: api.id, channel: "release" } })
        )
          .filter((v) => semver.lt(v.version, version))
          .sort((a, b) => semver.rcompare(a.version, b.version))[0];
        const changelog = previous
          ? changelogMarkdown(slug, version, diffSpecs(JSON.parse(previous.specJson), snap.parsed.doc))
          : `## ${slug} ${version}\n\nFirst release.`;

        await db.apiVersion.create({
          data: {
            apiId: api.id,
            channel: "release",
            version,
            ref: tag.name,
            commitSha: tag.sha,
            specJson: JSON.stringify(snap.parsed.doc),
            sourceYaml: snap.sourceYaml,
            oasVersion: snap.parsed.oasVersion,
            opCount: snap.parsed.opCount,
            lint: JSON.stringify(snap.lint),
            changelog,
          },
        });
        newReleases.push(tag.name);
      } catch (e) {
        errors.push(`${tag.name}: ${errorMessage(e)}`);
      }
    }

    // Lifecycle and default version come from apihub.yaml on the default branch.
    for (const api of await db.api.findMany({ include: { versions: true } })) {
      const meta = metaBySlug.get(api.slug) ?? {};
      const releases = api.versions.filter((v) => v.channel === "release");
      for (const v of releases) {
        const lc = lifecycleFor(meta, v.version);
        if (v.lifecycle !== lc.lifecycle || String(v.sunsetAt) !== String(lc.sunsetAt)) {
          await db.apiVersion.update({ where: { id: v.id }, data: lc });
        }
      }
      const live = releases.filter((v) => !meta.retired?.includes(v.version));
      const stable = live
        .filter((v) => !semver.prerelease(v.version) && !(meta.deprecated && v.version in meta.deprecated))
        .sort((a, b) => semver.rcompare(a.version, b.version));
      const defaultVersion =
        (meta.defaultVersion && live.some((v) => v.version === meta.defaultVersion) && meta.defaultVersion) ||
        stable[0]?.version ||
        live.sort((a, b) => semver.rcompare(a.version, b.version))[0]?.version ||
        null;
      if (api.defaultVersion !== defaultVersion) {
        await db.api.update({ where: { id: api.id }, data: { defaultVersion } });
      }
      if (!slugs.includes(api.slug) && !releases.length) {
        await db.api.delete({ where: { id: api.id } }); // folder deleted and never released
      }
    }

    const message = `${slugs.length} APIs, ${newReleases.length} new release${newReleases.length === 1 ? "" : "s"}${
      errors.length ? `, ${errors.length} error${errors.length === 1 ? "" : "s"}` : ""
    }`;
    await db.syncEvent.create({
      data: {
        trigger,
        ref: `${source.defaultBranch}@${mainSha.slice(0, 7)}`,
        status: errors.length ? "error" : "ok",
        message: [message, ...errors].join("\n"),
      },
    });
    return { ok: errors.length === 0, message, apis: slugs.length, newReleases, errors };
  } catch (e) {
    const message = `Sync failed: ${errorMessage(e)}`;
    await db.syncEvent.create({
      data: { trigger, ref: mainSha ? mainSha.slice(0, 7) : source.defaultBranch, status: "error", message },
    });
    return { ok: false, message, apis: 0, newReleases, errors: [message] };
  }
}
