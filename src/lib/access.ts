import "server-only";
import semver from "semver";
import type { Api, ApiGrant, ApiVersion } from "@/generated/prisma/client";
import { db } from "./db";
import { rangeAllows } from "./semver-range";
import type { CurrentUser } from "./auth/current-user";

/**
 * Who can see what:
 * - staff: every API and every version, including the main-branch draft
 * - partner: only APIs granted to their email, only released versions inside the
 *   grant's semver range, never retired versions or APIs marked internal
 * - anonymous: released versions of APIs marked public
 */

function grantActive(g: Pick<ApiGrant, "expiresAt">) {
  return !g.expiresAt || g.expiresAt > new Date();
}

export function canSeeVersion(
  user: CurrentUser | null,
  api: Pick<Api, "visibility">,
  version: Pick<ApiVersion, "channel" | "version" | "lifecycle">,
  grant?: Pick<ApiGrant, "versionRange" | "expiresAt"> | null,
) {
  if (user?.kind === "staff") return true;
  if (version.channel !== "release" || version.lifecycle === "retired") return false;
  if (api.visibility === "public") return true;
  if (!user || api.visibility === "internal" || !grant || !grantActive(grant)) return false;
  return rangeAllows(grant.versionRange, version.version);
}

export async function grantFor(user: CurrentUser | null, apiId: string) {
  if (!user || user.kind !== "partner") return null;
  return db.apiGrant.findUnique({ where: { userId_apiId: { userId: user.id, apiId } } });
}

/** APIs the user may list, each with only the versions they may open. */
export async function visibleApis(user: CurrentUser | null) {
  const apis = await db.api.findMany({
    include: { versions: { orderBy: { createdAt: "desc" } } },
    orderBy: { title: "asc" },
  });
  const grants =
    user?.kind === "partner"
      ? new Map((await db.apiGrant.findMany({ where: { userId: user.id } })).map((g) => [g.apiId, g]))
      : new Map<string, ApiGrant>();

  return apis
    .map((api) => {
      const grant = grants.get(api.id) ?? null;
      const versions = api.versions
        .filter((v) => canSeeVersion(user, api, v, grant))
        .sort((a, b) => semver.rcompare(a.version, b.version) || (a.channel === "main" ? -1 : 1));
      return { ...api, versions, grant };
    })
    .filter((api) => api.versions.length > 0);
}

/**
 * Loads one API version if the user may open it; returns null otherwise so callers
 * answer 404 and don't reveal that an API they can't see exists.
 * `version` may be a semver, "latest" (default version) or "main" (draft, staff only).
 */
export async function loadVersion(user: CurrentUser | null, slug: string, version: string) {
  const api = await db.api.findUnique({ where: { slug }, include: { versions: true } });
  if (!api) return null;
  const grant = await grantFor(user, api.id);
  const allowed = api.versions.filter((v) => canSeeVersion(user, api, v, grant));
  if (!allowed.length) return null;

  let picked: ApiVersion | undefined;
  if (version === "main") picked = allowed.find((v) => v.channel === "main");
  else if (version === "latest") {
    const releases = allowed.filter((v) => v.channel === "release");
    picked =
      releases.find((v) => v.version === api.defaultVersion) ??
      releases.sort((a, b) => semver.rcompare(a.version, b.version))[0] ??
      allowed.find((v) => v.channel === "main");
  } else {
    picked = allowed.find((v) => v.channel === "release" && v.version === version);
  }
  if (!picked) return null;
  return { api, version: picked, allowed, grant };
}
