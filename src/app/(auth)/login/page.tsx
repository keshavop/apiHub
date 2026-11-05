import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartnerSignInForm } from "@/components/auth/forms";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { devLoginEnabled, githubLoginEnabled } from "@/lib/auth/github";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_staff: "That GitHub account isn't an apiHub staff member. Ask an admin to add your GitHub login.",
  oauth: "GitHub sign-in failed. Try again.",
  state: "Sign-in expired. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/apis");
  const { error, next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
        <p className="text-muted">Staff use GitHub. Partners sign in with the email and password from their invite.</p>
      </div>
      {typeof error === "string" && ERRORS[error] ? <Notice tone="red">{ERRORS[error]}</Notice> : null}
      {githubLoginEnabled() ? (
        <a href={`/api/auth/github${nextQuery}`} className="flex h-11 items-center justify-center gap-2.5 rounded-lg bg-fg font-semibold text-bg hover:opacity-90">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" />
          </svg>
          Continue with GitHub
        </a>
      ) : (
        <p className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
          GitHub sign-in for staff is off: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.
        </p>
      )}
      {devLoginEnabled() ? (
        <form action={`/api/auth/dev${nextQuery}`} method="post">
          <button type="submit" className="h-10 w-full rounded-lg border border-dashed border-put/60 font-medium text-put hover:bg-put-bg">
            Dev sign-in as owner (local only)
          </button>
        </form>
      ) : null}
      <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase">
        <span className="h-px flex-1 bg-line" />
        Partner access
        <span className="h-px flex-1 bg-line" />
      </div>
      <PartnerSignInForm next={nextPath} />
      <p className="text-[13px] leading-relaxed text-muted">
        No account yet? Accounts are created by an apiHub admin. Your email can open only the API specs assigned to it.
      </p>
    </div>
  );
}
