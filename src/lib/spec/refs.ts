import { posix } from "node:path";
import YAML from "yaml";

type Json = unknown;
export type FileReader = (path: string) => Promise<string | null>;

function decodePointer(pointer: string) {
  return pointer
    .replace(/^#?\/?/, "")
    .split("/")
    .filter((p) => p.length > 0)
    .map((p) => decodeURIComponent(p).replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function getPointer(doc: Json, pointer: string): Json {
  let cur: Json = doc;
  for (const key of decodePointer(pointer)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, Json>)[key];
  }
  return cur;
}

export function parseYamlOrJson(text: string): Json {
  return YAML.parse(text, { maxAliasCount: 100 });
}

/**
 * Inlines `$ref`s that point at other files (e.g. `../../domains/common.yaml#/Money`)
 * so the stored document is self-contained. Refs inside the root file (`#/...`) stay
 * as they are so the docs renderer keeps showing named schemas.
 */
export async function bundleExternalRefs(rootPath: string, read: FileReader) {
  const cache = new Map<string, Json>();
  async function load(path: string) {
    if (!cache.has(path)) {
      const text = await read(path);
      if (text === null) throw new Error(`Referenced file not found: ${path}`);
      cache.set(path, parseYamlOrJson(text));
    }
    return cache.get(path);
  }

  async function walk(node: Json, file: string, depth: number): Promise<Json> {
    if (depth > 64) throw new Error(`$ref nesting too deep in ${file}`);
    if (Array.isArray(node)) return Promise.all(node.map((n) => walk(n, file, depth)));
    if (node === null || typeof node !== "object") return node;
    const obj = node as Record<string, Json>;
    if (typeof obj.$ref === "string") {
      const [refFile, pointer = ""] = obj.$ref.split("#");
      if (refFile) {
        const target = posix.normalize(posix.join(posix.dirname(file), refFile));
        const doc = await load(target);
        return walk(getPointer(doc, pointer), target, depth + 1);
      }
      if (file !== rootPath) {
        // Internal ref inside an external file: resolve it against that file.
        return walk(getPointer(await load(file), pointer), file, depth + 1);
      }
      return obj;
    }
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = await walk(v, file, depth);
    return out;
  }

  const root = await load(rootPath);
  return walk(root, rootPath, 0) as Promise<Record<string, Json>>;
}

/** Fully dereferences internal `#/` refs (cycles are cut off with an empty object). */
export function derefInternal(doc: Record<string, Json>) {
  function walk(node: Json, seen: string[]): Json {
    if (Array.isArray(node)) return node.map((n) => walk(n, seen));
    if (node === null || typeof node !== "object") return node;
    const obj = node as Record<string, Json>;
    if (typeof obj.$ref === "string" && obj.$ref.startsWith("#")) {
      if (seen.includes(obj.$ref)) return {};
      return walk(getPointer(doc, obj.$ref), [...seen, obj.$ref]);
    }
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v, seen);
    return out;
  }
  return walk(doc, []) as Record<string, Json>;
}
