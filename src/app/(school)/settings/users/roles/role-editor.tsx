"use client";

// The permission grid: every module down the side, Full / View / Own / None across.
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ErrorSummary, TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { AccessLevel, RolePermissions } from "@/lib/roles";
import { LEVELS, permissionChanges } from "@/lib/settings/role-words";
import { saveRoleAction } from "../actions";

type Mod = { key: string; name: string };

export function RoleEditor({ id, name, kind, permissions, requiresTwoStep, copyFromId, modules, people, readOnly, cancelHref }: {
  id: string | null; name: string; kind: "READY" | "TEMPLATE" | "CUSTOM"; permissions: Partial<RolePermissions>; requiresTwoStep: boolean;
  copyFromId: string | null; modules: Mod[]; people: number; readOnly: boolean; cancelHref: string;
}) {
  const [state, action, pending] = useActionState(saveRoleAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [roleName, setRoleName] = useState(state?.values?.name ?? name);
  const [grid, setGrid] = useState<Record<string, AccessLevel>>(() => Object.fromEntries(modules.map((m) => [m.key, (state?.values?.[`p_${m.key}`] as AccessLevel) ?? permissions[m.key as keyof RolePermissions] ?? "none"])));
  const [twoStep, setTwoStep] = useState(requiresTwoStep);
  const [asking, setAsking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameLocked = kind !== "CUSTOM" && Boolean(id);
  const changes = permissionChanges(roleName || "This", permissions, grid as RolePermissions);
  if (id && twoStep !== requiresTwoStep) changes.push(`${roleName} role ${twoStep ? "now needs" : "no longer needs"} two-step login`);
  const reached = Object.values(grid).filter((l) => l !== "none").length;

  const save = () => {
    if (!roleName.trim()) { setNameError("Role name is needed."); return; }
    if (id && changes.length === 0 && roleName === name) { formRef.current?.requestSubmit(); return; }
    if (id && people > 0) { setAsking(true); return; }
    formRef.current?.requestSubmit();
  };
  const setAll = (level: AccessLevel) => setGrid(Object.fromEntries(modules.map((m) => [m.key, m.key === "settings" && kind !== "CUSTOM" ? grid.settings : level])));

  return (
    <>
      <form ref={formRef} action={action} className="space-y-5" noValidate>
        {id && <input type="hidden" name="id" value={id} />}
        {copyFromId && <input type="hidden" name="copyFromId" value={copyFromId} />}
        <FormMessage state={state} />
        <ErrorSummary errors={state?.errors} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Role name" name="name" required value={roleName} disabled={nameLocked || readOnly} maxLength={60}
            onChange={(e) => { setRoleName(e.target.value); setNameError(null); }} onBlur={(e) => setNameError(e.target.value.trim() ? null : "Role name is needed.")}
            error={nameError ?? state?.errors?.name} help={nameLocked ? "Ready roles and role templates keep their names. Copy the role to make one with another name." : "For example: Fee Clerk, Exam Cell, Lab Assistant."} />
          {nameLocked && <input type="hidden" name="name" value={roleName} />}
          <label className="flex min-h-11 items-start gap-3 self-end rounded-lg border border-line px-3 py-2">
            <input type="checkbox" name="requiresTwoStep" checked={twoStep} disabled={readOnly} onChange={(e) => setTwoStep(e.target.checked)} className="mt-0.5 size-5 accent-brand" />
            <span><span className="font-medium">Needs two-step login</span><span className="block text-sm text-ink-2">A one-time code at every sign-in. Turn on for roles that handle money or every record.</span></span>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1 font-medium">What this role can do</legend>
          <p className="mb-2 text-sm text-ink-2">{LEVELS.map((l) => `${l.label}: ${l.words}`).join(". ")}. Opens {reached} of {modules.length} modules.</p>
          {!readOnly && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">Set every module to</span>
              {LEVELS.map((l) => <Button key={l.value} size="sm" variant="ghost" onClick={() => setAll(l.value)}>{l.label}</Button>)}
            </div>
          )}
          {state?.errors?.settings && <p className="mb-2 text-sm text-danger">{state.errors.settings}</p>}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">Permission for each module</caption>
              <thead className="bg-surface-2 text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Module</th>
                  {LEVELS.map((l) => <th key={l.value} scope="col" className="w-14 px-1 py-2 text-center font-medium sm:w-20">{l.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const was = permissions[m.key as keyof RolePermissions] ?? "none";
                  const changed = Boolean(id) && was !== grid[m.key];
                  return (
                    <tr key={m.key} className={`border-t border-line ${changed ? "bg-brand-soft" : ""}`}>
                      <th scope="row" className="px-3 py-1 text-left font-medium">
                        {m.name}
                        {changed && <span className="block text-xs font-normal text-ink-2">Was {LEVELS.find((l) => l.value === was)?.label}</span>}
                      </th>
                      {LEVELS.map((l) => (
                        <td key={l.value} className="p-0 text-center">
                          <label className="grid min-h-11 cursor-pointer place-items-center">
                            <span className="sr-only">{m.name}: {l.label}</span>
                            <input type="radio" name={`p_${m.key}`} value={l.value} checked={grid[m.key] === l.value} disabled={readOnly}
                              onChange={() => setGrid({ ...grid, [m.key]: l.value })} className="size-5 accent-brand" />
                          </label>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>

        {id && changes.length > 0 && (
          <Alert tone="info" title="Not saved yet">
            <ul className="list-disc pl-5">{changes.map((c) => <li key={c}>{c}.</li>)}</ul>
          </Alert>
        )}

        {!readOnly && (
          <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3 sm:static sm:mx-0 sm:px-0">
            <Button onClick={save} loading={pending} loadingText="Saving…">{id ? "Save role" : "Create role"}</Button>
            <Link href={cancelHref} className="min-h-11 rounded-lg px-3 py-2.5 font-medium text-ink-2 hover:bg-surface-2">Cancel</Link>
          </div>
        )}
      </form>
      <Dialog open={asking} onClose={() => setAsking(false)} title={`Change the ${name} role?`}>
        <p className="text-ink-2">{people} {people === 1 ? "person has" : "people have"} this role. This changes what they can do the next time they open a page:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{changes.map((c) => <li key={c}>{c}.</li>)}</ul>
        <p className="mt-2 text-sm text-ink-2">Every School Admin is told. You can put it back from the role&apos;s history.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
          <Button onClick={() => { setAsking(false); formRef.current?.requestSubmit(); }}>Save the role</Button>
        </div>
      </Dialog>
    </>
  );
}
