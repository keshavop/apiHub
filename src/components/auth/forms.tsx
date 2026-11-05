"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, partnerSignIn, setPassword, type FormState } from "@/app/actions/auth";
import { Field, Notice, buttonClass, inputClass } from "@/components/ui";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <Notice tone="red">{state.error}</Notice>;
  if (state?.ok) return <Notice tone="green">{state.ok}</Notice>;
  return null;
}

export function PartnerSignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(partnerSignIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required className={inputClass} placeholder="you@partner-company.com" />
      </Field>
      <label className="flex flex-col gap-1.5 font-medium">
        <span className="flex items-baseline justify-between">
          Password
          <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
            Forgot password?
          </Link>
        </span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <Status state={state} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "h-11")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <Field label="New password" hint="At least 12 characters. A passphrase works well.">
        <input name="password" type="password" autoComplete="new-password" minLength={12} required className={inputClass} />
      </Field>
      <Field label="Confirm password">
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required className={inputClass} />
      </Field>
      <Status state={state} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "h-11")}>
        {pending ? "Saving…" : "Set password and sign in"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <Status state={state} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "h-11")}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
