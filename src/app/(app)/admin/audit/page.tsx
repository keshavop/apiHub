import type { Metadata } from "next";
import { AuditList } from "@/components/admin/audit-list";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
      <p className="text-muted">Sign-ins, access changes, syncs and spec proposals. Newest first, last 300 entries.</p>
      <Card>
        <AuditList rows={rows} />
      </Card>
    </>
  );
}
