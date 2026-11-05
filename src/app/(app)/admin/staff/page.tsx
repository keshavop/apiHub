import type { Metadata } from "next";
import { updateStaff } from "@/app/actions/admin";
import { AddStaffForm } from "@/components/admin/forms";
import { Badge, Card, CardHeader, relativeTime } from "@/components/ui";
import { requireStaff } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Staff" };

const ROLES = [
  { role: "owner", can: "Everything, including managing owners." },
  { role: "admin", can: "Partner users and their API access, staff, sync, audit log." },
  { role: "designer", can: "Edit specs and open pull requests; see every API and draft." },
  { role: "partner", can: "Email + password. Docs, Try it, mock and downloads for granted specs only." },
];

export default async function StaffPage() {
  const me = await requireStaff("admin");
  const staff = await db.user.findMany({ where: { kind: "staff" }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Staff & roles</h1>
      <Card>
        <CardHeader title="Add staff" />
        <p className="px-5 pt-4 text-muted">Staff sign in with GitHub. Only usernames listed here (or in BOOTSTRAP_OWNER_LOGINS) are let in.</p>
        <AddStaffForm canAddOwner={me.role === "owner"} />
      </Card>
      <Card>
        <CardHeader title={`Staff (${staff.length})`} />
        <ul>
          {staff.map((s) => {
            const locked = s.id === me.id || (s.role === "owner" && me.role !== "owner");
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="flex-[1_1_200px] font-mono font-semibold">@{s.githubLogin}</span>
                <span className="text-xs text-muted">{s.lastLoginAt ? `signed in ${relativeTime(s.lastLoginAt)}` : "never signed in"}</span>
                {locked ? (
                  <Badge tone="accent">{s.role}{s.id === me.id ? " (you)" : ""}</Badge>
                ) : (
                  <form action={updateStaff} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <select name="role" defaultValue={s.role} aria-label={`Role for ${s.githubLogin}`} className="h-9 rounded-md border border-line bg-bg px-2">
                      <option value="designer">designer</option>
                      <option value="admin">admin</option>
                      {me.role === "owner" ? <option value="owner">owner</option> : null}
                    </select>
                    <button name="action" value="role" className="h-9 rounded-md border border-line px-3 font-medium hover:bg-surface-2">Save</button>
                    <button name="action" value="remove" className="h-9 rounded-md px-3 font-medium text-del hover:bg-del-bg">Remove</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <CardHeader title="What each role can do" />
        <ul>
          {ROLES.map((r) => (
            <li key={r.role} className="flex gap-4 border-b border-line px-5 py-3 last:border-0">
              <span className="w-24 shrink-0 font-semibold">{r.role}</span>
              <span className="text-muted">{r.can}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
