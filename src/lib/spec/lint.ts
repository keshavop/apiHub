import "server-only";
import { Document, Spectral } from "@stoplight/spectral-core";
import { Yaml } from "@stoplight/spectral-parsers";
import { truthy, pattern } from "@stoplight/spectral-functions";
import { Resolver } from "@stoplight/spectral-ref-resolver";
import { oas } from "@stoplight/spectral-rulesets";
import type { FileReader } from "./refs";

export type LintIssue = {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  path: string;
  line: number;
};

const SEVERITY = ["error", "warning", "info", "info"] as const;

const ROOT = "/repo/";

function createSpectral(read: FileReader) {
  // Only files from the same repo snapshot can be referenced; no network or disk access.
  const resolver = new Resolver({
    resolvers: {
      file: {
        async resolve(uri) {
          const path = decodeURIComponent(uri.path());
          const text = path.startsWith(ROOT) ? await read(path.slice(ROOT.length)) : null;
          if (text === null) throw new Error(`Referenced file not found: ${path.replace(ROOT, "")}`);
          return text;
        },
      },
    },
  });
  const spectral = new Spectral({ resolver });
  spectral.setRuleset({
    extends: [[oas as never, "recommended"]],
    rules: {
      "apihub-semver": {
        description: "info.version must be a semantic version.",
        message: "info.version must look like 1.2.3 (optionally -rc.1).",
        severity: "error",
        given: "$.info.version",
        then: {
          function: pattern,
          functionOptions: { match: "^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$" },
        },
      },
      "apihub-deprecated-has-sunset": {
        description: "Deprecated operations need an x-sunset date so partners can plan.",
        message: "Deprecated operation has no x-sunset date (YYYY-MM-DD).",
        severity: "warn",
        given: "$.paths[*][?(@.deprecated == true)]",
        then: { field: "x-sunset", function: truthy },
      },
      "apihub-operation-summary": {
        description: "Every operation needs a summary for the docs navigation.",
        message: "Operation has no summary.",
        severity: "warn",
        given: "$.paths[*][get,put,post,delete,patch,options,head,trace]",
        then: { field: "summary", function: truthy },
      },
    },
  });
  return spectral;
}

/** Lints the root file as written so line numbers match the editor. */
export async function lintSpec(rootPath: string, read: FileReader): Promise<LintIssue[]> {
  const yamlText = (await read(rootPath)) ?? "";
  const results = await createSpectral(read).run(new Document(yamlText, Yaml, ROOT + rootPath));
  return results
    .map((r) => ({
      severity: SEVERITY[r.severity] ?? "info",
      rule: String(r.code),
      message: r.message,
      path: r.path.join("."),
      line: r.range.start.line + 1,
    }))
    .sort((a, b) => a.line - b.line);
}
