"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import "@scalar/api-reference-react/style.css";

const ApiReferenceReact = dynamic(() => import("@scalar/api-reference-react").then((m) => m.ApiReferenceReact), {
  ssr: false,
  loading: () => <div className="p-10 text-muted">Loading reference…</div>,
});

// Match Scalar's palette to apiHub's tokens.
const customCss = `
.scalar-app, .light-mode, .dark-mode {
  --scalar-color-accent: var(--accent);
  --scalar-background-1: var(--bg);
  --scalar-background-2: var(--surface);
  --scalar-background-3: var(--surface-2);
  --scalar-border-color: var(--border);
  --scalar-color-1: var(--fg);
  --scalar-color-2: var(--muted);
  --scalar-font: var(--font-inter), system-ui, sans-serif;
  --scalar-font-code: var(--font-jetbrains), ui-monospace, monospace;
}
.scalar-app .t-doc__sidebar { top: 57px; height: calc(100dvh - 57px); }
`;

export function SpecViewer({ spec, mockUrl }: { spec: object; mockUrl: string }) {
  const { resolvedTheme } = useTheme();
  const servers = [
    ...(((spec as { servers?: { url: string; description?: string }[] }).servers ?? []) as { url: string; description?: string }[]),
    { url: mockUrl, description: "apiHub mock server" },
  ];
  return (
    <ApiReferenceReact
      key={resolvedTheme}
      configuration={{
        content: { ...spec, servers },
        proxyUrl: "/api/try-proxy",
        hideDarkModeToggle: true,
        forceDarkModeState: resolvedTheme === "dark" ? "dark" : "light",
        darkMode: resolvedTheme === "dark",
        withDefaultFonts: false,
        hideDownloadButton: true,
        showDeveloperTools: "never",
        // Private specs must not leave apiHub: turn off Scalar's hosted AI chat.
        agent: { disabled: true },
        telemetry: false,
        customCss,
      }}
    />
  );
}
