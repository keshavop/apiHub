import Link from "next/link";

export function Logo({ href = "/apis" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-base font-bold">
      <span className="flex size-7 items-center justify-center rounded-md bg-accent font-mono text-[13px] text-on-accent" aria-hidden="true">
        {"{ }"}
      </span>
      apiHub
    </Link>
  );
}
