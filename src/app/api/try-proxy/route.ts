import { visibleApis } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/email";

/**
 * CORS proxy for the "Try it" console. It only forwards to apiHub's own mock server
 * or to a server URL listed in a spec the signed-in user may open, so it can't be
 * used as an open proxy.
 */
async function allowedOrigins() {
  const user = await getCurrentUser();
  if (!user) return null;
  const origins = new Set<string>([new URL(appUrl("/")).origin]);
  for (const api of await visibleApis(user)) {
    for (const v of api.versions) {
      const servers = (JSON.parse(v.specJson).servers ?? []) as { url?: string }[];
      for (const s of servers) {
        try {
          if (s.url) origins.add(new URL(s.url).origin);
        } catch {
          // relative or templated server URL: nothing to proxy to
        }
      }
    }
  }
  return origins;
}

const HOP_HEADERS = ["host", "cookie", "connection", "content-length", "accept-encoding", "origin", "referer"];

async function handle(req: Request) {
  const target = new URL(req.url).searchParams.get("scalar_url");
  if (!target) return Response.json({ error: "Missing scalar_url" }, { status: 400 });
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }
  const origins = await allowedOrigins();
  if (!origins) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!origins.has(url.origin)) {
    return Response.json({ error: `${url.origin} is not a server listed in a spec you can open` }, { status: 403 });
  }

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
  });
  // Calls to our own mock server carry the session so access rules still apply.
  if (url.origin === new URL(appUrl("/")).origin) {
    const cookie = req.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
  }
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const reason = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
    return Response.json({ error: `Couldn't reach ${url.origin}: ${reason}` }, { status: 502 });
  }
  const out = new Headers(upstream.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("set-cookie");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
