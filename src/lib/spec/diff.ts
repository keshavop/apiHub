import semver from "semver";
import { derefInternal } from "./refs";
import { listOperations, type OpenApiDoc } from "./ops";

/**
 * Patch conventions (enforced on every PR and shown on the compare page):
 * - breaking    → MAJOR  removed/renamed operation, parameter or property; optional → required;
 *                        new required input; type, format or enum narrowed in a request
 * - additive    → MINOR  new operation, optional input or response property; widened enums
 * - deprecation → MINOR  `deprecated: true` added (give it an `x-sunset` date)
 * - docs        → PATCH  summaries, descriptions, examples, tags only
 * A removal is only allowed if the base version already marked the item deprecated.
 */
export type ChangeKind = "breaking" | "additive" | "deprecation" | "docs";
export type Change = {
  kind: ChangeKind;
  where: string;
  message: string;
  removedWithoutDeprecation?: boolean;
};
export type Bump = "major" | "minor" | "patch" | "none";

type Obj = Record<string, unknown>;
type Ctx = "request" | "response";

const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const asObj = (v: unknown): Obj => (isObj(v) ? v : {});
const typesOf = (s: Obj) =>
  (Array.isArray(s.type) ? s.type : s.type ? [s.type] : []).map(String).sort().join("|");
const DOC_KEYS = ["description", "summary", "title", "example", "examples", "externalDocs"];

