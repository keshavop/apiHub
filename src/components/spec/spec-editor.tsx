"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useTransition } from "react";
import { proposeSpecChange, validateDraft, type ProposeResult, type ValidateResult } from "@/app/actions/spec";
import { Badge, Notice, buttonClass, inputClass } from "@/components/ui";

type Props = {
  slug: string;
  initial: string;
  isNew: boolean;
  sourceLabel: string;
  sourceKind: "local-git" | "github";
};

export function SpecEditor({ slug: initialSlug, initial, isNew, sourceLabel, sourceKind }: Props) {
  const { resolvedTheme } = useTheme();
  const [slug, setSlug] = useState(initialSlug);
  const [text, setText] = useState(initial);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [validating, startValidate] = useTransition();
  const [proposing, startPropose] = useTransition();
  const [proposed, setProposed] = useState<ProposeResult | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("internal");
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // Validate as the author types (debounced).
  useEffect(() => {
    if (!slug) return;
    const t = setTimeout(() => startValidate(async () => setResult(await validateDraft(slug, text))), 700);
    return () => clearTimeout(t);
  }, [slug, text]);

  const jumpTo = (line: number) => {
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
    editorRef.current?.focus();
  };

  const errors = result?.lint.filter((i) => i.severity === "error").length ?? 0;
  const warnings = result?.lint.filter((i) => i.severity === "warning").length ?? 0;
  const check = result?.check;
  const canPropose = Boolean(slug && result && !result.parseError && !proposing);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-[1_1_420px] flex-wrap items-center gap-2.5">
          {isNew ? (
            <label className="flex items-center gap-2 font-mono text-[13px]">
              apis/
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-api"
                aria-label="API slug"
                className="h-9 w-40 rounded-md border border-line bg-bg px-2 font-mono text-[13px]"
              />
              /openapi.yaml
            </label>
          ) : (
            <code className="font-mono text-[13px] font-medium">apis/{slug}/openapi.yaml</code>
          )}
          <span className="font-mono text-xs text-muted">{sourceLabel}</span>
          {validating ? <Badge>checking…</Badge> : null}
          {result && !validating ? (
            result.parseError ? (
              <Badge tone="red">invalid</Badge>
            ) : (
              <>
                <Badge tone="green">valid</Badge>
                <Badge tone={errors ? "red" : warnings ? "orange" : "neutral"}>
                  {errors} errors · {warnings} warnings
                </Badge>
              </>
            )
          ) : null}
        </div>
        {!isNew ? (
          <Link href={`/apis/${slug}/main`} className="text-accent hover:underline">
            View current draft
          </Link>
        ) : null}
      </div>

      <div className="flex min-h-[640px] flex-wrap">
        <div className="min-h-[640px] min-w-0 flex-[999_1_560px] border-r border-line">
          <Editor
            height="72vh"
            defaultLanguage="yaml"
            value={text}
            onChange={(v) => setText(v ?? "")}
            onMount={(editor) => (editorRef.current = editor)}
            theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
            options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, wordWrap: "on" }}
          />
        </div>

        <aside className="flex flex-[1_1_380px] flex-col gap-4 bg-surface p-5">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Version check</h2>
            {result?.parseError ? (
              <Notice tone="red">
                <span className="font-mono text-xs break-words whitespace-pre-wrap">{result.parseError}</span>
              </Notice>
            ) : !check ? (
              <p className="text-muted">
                {result?.version ? `Declares ${result.version}. No release yet to compare against.` : "Waiting for a valid spec…"}
              </p>
            ) : (
              <div className={`flex flex-col gap-1.5 rounded-lg border p-3.5 ${check.ok ? "border-post/40 bg-post-bg" : "border-del/50 bg-del-bg"}`}>
                <span className={`font-semibold ${check.ok ? "text-post" : "text-del"}`}>
                  {check.ok ? "Version bump OK" : "Version bump needs attention"}
                </span>
                <span>
                  {result!.compareTo} → {result!.version}: {result!.counts!.breaking} breaking, {result!.counts!.additive} additive,{" "}
                  {result!.counts!.deprecation} deprecations, {result!.counts!.docs} docs.
                </span>
                {check.problems.map((p) => (
                  <span key={p} className="text-del">{p}</span>
                ))}
                {!check.ok && check.required !== "none" ? (
                  <span className="text-muted">
                    Suggested <code className="font-mono text-fg">info.version: {check.suggested}</code>
                  </span>
                ) : null}
                <Link href={`/apis/${slug}/compare?head=main`} className="text-accent hover:underline">
                  Full change report (last synced draft)
                </Link>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
              {sourceKind === "github" ? "Open a pull request" : "Propose on a branch"}
            </h2>
            <label className="flex flex-col gap-1.5 font-medium">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${isNew ? "Add" : "Update"} ${slug || "API"} spec`} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5 font-medium">
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} h-auto py-2`} />
            </label>
            {isNew ? (
              <label className="flex flex-col gap-1.5 font-medium">
                Visibility
                <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={inputClass}>
                  <option value="internal">internal: staff only</option>
                  <option value="partner">partner: can be granted to partner emails</option>
                  <option value="public">public: anyone can read releases</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              disabled={!canPropose}
              className={buttonClass("primary")}
              onClick={() =>
                startPropose(async () => setProposed(await proposeSpecChange({ slug, text, title, description, isNew, visibility })))
              }
            >
              {proposing ? "Opening…" : sourceKind === "github" ? "Open pull request" : "Commit to new branch"}
            </button>
            {proposed?.error ? <Notice tone="red">{proposed.error}</Notice> : null}
            {proposed?.branch ? (
              <Notice tone="green">
                {proposed.url ? (
                  <>
                    Pull request opened:{" "}
                    <a href={proposed.url} target="_blank" rel="noreferrer" className="underline">
                      {proposed.url}
                    </a>
                    . The apihub/semver check runs on it.
                  </>
                ) : (
                  <>
                    Committed to branch <code className="font-mono">{proposed.branch}</code>. Merge it into the default branch, then Sync.
                  </>
                )}
              </Notice>
            ) : null}
            <p className="text-xs text-muted">
              Nothing is published from here. Changes go through review in the spec repo; tag <code className="font-mono">{slug || "slug"}@&lt;version&gt;</code> to release.
            </p>
          </section>

          <section className="flex min-h-0 flex-col gap-2 border-t border-line pt-4">
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Problems ({result?.lint.length ?? 0})</h2>
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {result?.lint.map((i, n) => (
                <li key={n}>
                  <button type="button" onClick={() => jumpTo(i.line)} className="flex w-full items-baseline gap-2 rounded px-1.5 py-1.5 text-left hover:bg-surface-2">
                    <Badge tone={i.severity === "error" ? "red" : i.severity === "warning" ? "orange" : "blue"}>{i.severity}</Badge>
                    <span className="flex-1">{i.message}</span>
                    <span className="font-mono text-xs text-muted">Ln {i.line}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
