"use client";

import { useRouter } from "next/navigation";

export type VersionOption = { value: string; label: string };

export function VersionSelect({ slug, current, options }: { slug: string; current: string; options: VersionOption[] }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Version</span>
      <select
        value={current}
        onChange={(e) => router.push(`/apis/${slug}/${e.target.value}`)}
        className="h-9 rounded-md border border-line bg-bg px-2 font-mono text-[13px] text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
