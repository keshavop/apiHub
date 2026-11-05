import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { exchangeCode, staffUserForGitHub } from "@/lib/auth/github";
import { createSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const fail = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  if (!state || !code || state !== req.cookies.get("apihub_oauth_state")?.value) return fail("state");

  let gh;
  try {
    gh = await exchangeCode(code);
  } catch (e) {
    console.error("[auth] GitHub OAuth failed", e);
    return fail("oauth");
  }
  const user = await staffUserForGitHub(gh);
  if (!user) {
    await audit(null, "staff.sign_in_denied", gh.login);
    return fail("not_staff");
  }
  await createSession(user.id, "staff");
  await audit({ id: user.id, label: user.githubLogin! }, "staff.sign_in");
  const res = NextResponse.redirect(new URL(req.cookies.get("apihub_oauth_next")?.value ?? "/apis", req.url));
  res.cookies.delete("apihub_oauth_state");
  res.cookies.delete("apihub_oauth_next");
  return res;
}
