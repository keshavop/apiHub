import "server-only";
import { cookies } from "next/headers";
import { db } from "../db";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "apihub_session";
const STAFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PARTNER_TTL_MS = 12 * 60 * 60 * 1000;

export async function createSession(userId: string, kind: string) {
  const token = newToken();
  const ttl = kind === "staff" ? STAFF_TTL_MS : PARTNER_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Signs a user out everywhere (used when access is revoked or the password changes). */
export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
