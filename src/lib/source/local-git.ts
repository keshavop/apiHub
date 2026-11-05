import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ChangeRequest, SpecSource } from "./types";

const run = promisify(execFile);

/** A git repository on disk. Branches stand in for pull requests. */
export class LocalGitSource implements SpecSource {
  readonly kind = "local-git" as const;
  readonly dir: string;
  constructor(dir: string, readonly defaultBranch: string) {
    this.dir = resolve(dir);
  }

  get label() {
    return `${this.dir} @ ${this.defaultBranch}`;
  }

  private async git(args: string[], cwd = this.dir) {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  }

  async resolve(ref: string) {
    return (await this.git(["rev-parse", "--verify", `${ref}^{commit}`])).trim();
  }

  async listFiles(sha: string) {
    return (await this.git(["ls-tree", "-r", "--name-only", sha])).split("\n").filter(Boolean);
  }

  async readFile(sha: string, path: string) {
    try {
      return await this.git(["show", `${sha}:${path}`]);
    } catch {
      return null;
    }
  }

  async listTags() {
    const out = await this.git(["for-each-ref", "refs/tags", "--format=%(refname:short) %(*objectname)%(objectname)"]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, shas] = line.split(" ");
        // Annotated tags print the peeled commit first; lightweight ones only the object.
        return { name, sha: shas.slice(0, 40) };
      });
  }

  async proposeChange(req: ChangeRequest) {
    // Work in a temporary worktree so the source checkout is never touched.
    const work = await mkdtemp(join(tmpdir(), "apihub-change-"));
    let committed = false;
    try {
      await this.git(["worktree", "add", "-b", req.branch, work, req.baseBranch]);
      for (const f of req.files) {
        const target = join(work, f.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, f.content);
      }
      await this.git(["add", "-A"], work);
      if (!(await this.git(["status", "--porcelain"], work)).trim()) throw new Error("No changes compared to the base branch.");
      await this.git(
        ["-c", `user.name=${req.authorName}`, "-c", `user.email=${req.authorEmail}`, "commit", "-m", `${req.title}\n\n${req.body}`],
        work,
      );
      committed = true;
    } finally {
      await this.git(["worktree", "remove", "--force", work]).catch(() => {});
      await rm(work, { recursive: true, force: true });
      if (!committed) await this.git(["branch", "-D", req.branch]).catch(() => {});
    }
    return { branch: req.branch, url: null, number: null };
  }

  async setStatus() {
    // No host to report to; results are shown in apiHub only.
  }
}
