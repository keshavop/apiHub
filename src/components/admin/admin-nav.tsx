"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/partners", label: "Partner users" },
  { href: "/admin/staff", label: "Staff & roles" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex max-w-[230px] flex-[1_1_200px] flex-col gap-0.5">
      <div className="px-2.5 pb-2.5 text-xs font-semibold tracking-wider text-muted uppercase">Admin</div>
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-2 ${active ? "bg-surface-2 font-semibold" : "text-muted hover:text-fg"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