function docsChanged(a: Obj, b: Obj) {
  return DOC_KEYS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

function compareSchema(a: unknown, b: unknown, where: string, ctx: Ctx, out: Change[], depth = 0) {
  if (depth > 25) return;
  if (!isObj(a) && !isObj(b)) return;
  if (!isObj(a)) {
    out.push({ kind: "additive", where, message: "Schema added." });
    return;
  }
  if (!isObj(b)) {
    out.push({ kind: "breaking", where, message: "Schema removed." });
    return;
  }

  const ta = typesOf(a);
  const tb = typesOf(b);
  if (ta && tb && ta !== tb) {
    out.push({ kind: "breaking", where, message: `Type changed from ${ta} to ${tb}.` });
    return;
  }
  if (a.format !== b.format && (a.format || b.format)) {
    out.push({ kind: "breaking", where, message: `Format changed from ${a.format ?? "none"} to ${b.format ?? "none"}.` });
  }

  if (Array.isArray(a.enum) || Array.isArray(b.enum)) {
    const ea = (a.enum as unknown[] | undefined)?.map(String) ?? [];
    const eb = (b.enum as unknown[] | undefined)?.map(String) ?? [];
    const removed = ea.filter((v) => !eb.includes(v));
    const added = eb.filter((v) => !ea.includes(v));
    if (!a.enum && b.enum && ctx === "request") {
      out.push({ kind: "breaking", where, message: "Values are now restricted to an enum." });
    } else {
      if (removed.length)
        out.push({
          kind: ctx === "request" ? "breaking" : "additive",
          where,
          message: `Enum value${removed.length > 1 ? "s" : ""} removed: ${removed.join(", ")}.`,
        });
      if (added.length)
        out.push({ kind: "additive", where, message: `Enum value${added.length > 1 ? "s" : ""} added: ${added.join(", ")}.` });
    }
  }

  if (ctx === "request") {
    for (const k of ["maxLength", "maximum", "maxItems"]) {
      if (typeof b[k] === "number" && (typeof a[k] !== "number" || (b[k] as number) < (a[k] as number)))
        out.push({ kind: "breaking", where, message: `${k} tightened to ${b[k]}.` });
    }
    for (const k of ["minLength", "minimum", "minItems"]) {
      if (typeof b[k] === "number" && (typeof a[k] !== "number" || (b[k] as number) > (a[k] as number)))
        out.push({ kind: "breaking", where, message: `${k} tightened to ${b[k]}.` });
    }
    if (b.pattern && a.pattern !== b.pattern)
      out.push({ kind: "breaking", where, message: "pattern changed." });
  }

  if (!a.deprecated && b.deprecated)
    out.push({ kind: "deprecation", where, message: "Marked deprecated." });
  if (docsChanged(a, b)) out.push({ kind: "docs", where, message: "Description or example changed." });

  const pa = asObj(a.properties);
  const pb = asObj(b.properties);
  const ra = new Set((a.required as string[] | undefined) ?? []);
  const rb = new Set((b.required as string[] | undefined) ?? []);
  for (const name of Object.keys(pa)) {
    const at = `${where}.${name}`;
    if (!(name in pb)) {
      out.push({
        kind: "breaking",
        where: at,
        message: "Property removed.",
        removedWithoutDeprecation: !asObj(pa[name]).deprecated,
      });
      continue;
    }
    if (ctx === "request" && !ra.has(name) && rb.has(name))
      out.push({ kind: "breaking", where: at, message: "Optional property is now required." });
    if (ctx === "response" && ra.has(name) && !rb.has(name))
      out.push({ kind: "breaking", where: at, message: "Property is no longer guaranteed (removed from required)." });
    compareSchema(pa[name], pb[name], at, ctx, out, depth + 1);
  }
  for (const name of Object.keys(pb)) {
    if (name in pa) continue;
    const at = `${where}.${name}`;
    if (ctx === "request" && rb.has(name))
      out.push({ kind: "breaking", where: at, message: "New required property." });
    else out.push({ kind: "additive", where: at, message: "Property added." });
  }

  if (a.items || b.items) compareSchema(a.items, b.items, `${where}[]`, ctx, out, depth + 1);
  for (const key of ["allOf", "oneOf", "anyOf"]) {
    const la = (a[key] as unknown[] | undefined) ?? [];
    const lb = (b[key] as unknown[] | undefined) ?? [];
    for (let i = 0; i < Math.max(la.length, lb.length); i++)
      compareSchema(la[i], lb[i], `${where}<${key}[${i}]>`, ctx, out, depth + 1);
  }
}

const opKey = (method: string, path: string) =>
  `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}")}`;

function paramsOf(op: Obj, pathItem: Obj) {
  const map = new Map<string, Obj>();
  for (const p of [...((pathItem.parameters as Obj[]) ?? []), ...((op.parameters as Obj[]) ?? [])]) {
    if (isObj(p)) map.set(`${p.in}:${p.name}`, p);
  }
  return map;
}

function compareContent(a: Obj, b: Obj, where: string, ctx: Ctx, out: Change[]) {
  for (const type of Object.keys(a)) {
    if (!(type in b)) {
      out.push({ kind: "breaking", where, message: `Media type ${type} removed.` });
      continue;
    }
    compareSchema(asObj(a[type]).schema, asObj(b[type]).schema, `${where} ${type}`, ctx, out);
  }
  for (const type of Object.keys(b)) {
    if (!(type in a)) out.push({ kind: "additive", where, message: `Media type ${type} added.` });
  }
}

export function diffSpecs(baseDoc: OpenApiDoc, headDoc: OpenApiDoc): Change[] {
  const base = derefInternal(baseDoc as Obj) as OpenApiDoc;
  const head = derefInternal(headDoc as Obj) as OpenApiDoc;
  const out: Change[] = [];

  const baseOps = new Map(listOperations(base).map((o) => [opKey(o.method, o.path), o]));
  const headOps = new Map(listOperations(head).map((o) => [opKey(o.method, o.path), o]));

  for (const [key, b] of baseOps) {
    const where = `${b.method.toUpperCase()} ${b.path}`;
    const h = headOps.get(key);
    if (!h) {
      out.push({
        kind: "breaking",
        where,
        message: "Operation removed.",
        removedWithoutDeprecation: !b.op.deprecated,
      });
      continue;
    }
    if (!b.op.deprecated && h.op.deprecated)
      out.push({ kind: "deprecation", where, message: "Operation marked deprecated." });
    if (docsChanged(b.op, h.op) || JSON.stringify(b.op.tags) !== JSON.stringify(h.op.tags))
      out.push({ kind: "docs", where, message: "Summary, description or tags changed." });
    if (JSON.stringify(b.op.security) !== JSON.stringify(h.op.security))
      out.push({ kind: "breaking", where, message: "Security requirements changed." });

    const pa = paramsOf(b.op, b.pathItem);
    const pb = paramsOf(h.op, h.pathItem);
    for (const [k, p] of pa) {
      const at = `${where} param ${p.name} (${p.in})`;
      const q = pb.get(k);
      if (!q) {
        out.push({ kind: "breaking", where: at, message: "Parameter removed.", removedWithoutDeprecation: !p.deprecated });
        continue;
      }
      if (!p.required && q.required)
        out.push({ kind: "breaking", where: at, message: "Optional parameter is now required." });
      if (!p.deprecated && q.deprecated)
        out.push({ kind: "deprecation", where: at, message: "Parameter marked deprecated." });
      if (docsChanged(p, q)) out.push({ kind: "docs", where: at, message: "Description changed." });
      compareSchema(p.schema, q.schema, at, "request", out);
    }
    for (const [k, q] of pb) {
      if (pa.has(k)) continue;
      const at = `${where} param ${q.name} (${q.in})`;
      out.push(
        q.required
          ? { kind: "breaking", where: at, message: "New required parameter." }
          : { kind: "additive", where: at, message: "Optional parameter added." },
      );
    }

    const ba = asObj(b.op.requestBody);
    const bb = asObj(h.op.requestBody);
    const bodyWhere = `${where} request body`;
    if (b.op.requestBody && !h.op.requestBody)
      out.push({ kind: "breaking", where: bodyWhere, message: "Request body removed." });
    else if (!b.op.requestBody && h.op.requestBody)
      out.push(
        bb.required
          ? { kind: "breaking", where: bodyWhere, message: "Required request body added." }
          : { kind: "additive", where: bodyWhere, message: "Optional request body added." },
      );
    else if (b.op.requestBody) {
      if (!ba.required && bb.required)
        out.push({ kind: "breaking", where: bodyWhere, message: "Request body is now required." });
      compareContent(asObj(ba.content), asObj(bb.content), bodyWhere, "request", out);
    }

    const ra = asObj(b.op.responses);
    const rb = asObj(h.op.responses);
    for (const code of Object.keys(ra)) {
      const at = `${where} ${code} response`;
      if (!(code in rb)) {
        out.push({ kind: code.startsWith("2") ? "breaking" : "additive", where: at, message: "Response removed." });
        continue;
      }
      if (docsChanged(asObj(ra[code]), asObj(rb[code])))
        out.push({ kind: "docs", where: at, message: "Description changed." });
      compareContent(asObj(asObj(ra[code]).content), asObj(asObj(rb[code]).content), at, "response", out);
    }
    for (const code of Object.keys(rb)) {
      if (!(code in ra)) out.push({ kind: "additive", where: `${where} ${code} response`, message: "Response added." });
    }
  }
  for (const [key, h] of headOps) {
    if (!baseOps.has(key))
      out.push({ kind: "additive", where: `${h.method.toUpperCase()} ${h.path}`, message: "Operation added." });
  }

  if (docsChanged(asObj(base.info), asObj(head.info)))
    out.push({ kind: "docs", where: "info", message: "API description changed." });
  if (JSON.stringify(base.servers) !== JSON.stringify(head.servers))
    out.push({ kind: "docs", where: "servers", message: "Server list changed." });

  return out;
}

const bumpRank: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };

