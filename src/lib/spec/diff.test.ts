import { describe, expect, it } from "vitest";
import { checkVersionBump, diffSpecs, requiredBump } from "./diff";
import type { OpenApiDoc } from "./ops";

const base = (): OpenApiDoc => ({
  openapi: "3.1.0",
  info: { title: "T", version: "1.0.0" },
  paths: {
    "/items/{id}": {
      get: {
        summary: "Get item",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } },
          },
        },
      },
    },
    "/items": {
      post: {
        summary: "Create",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, note: { type: "string" } } },
            },
          },
        },
        responses: { "201": { description: "created" } },
      },
    },
  },
  components: {
    schemas: { Item: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } } },
  },
});

const kinds = (a: OpenApiDoc, b: OpenApiDoc) => diffSpecs(a, b).map((c) => c.kind);

describe("diffSpecs", () => {
  it("finds nothing between identical specs", () => {
    expect(diffSpecs(base(), base())).toEqual([]);
  });

  it("treats a removed operation as breaking and flags missing deprecation", () => {
    const head = base();
    delete head.paths!["/items"];
    const changes = diffSpecs(base(), head);
    expect(changes).toContainEqual(expect.objectContaining({ kind: "breaking", where: "POST /items", removedWithoutDeprecation: true }));
  });

  it("treats a new operation and a new response property as additive", () => {
    const head = base();
    head.paths!["/health"] = { get: { summary: "Health", responses: { "200": { description: "ok" } } } };
    (head.components!.schemas as any).Item.properties.price = { type: "integer" };
    expect(new Set(kinds(base(), head))).toEqual(new Set(["additive"]));
  });

  it("follows $refs: removing a referenced response property is breaking", () => {
    const head = base();
    delete (head.components!.schemas as any).Item.properties.name;
    expect(diffSpecs(base(), head)).toContainEqual(expect.objectContaining({ kind: "breaking", where: "GET /items/{id} 200 response application/json.name" }));
  });

  it("treats optional → required request property as breaking", () => {
    const head = base();
    (head.paths!["/items"].post as any).requestBody.content["application/json"].schema.required = ["name", "note"];
    expect(kinds(base(), head)).toContain("breaking");
  });

  it("treats a new required parameter as breaking and an optional one as additive", () => {
    const req = base();
    (req.paths!["/items/{id}"].get as any).parameters.push({ name: "x", in: "query", required: true, schema: { type: "string" } });
    expect(kinds(base(), req)).toEqual(["breaking"]);
    const opt = base();
    (opt.paths!["/items/{id}"].get as any).parameters.push({ name: "x", in: "query", schema: { type: "string" } });
    expect(kinds(base(), opt)).toEqual(["additive"]);
  });

  it("matches operations even when path parameter names change", () => {
    const head = base();
    head.paths!["/items/{itemId}"] = head.paths!["/items/{id}"];
    delete head.paths!["/items/{id}"];
    expect(diffSpecs(base(), head).filter((c) => c.where === "GET /items/{id}" && c.message === "Operation removed.")).toEqual([]);
  });

  it("classifies description-only edits as docs", () => {
    const head = base();
    (head.paths!["/items"].post as any).summary = "Create an item";
    expect(kinds(base(), head)).toEqual(["docs"]);
  });

  it("reports deprecations", () => {
    const head = base();
    (head.paths!["/items"].post as any).deprecated = true;
    expect(kinds(base(), head)).toContain("deprecation");
  });
});

describe("version bump rules", () => {
  it("maps change kinds to bumps", () => {
    expect(requiredBump([{ kind: "breaking", where: "", message: "" }], "2.0.0")).toBe("major");
    expect(requiredBump([{ kind: "additive", where: "", message: "" }], "2.0.0")).toBe("minor");
    expect(requiredBump([{ kind: "docs", where: "", message: "" }], "2.0.0")).toBe("patch");
    expect(requiredBump([], "2.0.0")).toBe("none");
  });

  it("allows breaking changes in a minor bump below 1.0.0", () => {
    expect(requiredBump([{ kind: "breaking", where: "", message: "" }], "0.4.0")).toBe("minor");
  });

  it("fails when the declared bump is too small and suggests the right version", () => {
    const r = checkVersionBump("2.3.0", "2.4.0", [{ kind: "breaking", where: "x", message: "" }]);
    expect(r.ok).toBe(false);
    expect(r.suggested).toBe("3.0.0");
  });

  it("passes a major bump once the removed item was deprecated", () => {
    const r = checkVersionBump("2.3.0", "3.0.0", [{ kind: "breaking", where: "x", message: "", removedWithoutDeprecation: false }]);
    expect(r.ok).toBe(true);
  });

  it("fails a removal that wasn't deprecated first, even with a major bump", () => {
    const r = checkVersionBump("2.3.0", "3.0.0", [{ kind: "breaking", where: "x", message: "", removedWithoutDeprecation: true }]);
    expect(r.ok).toBe(false);
  });

  it("rejects versions that go down", () => {
    expect(checkVersionBump("2.3.0", "2.2.0", []).ok).toBe(false);
  });

  it("accepts a pre-release of the next major", () => {
    expect(checkVersionBump("2.3.0", "3.0.0-rc.1", [{ kind: "breaking", where: "", message: "" }]).ok).toBe(true);
  });
});
