import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth/current-user";

export async function audit(
  actor: Pick<CurrentUser, "id" | "label"> | null,
  action: string,
  target = "",
  detail = "",
) {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actor: actor ? actor.label : "system",
      action,
      target,
      detail,
    },
  });
}
