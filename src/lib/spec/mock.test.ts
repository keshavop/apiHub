import { describe, expect, it } from "vitest";
import { mockResponse } from "./mock";
import type { OpenApiDoc } from "./ops";

const doc: OpenApiDoc = {
  openapi: "3.1.0",
  info: { title: "T", version: "1.0.0" },
  paths: {
    "/items/{id}": {
      get: {
        responses: {
          "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Item" } } } },
          "404": { description: "nope", content: { "application/json": { example: { error: "not found" } } } },
        },
      },
    },
    "/items/search": { get: { responses: { "200": { description: "ok", content: { "application/json": { example: ["search"] } } } } } },
  },
  components: { schemas: { Item: { type: "object", properties: { id: { type: "string", example: "itm_1" } } } } },
};

describe("mockResponse", () => {
  it("samples the first 2xx schema", () => {
    expect(mockResponse(doc, "GET", "/items/abc")).toMatchObject({ status: 200, body: { id: "itm_1" } });
  });
  it("honours Prefer: code=404 with its example", () => {
    expect(mockResponse(doc, "GET", "/items/abc", "404")).toMatchObject({ status: 404, body: { error: "not found" } });
  });
  it("prefers literal path segments over templates", () => {
    expect(mockResponse(doc, "GET", "/items/search").body).toEqual(["search"]);
  });
  it("answers 405 for a known path with another method and 404 for unknown paths", () => {
    expect(mockResponse(doc, "DELETE", "/items/abc").status).toBe(405);
    expect(mockResponse(doc, "GET", "/nope").status).toBe(404);
  });
});
