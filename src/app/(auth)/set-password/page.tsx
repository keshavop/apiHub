import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/forms";
import { findValidToken } from "@/lib/auth/partner";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const { token } = await searchParams;
  const row = typeof token === "string" ? await findValidToken(token) : null;
  if (!row) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Link expired</h2>
        <p className="text-muted">This link is invalid, already used or older than 72 hours. Ask your apiHub admin for a new one, or request a reset.</p>
        <Link href="/forgot-password" className="text-accent hover:underline">Reset password</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">{row.purpose === "set" ? "Set your password" : "Choose a new password"}</h2>
        <p className="text-muted">
          For <span className="font-mono text-fg">{row.user.email}</span>
        </p>
      </div>
      <SetPasswordForm token={token as string} email={row.user.email ?? ""} />
    </div>
  );
}
