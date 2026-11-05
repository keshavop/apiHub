import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 font-medium whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none";
const variants = {
  primary: "bg-accent text-on-accent font-semibold hover:opacity-90",
  secondary: "border border-line bg-surface text-fg hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "border border-del/40 bg-del-bg text-del hover:opacity-90",
};
type Variant = keyof typeof variants;

export function buttonClass(variant: Variant = "secondary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({ variant = "secondary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const tones = {
  neutral: "border border-line text-muted",
  accent: "bg-accent-soft text-accent",
  green: "bg-post-bg text-post",
  orange: "bg-put-bg text-put",
  red: "bg-del-bg text-del",
  blue: "bg-get-bg text-get",
  purple: "bg-patch-bg text-patch",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", mono = false, children }: { tone?: Tone; mono?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${mono ? "font-mono" : ""} ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`} {...props} />;
}

export function CardHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-bg px-3 text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone = "accent", children }: { tone?: "accent" | "green" | "red" | "orange"; children: ReactNode }) {
  const t = { accent: "bg-accent-soft text-accent", green: "bg-post-bg text-post", red: "bg-del-bg text-del", orange: "bg-put-bg text-put" }[tone];
  return <div role="status" className={`rounded-lg px-4 py-3 ${t}`}>{children}</div>;
}

const methodTone: Record<string, string> = {
  GET: "text-get bg-get-bg",
  POST: "text-post bg-post-bg",
  PUT: "text-put bg-put-bg",
  PATCH: "text-patch bg-patch-bg",
  DELETE: "text-del bg-del-bg",
};

export function Method({ method }: { method: string }) {
  const m = method.toUpperCase();
  return <span className={`inline-block w-16 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold ${methodTone[m] ?? "bg-surface-2 text-muted"}`}>{m}</span>;
}

export function lifecycleTone(lifecycle: string): Tone {
  return ({ published: "green", draft: "orange", deprecated: "red", retired: "neutral" } as const)[lifecycle as "draft"] ?? "neutral";
}

export function relativeTime(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return date.toISOString().slice(0, 10);
}
