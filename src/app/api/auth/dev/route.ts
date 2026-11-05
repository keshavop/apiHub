import { NextResponse, type NextRequest } from "next/server";
import { devLoginEnabled } from "@/lib/auth/github";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Local development only: signs in as the first owner. Disabled in production builds. */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const owner = await db.user.findFirst({ where: { kind: "staff", role: "owner", status: "active" } });
  if (!owner) return new NextResponse("Run `pnpm db:seed` first.", { status: 400 });
  await createSession(owner.id, "staff");
  const next = req.nextUrl.searchParams.get("next") ?? "/apis";
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/apis", req.url), 303);
}
