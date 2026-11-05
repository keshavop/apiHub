import "server-only";
import { db } from "../db";
import { appUrl, sendMail } from "../email";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { createSession, revokeAllSessions } from "./session";
import { hashToken, newToken } from "./tokens";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const LINK_TTL_MS = 72 * 60 * 60 * 1000;
// Verified when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$6mYu1DzH63IHZdreFG0j4A$xmoMcP5qA1WY9rRufvC0dj4PF55wnRuq0f08A5usLZ4";

const GENERIC_ERROR = "Email or password is incorrect.";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function loginPartner(rawEmail: string, password: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  if (!rateLimit(`login:${ip}`, 20, 60_000).ok || !rateLimit(`login:${email}`, 8, 60_000).ok) {
    return { error: "Too many attempts. Wait a minute and try again." };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.kind !== "partner" || !user.passwordHash) {
    await verifyPassword(DUMMY_HASH, password);
    return { error: GENERIC_ERROR };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "This account is locked for 15 minutes after repeated failed sign-ins." };
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failures = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data:
        failures >= MAX_FAILURES
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
          : { failedLogins: failures },
    });
    return { error: GENERIC_ERROR };
  }
  if (user.status !== "active") return { error: "This account is disabled. Contact your apiHub admin." };
  if (user.expiresAt && user.expiresAt < new Date()) {
    return { error: "Your access has expired. Contact your apiHub admin." };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await createSession(user.id, "partner");
  return { ok: true as const, userId: user.id, email };
}

/** Creates a single-use link and emails it. Returns the link so an admin can copy it when email isn't configured. */
export async function issuePasswordLink(userId: string, purpose: "set" | "reset") {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.passwordToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = newToken();
  await db.passwordToken.create({
    data: {
      id: hashToken(token),
      userId,
      purpose,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    },
  });
  const link = appUrl(`/set-password?token=${token}`);
  const subject = purpose === "set" ? "Your apiHub access" : "Reset your apiHub password";
  const intro =
    purpose === "set"
      ? `You have been given access to API documentation on apiHub${user.company ? ` for ${user.company}` : ""}.`
      : "Someone asked to reset the password for your apiHub account.";
  const { delivered } = await sendMail({
    to: user.email!,
    subject,
    text: `${intro}\n\nSet your password here (valid for 72 hours, works once):\n${link}\n\nSign in afterwards with ${user.email}.`,
  });
  return { link, delivered };
}

export async function findValidToken(token: string) {
  const row = await db.passwordToken.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  if (row.user.kind !== "partner" || row.user.status === "disabled") return null;
  return row;
}

export async function setPasswordWithToken(token: string, password: string) {
  const row = await findValidToken(token);
  if (!row) return { error: "This link is invalid or has expired. Ask your admin for a new one." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.passwordToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, status: "active", failedLogins: 0, lockedUntil: null },
    }),
  ]);
  await revokeAllSessions(row.userId);
  await createSession(row.userId, "partner");
  return { ok: true as const };
}

export async function requestPasswordReset(rawEmail: string, ip: string) {
  if (!rateLimit(`reset:${ip}`, 5, 60_000).ok) return;
  const user = await db.user.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (user && user.kind === "partner" && user.status === "active") {
    await issuePasswordLink(user.id, "reset");
  }
}
