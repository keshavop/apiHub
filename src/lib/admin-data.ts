import "server-only";
import semver from "semver";
import type { ApiOption } from "@/components/admin/forms";
import { db } from "./db";

/** APIs that may be granted to partners (anything not marked internal). */
export async function shareableApiOptions(): Promise<ApiOption[]> {
  const apis = await db.api.findMany({
    where: { NOT: { visibility: "internal" } },
    include: { versions: { where: { channel: "release" }, select: { version: true } } },
    orderBy: { title: "asc" },
  });
  return apis.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    visibility: a.visibility,
    versions: a.versions.map((v) => v.version).sort(semver.rcompare),
  }));
}
