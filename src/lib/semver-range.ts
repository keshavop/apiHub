import semver from "semver";

/** Whether a partner grant's range (e.g. ^2.0.0, 2.2.x, *) covers a released version. */
export function rangeAllows(range: string, version: string) {
  if (range.trim() === "*" || range.trim() === "") return true;
  return semver.satisfies(version, range, { includePrerelease: true });
}
