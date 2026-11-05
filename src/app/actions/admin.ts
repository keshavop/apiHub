"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import semver from "semver";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/current-user";
import { issuePasswordLink, normalizeEmail } from "@/lib/auth/partner";
import { revokeAllSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { syncAll } from "@/lib/sync";

export type AdminState = { error?: string; ok?: string; link?: string } | undefined;

const rangeSchema = z
  .string()
  .trim()
  .transform((r) => r || "*")
  .refine((r) => r === "*" || semver.validRange(r) !== null, "Use a semver range such as ^2.0.0, ~1.8.0, 2.2.x or *.");

/** Reads `grant:<apiId>` checkboxes and `range:<apiId>` inputs from the partner form. */
function grantsFromForm(form: FormData) {
  const grants: { apiId: string; versionRange: string }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("grant:") || value !== "on") continue;
    const apiId = key.slice("grant:".length);
    const parsed = rangeSchema.safeParse(String(form.get(`range:${apiId}`) ?? ""));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    grants.push({ apiId, versionRange: parsed.data });
  }
  return grants;
}

function expiryFromForm(form: FormData) {
  const raw = String(form.get("expiresAt") ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T23:59:59Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid expiry date.");
  return d;
}

async function shareableApiIds() {
  const apis = await db.api.findMany({ where: { NOT: { visibility: "internal" } }, select: { id: true } });
  return new Set(apis.map((a) => a.id));
}

export async function createPartner(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireStaff("admin");
  const email = z.email().safeParse(normalizeEmail(String(form.get("email") ?? "")));
  if (!email.success) return { error: "Enter a valid email address." };
  let grants, expiresAt;
  try {
    grants = grantsFromForm(form);
    expiresAt = expiryFromForm(form);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const shareable = await shareableApiIds();
  grants = grants.filter((g) => shareable.has(g.apiId));
  if (!grants.length) return { error: "Pick at least one API spec this email can open." };
  if (await db.user.findUnique({ where: { email: email.data } })) return { error: "A user with this email already exists." };

  const user = await db.user.create({
    data: {
      kind: "partner",
      role: "partner",
      email: email.data,
      company: String(form.get("company") ?? "").trim() || null,
      status: "invited",
      expiresAt,
      grants: { create: grants },
    },
  });
  await audit(admin, "partner.create", email.data, grants.map((g) => `${g.apiId}:${g.versionRange}`).join(", "));
  revalidatePath("/admin/partners");
  if (form.get("sendLink") === "on") {
    const { link, delivered } = await issuePasswordLink(user.id, "set");
    return {
      ok: delivered
        ? `Created ${email.data} and emailed a set-password link.`
        : `Created ${email.data}. Email isn't configured, so send them this one-time link yourself:`,
      link: delivered ? undefined : link,
    };
  }
  return { ok: `Created ${email.data}. Send a set-password link from their page when ready.` };
}

export async function updatePartner(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireStaff("admin");
  const id = String(form.get("id"));
  const user = await db.user.findUnique({ where: { id }, include: { grants: true } });
  if (!user || user.kind !== "partner") return { error: "Partner not found." };
  let grants, expiresAt;
  try {
    grants = grantsFromForm(form);
    expiresAt = expiryFromForm(form);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const shareable = await shareableApiIds();
  grants = grants.filter((g) => shareable.has(g.apiId));

  await db.$transaction([
    db.apiGrant.deleteMany({ where: { userId: id } }),
    ...grants.map((g) => db.apiGrant.create({ data: { userId: id, ...g } })),
    db.user.update({
      where: { id },
      data: { company: String(form.get("company") ?? "").trim() || null, expiresAt },
    }),
  ]);
  await audit(admin, "partner.update_access", user.email ?? id, grants.map((g) => `${g.apiId}:${g.versionRange}`).join(", ") || "no APIs");
  revalidatePath(`/admin/partners/${id}`);
  return { ok: "Access saved. It applies on the partner's next request." };
}

export async function sendPartnerLink(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireStaff("admin");
  const id = String(form.get("id"));
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.kind !== "partner") return { error: "Partner not found." };
  const purpose = user.passwordHash ? "reset" : "set";
  const { link, delivered } = await issuePasswordLink(id, purpose);
  await audit(admin, `partner.${purpose}_link`, user.email ?? id);
  return delivered
    ? { ok: `Emailed a ${purpose === "set" ? "set-password" : "reset"} link to ${user.email}.` }
    : { ok: "Email isn't configured. Send this one-time link (valid 72 h) yourself:", link };
}

export async function setPartnerStatus(form: FormData) {
  const admin = await requireStaff("admin");
  const id = String(form.get("id"));
  const disable = form.get("action") === "disable";
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.kind !== "partner") return;
  await db.user.update({
    where: { id },
    data: { status: disable ? "disabled" : user.passwordHash ? "active" : "invited", lockedUntil: null, failedLogins: 0 },
  });
  if (disable) await revokeAllSessions(id);
  await audit(admin, disable ? "partner.disable" : "partner.enable", user.email ?? id);
  revalidatePath(`/admin/partners/${id}`);
}

export async function deletePartner(form: FormData) {
  const admin = await requireStaff("admin");
  const id = String(form.get("id"));
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.kind !== "partner") return;
  await db.user.delete({ where: { id } });
  await audit(admin, "partner.delete", user.email ?? id);
  redirect("/admin/partners");
}

const roleSchema = z.enum(["owner", "admin", "designer"]);

export async function addStaff(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireStaff("admin");
  const login = String(form.get("githubLogin") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(login)) return { error: "Enter a GitHub username." };
  const role = roleSchema.safeParse(form.get("role"));
  if (!role.success) return { error: "Pick a role." };
  if (role.data === "owner" && admin.role !== "owner") return { error: "Only owners can add owners." };
  if (await db.user.findUnique({ where: { githubLogin: login } })) return { error: `@${login} is already staff.` };
  await db.user.create({ data: { kind: "staff", role: role.data, githubLogin: login, status: "active" } });
  await audit(admin, "staff.add", login, role.data);
  revalidatePath("/admin/staff");
  return { ok: `@${login} can now sign in with GitHub as ${role.data}.` };
}

export async function updateStaff(form: FormData) {
  const admin = await requireStaff("admin");
  const id = String(form.get("id"));
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.kind !== "staff" || user.id === admin.id) return;
  if ((user.role === "owner" || form.get("role") === "owner") && admin.role !== "owner") return;
  if (form.get("action") === "remove") {
    await db.user.delete({ where: { id } });
    await audit(admin, "staff.remove", user.githubLogin ?? id);
  } else {
    const role = roleSchema.parse(form.get("role"));
    await db.user.update({ where: { id }, data: { role } });
    await revokeAllSessions(id);
    await audit(admin, "staff.role", user.githubLogin ?? id, role);
  }
  revalidatePath("/admin/staff");
}

export async function runSync(): Promise<AdminState> {
  const admin = await requireStaff("designer");
  const summary = await syncAll("manual");
  await audit(admin, "sync.manual", "", summary.message);
  revalidatePath("/", "layout");
  return summary.ok ? { ok: `Synced: ${summary.message}.` } : { error: summary.errors.join("\n") || summary.message };
}
