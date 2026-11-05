export type FileChange = { path: string; content: string };

export type ChangeRequest = {
  baseBranch: string;
  branch: string;
  title: string;
  body: string;
  files: FileChange[];
  authorName: string;
  authorEmail: string;
};

export type ChangeResult = { branch: string; url: string | null; number: number | null };

/** Everything apiHub needs from the repository that hosts the specs. */
export interface SpecSource {
  readonly kind: "local-git" | "github";
  readonly label: string;
  readonly defaultBranch: string;
  /** Commit sha for a branch or tag name. */
  resolve(ref: string): Promise<string>;
  /** All file paths at a commit. */
  listFiles(sha: string): Promise<string[]>;
  readFile(sha: string, path: string): Promise<string | null>;
  listTags(): Promise<{ name: string; sha: string }[]>;
  /** Commits files to a new branch and opens a pull request when the host supports it. */
  proposeChange(req: ChangeRequest): Promise<ChangeResult>;
  /** Reports a check result on a commit (GitHub commit status). */
  setStatus(sha: string, ok: boolean, description: string, targetUrl?: string): Promise<void>;
}
