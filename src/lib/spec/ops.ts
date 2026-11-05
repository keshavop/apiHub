export const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export type OpenApiDoc = {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: { url: string }[];
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
  tags?: { name: string }[];
  [k: string]: unknown;
};

export type Operation = {
  method: string;
  path: string;
  op: Record<string, unknown>;
  pathItem: Record<string, unknown>;
};

export function listOperations(doc: OpenApiDoc): Operation[] {
  const out: Operation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (op && typeof op === "object") {
        out.push({ method, path, op: op as Record<string, unknown>, pathItem: item });
      }
    }
  }
  return out;
}

/** `/payments/{id}` matches `/payments/pay_123`. Returns path params or null. */
export function matchPath(template: string, actual: string): Record<string, string> | null {
  const t = template.split("/").filter(Boolean);
  const a = actual.split("/").filter(Boolean);
  if (t.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const m = /^\{(.+)\}$/.exec(t[i]);
    if (m) params[m[1]] = decodeURIComponent(a[i]);
    else if (t[i] !== a[i]) return null;
  }
  return params;
}
