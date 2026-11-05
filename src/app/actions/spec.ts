"use server";

import semver from "semver";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getSource } from "@/lib/source";
import { checkVersionBump, diffSpecs, type BumpCheck, type ChangeKind } from "@/lib/spec/diff";
import { lintSpec, type LintIssue } from "@/lib/spec/lint";
import { errorMessage, parseSpec } from "@/lib/spec/parse";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type ValidateResult = {
  parseError: string | null;
  lint: LintIssue[];
  version: string | null;
  compareTo: string | null;
  counts: Record<ChangeKind, number> | null;
  check: BumpCheck | null;
};

/** Reads the default branch with the draft file swapped in, so cross-file $refs resolve. */
async function draftReader(path: string, text: string) {
  const source = getSource();
  const sha = await source.resolve(source.defaultBranch);
  return (p: string) => (p === path ? Promise.resolve(text) : source.readFile(sha, p));
}

function specPath(slug: string) {
  return `apis/${slug}/openapi.yaml`;
}

export async function validateDraft(slug: string, text: string): Promise<ValidateResult> {
  await requireStaff("designer");
  if (!SLUG.test(slug)) {
    return { parseError: "Slug must be lowercase letters, digits and dashes.", lint: [], version: null, compareTo: null, counts: null, check: null };
  }
  const path = specPath(slug);
  const read = await draftReader(path, text);
  const lint = await lintSpec(path, read).catch(() => [] as LintIssue[]);
  let parsed;
  try {
    parsed = await parseSpec(path, read);
  } catch (e) {
    return { parseError: errorMessage(e), lint, version: null, compareTo: null, counts: null, check: null };
  }

  const releases = await db.apiVersion.findMany({ where: { channel: "release", api: { slug } } });
  const latest = releases.sort((a, b) => semver.rcompare(a.version, b.version))[0];
  if (!latest) return { parseError: null, lint, version: parsed.version, compareTo: null, counts: null, check: null };

  const changes = diffSpecs(JSON.parse(latest.specJson), parsed.doc);
  const counts = { breaking: 0, additive: 0, deprecation: 0, docs: 0 } as Record<ChangeKind, number>;
  for (const c of changes) counts[c.kind] += 1;
  return {
    parseError: null,
    lint,
    version: parsed.version,
    compareTo: latest.version,
    counts,
    check: checkVersionBump(latest.version, parsed.version, changes),
  };
}

export type ProposeResult = { error?: string; branch?: string; url?: string | null };

export async function proposeSpecChange(input: {
  slug: string;
  text: string;
  title: string;
  description: string;
  isNew: boolean;
  visibility?: string;
}): Promise<ProposeResult> {
  const user = await requireStaff("designer");
  const { slug, text, isNew } = input;
  if (!SLUG.test(slug)) return { error: "Slug must be lowercase letters, digits and dashes." };
  const title = input.title.trim() || `${isNew ? "Add" : "Update"} ${slug} spec`;

  const path = specPath(slug);
  const read = await draftReader(path, text);
  try {
    await parseSpec(path, read);
  } catch (e) {
    return { error: `Fix the spec before proposing it: ${errorMessage(e)}` };
  }

  const source = getSource();
  const sha = await source.resolve(source.defaultBranch);
  const current = await source.readFile(sha, path);
  const exists = current !== null;
  if (isNew && exists) return { error: `apis/${slug} already exists. Open it from the registry to edit.` };
  if (!isNew && !exists) return { error: `apis/${slug}/openapi.yaml is not on ${source.defaultBranch}.` };

  const content = text.endsWith("\n") ? text : `${text}\n`;
  if (current === content) return { error: "Nothing changed compared to the default branch." };
  const files = [{ path, content }];
  if (isNew) {
    const visibility = ["internal", "partner", "public"].includes(input.visibility ?? "") ? input.visibility : "internal";
    files.push({ path: `apis/${slug}/apihub.yaml`, content: `owner: ${user.label}\ntags: []\nvisibility: ${visibility}\n` });
  }
  const branch = `apihub/${user.label.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}/${slug}-${Date.now().toString(36)}`;
  try {
    const result = await source.proposeChange({
      baseBranch: source.defaultBranch,
      branch,
      title,
      body: `${input.description.trim() || "Proposed in apiHub."}\n\nOpened from apiHub by ${user.label}.`,
      files,
      authorName: user.name ?? user.label,
      authorEmail: `${user.githubLogin ?? "apihub"}@users.noreply.github.com`,
    });
    await audit(user, "spec.propose", slug, result.url ?? result.branch);
    return { branch: result.branch, url: result.url };
  } catch (e) {
    return { error: `Couldn't open the change: ${errorMessage(e)}` };
  }
}
