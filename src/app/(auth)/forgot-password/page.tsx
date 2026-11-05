import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Reset password</h2>
        <p className="text-muted">For partner accounts. Staff sign in with GitHub.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>
    </div>
  );
}
