import "server-only";
import { db } from "../db";

export function githubLoginEnabled() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function devLoginEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true";
}

const bootstrapOwners = () =>
  (process.env.BOOTSTRAP_OWNER_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export async function exchangeCode(code: string) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("GitHub did not return an access token");
  const me = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github+json" },
  });
  if (!me.ok) throw new Error(`GitHub /user failed: ${me.status}`);
  return (await me.json()) as { login: string; name: string | null; email: string | null };
}

/**
 * Staff must already exist (added by an admin) or be listed in BOOTSTRAP_OWNER_LOGINS.
 * Anyone else with a GitHub account is turned away.
 */
export async function staffUserForGitHub(gh: { login: string; name: string | null }) {
  const login = gh.login.toLowerCase();
  const existing = await db.user.findFirst({ where: { githubLogin: login, kind: "staff" } });
  if (existing) {
    if (existing.status === "disabled") return null;
    return db.user.update({
      where: { id: existing.id },
      data: { status: "active", name: existing.name ?? gh.name },
    });
  }
  if (!bootstrapOwners().includes(login)) return null;
  return db.user.create({
    data: { kind: "staff", role: "owner", githubLogin: login, name: gh.name, status: "active" },
  });
}
