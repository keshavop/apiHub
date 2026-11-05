import "server-only";
import { GitHubSource } from "./github";
import { LocalGitSource } from "./local-git";
import type { SpecSource } from "./types";

let source: SpecSource | null = null;

export function getSource(): SpecSource {
  if (source) return source;
  const branch = process.env.SPEC_DEFAULT_BRANCH || "main";
  if ((process.env.SPEC_SOURCE ?? "local-git") === "github") {
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) throw new Error("SPEC_SOURCE=github needs GITHUB_REPO and GITHUB_TOKEN.");
    source = new GitHubSource(repo, token, branch);
  } else {
    source = new LocalGitSource(process.env.SPEC_REPO_PATH || "./.data/spec-repo", branch);
  }
  return source;
}

export type { SpecSource } from "./types";
