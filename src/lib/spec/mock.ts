import { sample } from "openapi-sampler";
import { listOperations, matchPath, type OpenApiDoc } from "./ops";

type Obj = Record<string, unknown>;

export type MockResult = {
  status: number;
  contentType: string | null;
  body: unknown;
  headers?: Record<string, string>;
};

function resolveRef(doc: OpenApiDoc, node: unknown): Obj {
  let cur = node as Obj | undefined;
  for (let i = 0; i < 10 && cur && typeof cur.$ref === "string"; i++) {
    const parts = (cur.$ref as string).replace(/^#\//, "").split("/");
    cur = parts.reduce<unknown>((acc, p) => (acc as Obj | undefined)?.[p], doc) as Obj | undefined;
  }
  return cur ?? {};
}

/**
 * Answers a request from the spec alone: the first 2xx response (or the code asked for
 * with `Prefer: code=404`), using its example if there is one, else a generated sample.
 */
export function mockResponse(
  doc: OpenApiDoc,
  method: string,
  path: string,
  preferCode?: string | null,
): MockResult {
  const ops = listOperations(doc).filter((o) => o.method === method.toLowerCase());
  // Prefer literal path segments over templated ones (`/payments/search` before `/payments/{id}`).
  const ranked = ops
    .map((o) => ({ o, params: matchPath(o.path, path) }))
    .filter((m) => m.params)
    .sort((a, b) => (a.o.path.match(/\{/g)?.length ?? 0) - (b.o.path.match(/\{/g)?.length ?? 0));
  const match = ranked[0]?.o;
  if (!match) {
    const pathExists = listOperations(doc).some((o) => matchPath(o.path, path));
    return pathExists
      ? { status: 405, contentType: "application/json", body: { error: `Method ${method} not defined for ${path}` } }
      : { status: 404, contentType: "application/json", body: { error: `No operation matches ${path}` } };
  }

  const responses = (match.op.responses ?? {}) as Obj;
  const codes = Object.keys(responses);
  const code =
    (preferCode && codes.includes(preferCode) ? preferCode : null) ??
    codes.find((c) => /^2\d\d$/.test(c)) ??
    codes.find((c) => c === "default") ??
    codes[0];
  if (!code) return { status: 204, contentType: null, body: null };

  const response = resolveRef(doc, responses[code]);
  const content = (response.content ?? {}) as Obj;
  const contentType =
    Object.keys(content).find((t) => t.includes("json")) ?? Object.keys(content)[0] ?? null;
  const status = code === "default" ? 200 : Number(code);
  if (!contentType) return { status, contentType: null, body: null };

  const media = content[contentType] as Obj;
  let body: unknown;
  if (media.example !== undefined) body = media.example;
  else if (media.examples && typeof media.examples === "object") {
    const first = Object.values(media.examples as Obj)[0];
    body = resolveRef(doc, first).value;
  }
  if (body === undefined && media.schema) {
    body = sample(media.schema as never, { skipWriteOnly: true, quiet: true }, doc);
  }
  return { status, contentType, body: body ?? null, headers: { "x-apihub-mock": "true" } };
}
