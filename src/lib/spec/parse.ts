import "server-only";
import SwaggerParser from "@apidevtools/swagger-parser";
import { listOperations, type OpenApiDoc } from "./ops";
import { bundleExternalRefs, type FileReader } from "./refs";

export type ParsedSpec = {
  doc: OpenApiDoc;
  version: string;
  title: string;
  oasVersion: string;
  opCount: number;
};

/** Bundles cross-file refs and validates the result against the OpenAPI schema. */
export async function parseSpec(rootPath: string, read: FileReader): Promise<ParsedSpec> {
  const doc = (await bundleExternalRefs(rootPath, read)) as OpenApiDoc;
  if (!doc.openapi && !doc.swagger) throw new Error(`${rootPath}: missing "openapi" field.`);
  // validate() mutates its input, so give it a copy.
  await SwaggerParser.validate(structuredClone(doc) as never);
  return {
    doc,
    version: String(doc.info?.version ?? "0.0.0"),
    title: String(doc.info?.title ?? rootPath),
    oasVersion: String(doc.openapi ?? doc.swagger),
    opCount: listOperations(doc).length,
  };
}

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as Error).message);
  return String(e);
}
