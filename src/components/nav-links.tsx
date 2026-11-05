"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/apis" ? pathname === "/apis" || (pathname.startsWith("/apis/") && !pathname.startsWith("/apis/new")) : pathname.startsWith(href);
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`rounded-md px-3 py-2 ${active(l.href) ? "bg-surface-2 font-semibold text-fg" : "text-muted hover:text-fg"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
