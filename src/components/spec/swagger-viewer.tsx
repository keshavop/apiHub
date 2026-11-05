"use client";

import { useEffect, useRef, useState } from "react";
import "swagger-ui-dist/swagger-ui.css";
import "./swagger-theme.css";

/**
 * Swagger UI, the petstore.swagger.io look. Uses Swagger's prebuilt bundle (the
 * swagger-ui-react package fails to resolve OpenAPI 3.1 under Turbopack).
 * "Try it out" calls go through /api/try-proxy, which only forwards to servers
 * listed in specs the user can open.
 */
export function SwaggerViewer({ spec, mockUrl }: { spec: object; mockUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    if (!node) return;
    const doc = spec as { servers?: { url: string; description?: string }[] };
    const servers = [...(doc.servers ?? []), { url: mockUrl, description: "apiHub mock server" }];

    import("swagger-ui-dist/swagger-ui-es-bundle.js")
      .then(({ default: SwaggerUIBundle }) => {
        if (cancelled) return;
        SwaggerUIBundle({
          domNode: node,
          spec: { ...spec, servers },
          docExpansion: "list",
          defaultModelsExpandDepth: 1,
          deepLinking: true,
          displayRequestDuration: true,
          requestInterceptor: (req) => {
            const target = new URL(req.url, window.location.origin);
            if (!target.pathname.startsWith("/api/try-proxy")) {
              req.url = `${window.location.origin}/api/try-proxy?scalar_url=${encodeURIComponent(target.toString())}`;
            }
            return req;
          },
        });
      })
      .catch((e: unknown) => setFailed(String(e)));

    return () => {
      cancelled = true;
      node.replaceChildren();
    };
  }, [spec, mockUrl]);

  return (
    <div className="apihub-swagger mx-auto max-w-[1460px] px-2 pb-16 sm:px-4">
      {failed ? <p className="p-10 text-del">Couldn&apos;t load Swagger UI: {failed}</p> : null}
      <div ref={ref} />
    </div>
  );
}
