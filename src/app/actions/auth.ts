"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { loginPartner, requestPasswordReset, setPasswordWithToken } from "@/lib/auth/partner";
import { destroySession } from "@/lib/auth/session";

export type FormState = { error?: string; ok?: string } | undefined;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/apis";
}

export async function partnerSignIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const result = await loginPartner(email, password, await clientIp());
  if ("error" in result) return { error: result.error };
  await audit({ id: result.userId, label: result.email }, "partner.sign_in");
  redirect(safeNext(form.get("next")));
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The passwords don't match." };
  const result = await setPasswordWithToken(token, password);
  if ("error" in result) return { error: result.error };
  redirect("/apis");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  await requestPasswordReset(String(form.get("email") ?? ""), await clientIp());
  return { ok: "If that email has an account, a reset link is on its way. It works once and expires in 72 hours." };
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
