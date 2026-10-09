"use client";

// Roles, scope and campus: used when inviting a person and on their page.
import { useState } from "react";

export type RoleOption = { id: string; name: string; kind: string; twoStep: boolean; about: string };
export type CampusOption = { id: string; name: string };

const SCOPES = [
  { value: "WHOLE_SCHOOL", label: "Whole school", help: "Every record their roles allow, in every campus." },
  { value: "CAMPUS", label: "One campus", help: "Only the chosen campus." },
  { value: "OWN", label: "Own records only", help: "Only their own classes and records, whatever the roles say." },
];

export function AccessFields({ roles, campuses, roleIds, scope, campusId, errors = {} }: {
  roles: RoleOption[]; campuses: CampusOption[]; roleIds: string[]; scope: string; campusId: string; errors?: Record<string, string>;
}) {
  const [chosen, setChosen] = useState<string[]>(roleIds);
  const [sc, setSc] = useState(scope || "WHOLE_SCHOOL");
  const groups = [
    { title: "Ready roles", list: roles.filter((r) => r.kind === "READY") },
    { title: "Role templates switched on", list: roles.filter((r) => r.kind === "TEMPLATE") },
    { title: "Your school's own roles", list: roles.filter((r) => r.kind === "CUSTOM") },
  ].filter((g) => g.list.length);
  return (
    <div className="space-y-5">
      <fieldset aria-describedby={errors.roleIds ? "roles-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">Roles <span className="text-danger" aria-hidden="true">*</span></legend>
        <p className="mb-2 text-sm text-ink-2">A person can have more than one role; they get the widest access any of them gives.</p>
        {groups.map((g) => (
          <div key={g.title} className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-2">{g.title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.list.map((r) => (
                <label key={r.id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${chosen.includes(r.id) ? "border-brand bg-brand-soft" : "border-line"}`}>
                  <input type="checkbox" name="roleIds" value={r.id} checked={chosen.includes(r.id)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))} />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    {r.twoStep && <span className="ml-1 text-xs text-ink-2">· two-step login</span>}
                    <span className="block text-sm text-ink-2">{r.about}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {errors.roleIds && <p id="roles-error" className="text-sm text-danger">{errors.roleIds}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Scope <span className="text-danger" aria-hidden="true">*</span></legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SCOPES.filter((s) => s.value !== "CAMPUS" || campuses.length > 1).map((s) => (
            <label key={s.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${sc === s.value ? "border-brand bg-brand-soft" : "border-line"}`}>
              <input type="radio" name="scope" value={s.value} checked={sc === s.value} onChange={() => setSc(s.value)} className="mt-0.5 size-5 accent-[var(--brand)]" />
              <span><span className="font-medium">{s.label}</span><span className="block text-sm text-ink-2">{s.help}</span></span>
            </label>
          ))}
        </div>
        {errors.scope && <p className="mt-1 text-sm text-danger">{errors.scope}</p>}
      </fieldset>
      {sc === "CAMPUS" && (
        <div>
          <label htmlFor="campusId" className="mb-1 block text-sm font-medium">Campus <span className="text-danger" aria-hidden="true">*</span></label>
          <select id="campusId" name="campusId" defaultValue={campusId} required className={`h-11 w-full max-w-sm rounded-lg border bg-surface px-3 ${errors.campusId ? "border-danger" : "border-line-strong"}`}>
            <option value="">Choose the campus</option>
            {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.campusId && <p className="mt-1 text-sm text-danger">{errors.campusId}</p>}
        </div>
      )}
    </div>
  );
}
