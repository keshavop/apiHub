import "server-only";
import semver from "semver";
import { db } from "./db";
import { getSource } from "./source";
import { checkVersionBump, diffSpecs, type BumpCheck } from "./spec/diff";
import { errorMessage, parseSpec } from "./spec/parse";

const SPEC_FILE = /^apis\/([a-z0-9][a-z0-9-]*)\/openapi\.(ya?ml|json)$/;

export type ApiCheck = { slug: string; version: string | null; against: string | null; check: BumpCheck | null; error: string | null };

/**
 * The semver gate for a proposed change: every API whose spec differs between
 * base and head is diffed against its latest release and must declare a large
 * enough bump (and only remove things that were deprecated first).
 */
export async function checkChange(headRef: string, baseRef: string) {
  const source = getSource();
  const [headSha, baseSha] = await Promise.all([source.resolve(headRef), source.resolve(baseRef)]);
  const files = await source.listFiles(headSha);
  const results: ApiCheck[] = [];

  for (const path of files) {
    const slug = SPEC_FILE.exec(path)?.[1];
    if (!slug) continue;
    const [head, base] = await Promise.all([source.readFile(headSha, path), source.readFile(baseSha, path)]);
    if (head === base) continue;
    try {
      const parsed = await parseSpec(path, (p) => source.readFile(headSha, p));
      const releases = await db.apiVersion.findMany({ where: { channel: "release", api: { slug } } });
      const latest = releases.sort((a, b) => semver.rcompare(a.version, b.version))[0];
      if (!latest) {
        results.push({ slug, version: parsed.version, against: null, check: null, error: null });
        continue;
      }
      const changes = diffSpecs(JSON.parse(latest.specJson), parsed.doc);
      results.push({ slug, version: parsed.version, against: latest.version, check: checkVersionBump(latest.version, parsed.version, changes), error: null });
    } catch (e) {
      results.push({ slug, version: null, against: null, check: null, error: errorMessage(e) });
    }
  }

  const failed = results.filter((r) => r.error || (r.check && !r.check.ok));
  const summary = !results.length
    ? "No API spec changes."
    : failed.length
      ? failed.map((r) => `${r.slug}: ${r.error ?? r.check!.problems[0]}`).join(" | ")
      : results.map((r) => `${r.slug} ${r.version}${r.check ? ` (${r.check.required} ok)` : " (first release)"}`).join(", ");
  return { headSha, ok: failed.length === 0, summary, results };
}
