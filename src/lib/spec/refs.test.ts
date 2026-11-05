import { describe, expect, it } from "vitest";
import { bundleExternalRefs } from "./refs";
import { rangeAllows } from "../semver-range";

const files: Record<string, string> = {
  "apis/a/openapi.yaml": `openapi: 3.1.0
info: { title: A, version: 1.0.0 }
paths: {}
components:
  schemas:
    Local: { type: string }
    Price: { $ref: "../../domains/common.yaml#/Money" }
    Ref: { $ref: "#/components/schemas/Local" }
`,
  "domains/common.yaml": `Money:
  type: object
  properties:
    currency: { $ref: "#/Currency" }
Currency: { type: string, example: EUR }
`,
};

describe("bundleExternalRefs", () => {
  it("inlines other files, resolves their internal refs, keeps root refs", async () => {
    const doc = (await bundleExternalRefs("apis/a/openapi.yaml", async (p) => files[p] ?? null)) as any;
    expect(doc.components.schemas.Price.properties.currency).toEqual({ type: "string", example: "EUR" });
    expect(doc.components.schemas.Ref).toEqual({ $ref: "#/components/schemas/Local" });
  });
  it("fails clearly on a missing file", async () => {
    await expect(bundleExternalRefs("apis/a/openapi.yaml", async (p) => (p.startsWith("apis") ? files[p] : null))).rejects.toThrow(
      "domains/common.yaml",
    );
  });
});

describe("partner grant ranges", () => {
  it("matches semver ranges", () => {
    expect(rangeAllows("^2.0.0", "2.3.0")).toBe(true);
    expect(rangeAllows("^2.0.0", "3.0.0")).toBe(false);
    expect(rangeAllows("2.2.x", "2.3.0")).toBe(false);
    expect(rangeAllows("*", "9.9.9")).toBe(true);
  });
});
