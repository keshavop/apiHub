import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePartner, setPartnerStatus } from "@/app/actions/admin";
import { EditPartnerForm, SendLinkForm } from "@/components/admin/forms";
import { Badge, Button, Card, CardHeader, relativeTime } from "@/components/ui";
import { shareableApiOptions } from "@/lib/admin-data";
import { db } from "@/lib/db";
import { partnerStatus } from "@/lib/partner-status";

export const metadata: Metadata = { title: "Partner user" };

export default async function PartnerDetail({ params }: PageProps<"/admin/partners/[id]">) {
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, include: { grants: true } });
  if (!user || user.kind !== "partner") notFound();
  const [apis, activity] = await Promise.all([
    shareableApiOptions(),
    db.auditLog.findMany({
      where: { OR: [{ actorId: id }, { target: user.email ?? "" }] },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  const [label, tone] = partnerStatus(user);
  const disabled = user.status === "disabled";

  return (
    <>
      <div className="text-[13px] text-muted">
        <Link href="/admin/partners" className="hover:text-fg">Partner users</Link> / {user.email}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold">{user.email}</h1>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <span className="text-muted">
          Created {relativeTime(user.createdAt)} · last sign-in {user.lastLoginAt ? relativeTime(user.lastLoginAt) : "never"}
        </span>
      </div>

      <Card>
        <CardHeader title="Access" />
        <EditPartnerForm
          id={user.id}
          company={user.company ?? ""}
          expiresAt={user.expiresAt ? user.expiresAt.toISOString().slice(0, 10) : ""}
          apis={apis}
          grants={user.grants.map((g) => ({ apiId: g.apiId, versionRange: g.versionRange }))}
        />
      </Card>

      <div className="flex flex-wrap gap-5">
        <Card className="flex flex-[1_1_320px] flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">Password</h2>
          <p className="text-muted">
            {user.passwordHash
              ? "Send a single-use reset link. The current password keeps working until it's used."
              : "This user hasn't set a password yet. Send a new set-password link (old links stop working)."}
          </p>
          <SendLinkForm id={user.id} hasPassword={Boolean(user.passwordHash)} />
        </Card>
        <Card className="flex flex-[1_1_320px] flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">Account</h2>
          <p className="text-muted">Disabling signs the user out everywhere at once. Deleting also removes their grants.</p>
          <div className="flex flex-wrap gap-2">
            <form action={setPartnerStatus}>
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="action" value={disabled ? "enable" : "disable"} />
              <Button type="submit">{disabled ? "Enable account" : "Disable and sign out"}</Button>
            </form>
            <form action={deletePartner}>
              <input type="hidden" name="id" value={user.id} />
              <Button type="submit" variant="danger">Delete user</Button>
            </form>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Activity" />
        <ul>
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 border-b border-line px-5 py-2.5 last:border-0">
              <span className="font-medium">{a.actor}</span>
              <code className="font-mono text-xs text-accent">{a.action}</code>
              <span className="flex-1 text-muted">{a.detail}</span>
              <span className="text-xs text-muted">{relativeTime(a.createdAt)}</span>
            </li>
          ))}
          {activity.length === 0 ? <li className="px-5 py-3 text-muted">No activity yet.</li> : null}
        </ul>
      </Card>
    </>
  );
}
