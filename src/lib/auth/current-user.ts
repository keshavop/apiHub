import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { SESSION_COOKIE } from "./session";
import { hashToken } from "./tokens";

export type Role = "owner" | "admin" | "designer" | "partner";

export type CurrentUser = {
  id: string;
  kind: "staff" | "partner";
  role: Role;
  email: string | null;
  githubLogin: string | null;
  name: string | null;
  company: string | null;
  label: string;
};

/** Reads the session cookie and returns the signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status !== "active") return null;
  if (u.expiresAt && u.expiresAt < new Date()) return null;
  return {
    id: u.id,
    kind: u.kind as CurrentUser["kind"],
    role: u.role as Role,
    email: u.email,
    githubLogin: u.githubLogin,
    name: u.name,
    company: u.company,
    label: u.githubLogin ?? u.email ?? u.id,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStaff(minRole: "designer" | "admin" | "owner" = "designer") {
  const user = await requireUser();
  if (!hasRole(user, minRole)) redirect("/apis");
  return user;
}

const rank: Record<Role, number> = { partner: 0, designer: 1, admin: 2, owner: 3 };

export function hasRole(user: CurrentUser | null, minRole: Role) {
  if (!user) return false;
  if (minRole !== "partner" && user.kind !== "staff") return false;
  return rank[user.role] >= rank[minRole];
}
