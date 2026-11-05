"use client";

import { useActionState } from "react";
import { addStaff, createPartner, runSync, sendPartnerLink, updatePartner, type AdminState } from "@/app/actions/admin";
import { CopyButton } from "@/components/copy-button";
import { Field, Notice, buttonClass, inputClass } from "@/components/ui";

function Result({ state }: { state: AdminState }) {
  if (state?.error) return <Notice tone="red"><span className="whitespace-pre-wrap">{state.error}</span></Notice>;
  if (!state?.ok) return null;
  return (
    <Notice tone="green">
      <div className="flex flex-col gap-2">
        <span>{state.ok}</span>
        {state.link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded bg-surface px-2 py-1.5 font-mono text-xs break-all text-fg">{state.link}</code>
            <CopyButton value={state.link} label="Copy link" />
          </div>
        ) : null}
      </div>
    </Notice>
  );
}

export type ApiOption = { id: string; title: string; slug: string; versions: string[]; visibility: string };
export type GrantValue = { apiId: string; versionRange: string };

function GrantPicker({ apis, grants }: { apis: ApiOption[]; grants: GrantValue[] }) {
  const byApi = new Map(grants.map((g) => [g.apiId, g.versionRange]));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 font-medium">API specs this email can open</legend>
      {apis.length === 0 ? <p className="text-muted">No APIs are marked partner or public in apihub.yaml yet.</p> : null}
      {apis.map((api) => (
        <div key={api.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line px-3 py-2.5">
          <label className="flex flex-[1_1_240px] cursor-pointer items-center gap-2.5">
            <input type="checkbox" name={`grant:${api.id}`} defaultChecked={byApi.has(api.id)} className="size-4 accent-[var(--accent)]" />
            <span className="font-medium">{api.title}</span>
            <span className="font-mono text-xs text-muted">{api.versions.slice(0, 4).join(", ") || "no releases yet"}</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Versions
            <input
              name={`range:${api.id}`}
              defaultValue={byApi.get(api.id) ?? (api.versions[0] ? `^${api.versions[0].split(".")[0]}.0.0` : "*")}
              className="h-9 w-32 rounded-md border border-line bg-bg px-2 font-mono text-xs text-fg"
              aria-label={`Version range for ${api.title}`}
            />
          </label>
        </div>
      ))}
      <p className="text-xs text-muted">
        Ranges use semver: <code className="font-mono">^2.0.0</code> all 2.x, <code className="font-mono">~1.8.0</code> 1.8 patches,{" "}
        <code className="font-mono">2.2.x</code>, an exact version, or <code className="font-mono">*</code> for every release. Drafts are never shared.
      </p>
    </fieldset>
  );
}

export function CreatePartnerForm({ apis }: { apis: ApiOption[] }) {
  const [state, action, pending] = useActionState(createPartner, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Field label="Email">
          <input name="email" type="email" required className={inputClass} placeholder="dev@partner-company.com" />
        </Field>
        <Field label="Company (label only)">
          <input name="company" className={inputClass} placeholder="Partner company" />
        </Field>
        <Field label="Access expires" hint="Leave empty for no expiry.">
          <input name="expiresAt" type="date" className={inputClass} />
        </Field>
      </div>
      <GrantPicker apis={apis} grants={[]} />
      <label className="flex items-center gap-2.5">
        <input type="checkbox" name="sendLink" defaultChecked className="size-4 accent-[var(--accent)]" />
        Send a set-password link now (single use, expires in 72 h)
      </label>
      <Result state={state} />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Creating…" : "Create partner user"}
        </button>
      </div>
    </form>
  );
}

export function EditPartnerForm({
  id,
  company,
  expiresAt,
  apis,
  grants,
}: {
  id: string;
  company: string;
  expiresAt: string;
  apis: ApiOption[];
  grants: GrantValue[];
}) {
  const [state, action, pending] = useActionState(updatePartner, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Field label="Company (label only)">
          <input name="company" defaultValue={company} className={inputClass} />
        </Field>
        <Field label="Access expires" hint="Leave empty for no expiry.">
          <input name="expiresAt" type="date" defaultValue={expiresAt} className={inputClass} />
        </Field>
      </div>
      <GrantPicker apis={apis} grants={grants} />
      <Result state={state} />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save access"}
        </button>
      </div>
    </form>
  );
}

export function SendLinkForm({ id, hasPassword }: { id: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState(sendPartnerLink, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "self-start")}>
        {hasPassword ? "Send password reset link" : "Send set-password link"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function AddStaffForm({ canAddOwner }: { canAddOwner: boolean }) {
  const [state, action, pending] = useActionState(addStaff, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-[1_1_240px]">
          <Field label="GitHub username">
            <input name="githubLogin" required className={inputClass} placeholder="octocat" />
          </Field>
        </div>
        <Field label="Role">
          <select name="role" defaultValue="designer" className={`${inputClass} w-40`}>
            <option value="designer">designer</option>
            <option value="admin">admin</option>
            {canAddOwner ? <option value="owner">owner</option> : null}
          </select>
        </Field>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          Add staff
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState(runSync, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      <Result state={state} />
    </form>
  );
}
