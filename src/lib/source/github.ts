import "server-only";
import { Octokit } from "@octokit/rest";
import type { ChangeRequest, SpecSource } from "./types";

export class GitHubSource implements SpecSource {
  readonly kind = "github" as const;
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private blobCache = new Map<string, string>();

  constructor(fullName: string, token: string, readonly defaultBranch: string) {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) throw new Error(`GITHUB_REPO must be owner/name (got "${fullName}")`);
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: token, userAgent: "apiHub" });
  }

  get label() {
    return `${this.owner}/${this.repo} @ ${this.defaultBranch}`;
  }

  get repoUrl() {
    return `https://github.com/${this.owner}/${this.repo}`;
  }

  async resolve(ref: string) {
    const { data } = await this.octokit.repos.getCommit({ owner: this.owner, repo: this.repo, ref });
    return data.sha;
  }

  private trees = new Map<string, { path: string; sha: string }[]>();

  private async tree(sha: string) {
    if (!this.trees.has(sha)) {
      const { data } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: sha,
        recursive: "true",
      });
      this.trees.set(
        sha,
        data.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path!, sha: t.sha! })),
      );
    }
    return this.trees.get(sha)!;
  }

  async listFiles(sha: string) {
    return (await this.tree(sha)).map((t) => t.path);
  }

  async readFile(sha: string, path: string) {
    const entry = (await this.tree(sha)).find((t) => t.path === path);
    if (!entry) return null;
    if (!this.blobCache.has(entry.sha)) {
      const { data } = await this.octokit.git.getBlob({
        owner: this.owner,
        repo: this.repo,
        file_sha: entry.sha,
      });
      this.blobCache.set(entry.sha, Buffer.from(data.content, "base64").toString("utf8"));
    }
    return this.blobCache.get(entry.sha)!;
  }

  async listTags() {
    const tags = await this.octokit.paginate(this.octokit.repos.listTags, {
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
    });
    return tags.map((t) => ({ name: t.name, sha: t.commit.sha }));
  }

  async proposeChange(req: ChangeRequest) {
    const { owner, repo } = this;
    const baseSha = await this.resolve(req.baseBranch);
    const { data: baseCommit } = await this.octokit.git.getCommit({ owner, repo, commit_sha: baseSha });
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.tree.sha,
      tree: req.files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    });
    const { data: commit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message: `${req.title}\n\n${req.body}`,
      tree: tree.sha,
      parents: [baseSha],
      author: { name: req.authorName, email: req.authorEmail },
    });
    await this.octokit.git.createRef({ owner, repo, ref: `refs/heads/${req.branch}`, sha: commit.sha });
    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo,
      head: req.branch,
      base: req.baseBranch,
      title: req.title,
      body: req.body,
    });
    return { branch: req.branch, url: pr.html_url, number: pr.number };
  }

  async setStatus(sha: string, ok: boolean, description: string, targetUrl?: string) {
    await this.octokit.repos.createCommitStatus({
      owner: this.owner,
      repo: this.repo,
      sha,
      state: ok ? "success" : "failure",
      context: "apihub/semver",
      description: description.slice(0, 140),
      target_url: targetUrl,
    });
  }
}
