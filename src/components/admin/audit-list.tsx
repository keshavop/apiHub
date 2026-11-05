import { relativeTime } from "@/components/ui";

export function AuditList({ rows }: { rows: { id: string; actor: string; action: string; target: string; detail: string; createdAt: Date }[] }) {
  if (!rows.length) return <p className="px-5 py-3 text-muted">Nothing yet.</p>;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-1 border-b border-line px-5 py-2.5 last:border-0">
          <span className="font-medium">{r.actor}</span>
          <code className="font-mono text-xs text-accent">{r.action}</code>
          <span className="flex-[1_1_200px] text-muted">
            {r.target}
            {r.detail ? ` · ${r.detail}` : ""}
          </span>
          <span className="text-xs text-muted">{relativeTime(r.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
