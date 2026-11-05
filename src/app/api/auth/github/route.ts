import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { githubLoginEnabled } from "@/lib/auth/github";

export async function GET(req: NextRequest) {
  if (!githubLoginEnabled()) return NextResponse.redirect(new URL("/login?error=oauth", req.url));
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/api/auth/github/callback", process.env.APP_URL ?? req.url).toString());
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" };
  res.cookies.set("apihub_oauth_state", state, cookie);
  res.cookies.set("apihub_oauth_next", next.startsWith("/") && !next.startsWith("//") ? next : "/apis", cookie);
  return res;
}
