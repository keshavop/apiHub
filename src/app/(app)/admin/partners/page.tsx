import type { Metadata } from "next";
import Link from "next/link";
import { CreatePartnerForm } from "@/components/admin/forms";
import { Badge, Card, CardHeader, relativeTime } from "@/components/ui";
import { partnerStatus } from "@/lib/partner-status";
import { shareableApiOptions } from "@/lib/admin-data";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Partner users" };

export default async function PartnersPage() {
  const [users, apis] = await Promise.all([
    db.user.findMany({
      where: { kind: "partner" },
      include: { grants: { include: { api: true } } },
      orderBy: { createdAt: "desc" },
    }),
    shareableApiOptions(),
  ]);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Partner users</h1>
        <p className="text-muted">
          Partners sign in with email and password. Each email sees only the API specs and version ranges listed here. Any other spec URL returns 404.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a partner user" />
        <CreatePartnerForm apis={apis} />
      </Card>

      <Card>
        <CardHeader title={`All partner users (${users.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 font-semibold">Email</th>
                <th className="px-5 py-2.5 font-semibold">Allowed API specs</th>
                <th className="px-5 py-2.5 font-semibold">Last sign-in</th>
                <th className="px-5 py-2.5 font-semibold">Expires</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const [label, tone] = partnerStatus(u);
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <Link href={`/admin/partners/${u.id}`} className="font-mono text-[13px] font-semibold hover:text-accent">
                        {u.email}
                      </Link>
                      <div className="text-xs text-muted">{u.company ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {u.grants.length ? u.grants.map((g) => `${g.api.slug} ${g.versionRange}`).join(", ") : <span className="text-muted">none</span>}
                    </td>
                    <td className="px-5 py-3 text-muted">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "—"}</td>
                    <td className="px-5 py-3 text-muted">{u.expiresAt ? u.expiresAt.toISOString().slice(0, 10) : "Never"}</td>
                    <td className="px-5 py-3"><Badge tone={tone}>{label}</Badge></td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-4 text-muted">No partner users yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
