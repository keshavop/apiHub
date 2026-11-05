/**
 * Runs the apihub/semver gate locally: pnpm check:semver <head-branch> [base-branch]
 * Exits non-zero when a changed API declares too small a version bump.
 */
import "dotenv/config";
import { checkChange } from "@/lib/pr-check";

const [head, base = process.env.SPEC_DEFAULT_BRANCH || "main"] = process.argv.slice(2);
if (!head) {
  console.error("usage: pnpm check:semver <head-branch> [base-branch]");
  process.exit(2);
}
checkChange(head, base).then((r) => {
  for (const a of r.results) {
    const verdict = a.error ? `error: ${a.error}` : a.check ? (a.check.ok ? "ok" : a.check.problems.join(" ")) : "first release";
    console.log(`${a.check?.ok === false || a.error ? "✗" : "✓"} ${a.slug} ${a.version ?? ""} vs ${a.against ?? "-"}: ${verdict}`);
  }
  console.log(r.summary);
  process.exit(r.ok ? 0 : 1);
});