export function requiredBump(changes: Change[], baseVersion: string): Bump {
  const zeroMajor = semver.valid(baseVersion) ? semver.major(baseVersion) === 0 : false;
  if (changes.some((c) => c.kind === "breaking")) return zeroMajor ? "minor" : "major";
  if (changes.some((c) => c.kind === "additive" || c.kind === "deprecation")) return zeroMajor ? "patch" : "minor";
  if (changes.length) return "patch";
  return "none";
}

export function declaredBump(baseVersion: string, headVersion: string): Bump | "invalid" | "lower" {
  if (!semver.valid(baseVersion) || !semver.valid(headVersion)) return "invalid";
  if (semver.lte(headVersion, baseVersion)) return semver.eq(headVersion, baseVersion) ? "none" : "lower";
  const d = semver.diff(baseVersion, headVersion);
  if (d === "major" || d === "premajor") return "major";
  if (d === "minor" || d === "preminor") return "minor";
  return "patch";
}

export function suggestVersion(baseVersion: string, bump: Bump) {
  if (bump === "none" || !semver.valid(baseVersion)) return baseVersion;
  return semver.inc(baseVersion, bump) ?? baseVersion;
}

export type BumpCheck = {
  ok: boolean;
  required: Bump;
  declared: Bump | "invalid" | "lower";
  suggested: string;
  problems: string[];
};

export function checkVersionBump(baseVersion: string, headVersion: string, changes: Change[]): BumpCheck {
  const required = requiredBump(changes, baseVersion);
  const declared = declaredBump(baseVersion, headVersion);
  const suggested = suggestVersion(baseVersion, required);
  const problems: string[] = [];

  if (declared === "invalid") {
    problems.push(`info.version must be semver (got "${headVersion}").`);
  } else if (declared === "lower") {
    problems.push(`info.version ${headVersion} is lower than ${baseVersion}.`);
  } else if (required !== "none" && bumpRank[declared] < bumpRank[required]) {
    problems.push(
      `Declared ${headVersion} (${declared === "none" ? "unchanged" : declared}) but the changes require a ${required} bump: use ${suggested}.`,
    );
  }
  const undeprecated = changes.filter((c) => c.removedWithoutDeprecation);
  if (undeprecated.length) {
    problems.push(
      `${undeprecated.length} removal${undeprecated.length > 1 ? "s were" : " was"} not deprecated in ${baseVersion} first: ${undeprecated
        .slice(0, 3)
        .map((c) => c.where)
        .join("; ")}${undeprecated.length > 3 ? "; …" : ""}.`,
    );
  }
  return { ok: problems.length === 0, required, declared, suggested, problems };
}

export function changelogMarkdown(slug: string, version: string, changes: Change[]) {
  const sections: [ChangeKind, string][] = [
    ["breaking", "Breaking"],
    ["additive", "Added"],
    ["deprecation", "Deprecated"],
    ["docs", "Documentation"],
  ];
  const lines = [`## ${slug} ${version}`];
  for (const [kind, title] of sections) {
    const items = changes.filter((c) => c.kind === kind);
    if (!items.length) continue;
    lines.push("", `### ${title}`, ...items.map((c) => `- \`${c.where}\`: ${c.message}`));
  }
  if (lines.length === 1) lines.push("", "No API changes.");
  return lines.join("\n");
}
