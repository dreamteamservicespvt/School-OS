"use client";

import { useActionState, useState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert, FormMessage } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionButton } from "../action-button";
import {
  applyTemplateAction, assistantAction, featureAction, moduleAction, preferencesAction, previewTemplateAction, type PreviewState,
} from "./actions";
import { KeepCheck } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

/** A switch that looks like one, for a module or feature. */
function SwitchLook({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-surface-3"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </span>
  );
}

export function ModuleSwitch({ moduleKey, name, on, ready, stage, hides, mayEdit }: { moduleKey: string; name: string; on: boolean; ready: boolean; stage: number; hides: string; mayEdit: boolean }) {
  if (!mayEdit) return <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>;
  if (!on && !ready) return <span className="text-sm text-ink-2"><Words k="Arrives in Stage" /> {stage}</span>;
  if (on) {
    return (
      <ConfirmButton trigger={<span className="inline-flex items-center gap-2"><SwitchLook on /><Words k="On" /></span>} triggerVariant="ghost" title={`Switch off ${name}?`} confirmLabel={`Switch off ${name}`}
        onConfirm={() => moduleAction(moduleKey, false)}>
        {hides} {name} <Words k="disappears from the menu, search and dashboards for everyone. Nothing is deleted: switch it on again and everything is back." />
      </ConfirmButton>
    );
  }
  return <ActionButton variant="ghost" size="md" label={<span className="inline-flex items-center gap-2"><SwitchLook on={false} /><Words k="Off" /></span>} pendingLabel="Switching on…" run={() => moduleAction(moduleKey, true)} />;
}

export function FeatureSwitch({ featureKey, label, on, assistantOn, mayEdit, ready = true }: { featureKey: string; label: string; on: boolean; assistantOn: boolean; mayEdit: boolean; ready?: boolean }) {
  // Not built yet: it cannot be switched on. One switched on before it was held back can still be switched off.
  if (!ready) {
    if (!on || !mayEdit) return <Badge><Words k="Coming soon" /></Badge>;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge><Words k="Coming soon" /></Badge>
        <ActionButton variant="ghost" size="md" label={<span><Words k="Switch off" /><span className="sr-only"> {label}</span></span>} pendingLabel="Switching off…" run={() => featureAction(featureKey, false)} />
      </span>
    );
  }
  if (!mayEdit) return <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>;
  if (!assistantOn) return <Badge>{on ? "On, paused" : "Off"}</Badge>;
  return (
    <ActionButton variant="ghost" size="md" label={<span className="inline-flex items-center gap-2"><SwitchLook on={on} />{on ? "On" : "Off"}<span className="sr-only"> {label}</span></span>}
      pendingLabel={on ? "Switching off…" : "Switching on…"} run={() => featureAction(featureKey, !on)} />
  );
}

export function TemplatePicker({ templates, current, mayEdit }: { templates: { key: string; name: string; about: string }[]; current: string | null; mayEdit: boolean }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async (key: string, rep: boolean) => {
    setChosen(key); setBusy(true); setError(null);
    try { setPreview(await previewTemplateAction(key, rep)); } catch { setPreview({ ok: false, message: "Could not load what this template changes. Please try again." }); }
    setBusy(false);
  };
  const changes = preview?.ok ? (preview.modules?.length ?? 0) + (preview.settings?.length ?? 0) : 0;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.key} className="flex flex-col justify-between gap-3 rounded-xl border border-line p-4">
            <div>
              <p className="font-medium">{t.name} {current === t.key && <Badge tone="brand"><Words k="Applied" /></Badge>}</p>
              <p className="text-sm text-ink-2">{t.about}</p>
            </div>
            {mayEdit && <div><Button size="sm" variant="secondary" onClick={() => { setReplace(false); open(t.key, false); }}><Words k="See what it changes" /></Button></div>}
          </li>
        ))}
      </ul>
      <Dialog open={chosen !== null} onClose={() => { setChosen(null); setPreview(null); }} title={preview?.name ? `Apply ${preview.name}?` : "School-type template"}>
        {busy && <p className="text-ink-2"><Words k="Working out the changes…" /></p>}
        {!busy && preview && !preview.ok && <Alert tone="danger">{preview.message}</Alert>}
        {!busy && preview?.ok && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2"><Words k="A template only switches modules on, never off. Settings you have already chosen are kept unless you tick the box below." /></p>
            {preview.modules!.length > 0 && <div><p className="font-medium"><Words k="Modules switched on" /></p><ul className="list-disc pl-5 text-sm">{preview.modules!.map((m) => <li key={m}>{m}</li>)}</ul></div>}
            {preview.settings!.length > 0 && (
              <div><p className="font-medium"><Words k="Settings filled in" /></p>
                <ul className="list-disc pl-5 text-sm">{preview.settings!.map((s) => <li key={s.label}>{s.label}: {s.from} → {s.to}</li>)}</ul>
              </div>
            )}
            {preview.later!.length > 0 && <p className="text-sm text-ink-2"><Words k="Not ready yet, so not switched on:" /> {preview.later!.join(", ")}.</p>}
            {changes === 0 && <Alert tone="info"><Words k="Nothing to change: your school already matches this template" />{replace ? "" : " for the settings not yet chosen"}.</Alert>}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={replace} onChange={(e) => { setReplace(e.target.checked); open(chosen!, e.target.checked); }} className="size-5 accent-brand" />
              <span className="text-sm"><Words k="Also replace settings I have already chosen" /></span>
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => { setChosen(null); setPreview(null); }}><Words k="Cancel" /></Button>
              <Button loading={busy} onClick={async () => {
                setBusy(true);
                const problem = await applyTemplateAction(chosen!, replace).catch(() => "That did not work, and nothing was changed. Please try again.");
                setBusy(false);
                if (problem) setError(problem); else { setChosen(null); setPreview(null); }
              }}><Words k="Apply" /> {changes} <Words k="change" />{changes === 1 ? "" : "s"}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

const WEEK = [{ value: "monday", label: "Monday" }, { value: "sunday", label: "Sunday" }];
const ROLL = [{ value: "name", label: "By name (A to Z)" }, { value: "gender-name", label: "Girls first, then boys, each by name" }, { value: "admission", label: "By admission number" }];

export function PreferencesForm({ weekStart, rollNumberOrder, mayEdit }: { weekStart: string; rollNumberOrder: string; mayEdit: boolean }) {
  const [state, action] = useActionState(preferencesAction, null);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="First day of the week" name="weekStart" required options={WEEK} defaultValue={state?.values?.weekStart ?? weekStart} disabled={!mayEdit} error={state?.errors?.weekStart}
          help="Used by the Time Table, attendance and calendars." />
        <SelectField label="Roll number order" name="rollNumberOrder" required options={ROLL} defaultValue={state?.values?.rollNumberOrder ?? rollNumberOrder} disabled={!mayEdit} error={state?.errors?.rollNumberOrder}
          help="Used when roll numbers are given to a section." />
      </div>
      {mayEdit && <SubmitButton variant="secondary" pendingText="Saving…"><Words k="Save preferences" /></SubmitButton>}
    </form>
  );
}

export function AssistantForm({ on, roles, chosen, mayEdit, dailyLimit, platformLimit }: { on: boolean; roles: { key: string; name: string }[]; chosen: string[]; mayEdit: boolean; dailyLimit: number | null; platformLimit: number }) {
  const [state, action] = useActionState(assistantAction, null);
  const [isOn, setIsOn] = useState(state?.values ? state.values.on === "on" : on);
  const [picked, setPicked] = useState<string[]>(state?.values?.aiRoles ? state.values.aiRoles.split(",") : chosen);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <label className="flex min-h-11 items-center gap-3">
        <KeepCheck type="checkbox" name="on" checked={isOn} disabled={!mayEdit} onChange={(e) => setIsOn(e.target.checked)} className="size-5 accent-brand" />
        <span><span className="font-medium"><Words k="AI assistant is on" /></span><span className="block text-sm text-ink-2"><Words k="The AI only prepares and suggests. A person always checks before anything is saved or sent." /></span></span>
      </label>
      {isOn && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium"><Words k="Roles that may use it" /> <span className="text-danger" aria-hidden="true">*</span></legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <label key={r.key} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
                <KeepCheck type="checkbox" name="aiRoles" value={r.key} checked={picked.includes(r.key)} disabled={!mayEdit}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, r.key] : picked.filter((x) => x !== r.key))} className="size-5 accent-brand" />
                <span className="text-sm">{r.name}</span>
              </label>
            ))}
          </div>
          {state?.errors?.aiRoles && <p className="mt-1 text-sm text-danger">{state.errors.aiRoles}</p>}
        </fieldset>
      )}
      {isOn && (
        <TextField label="Most AI requests a day" name="aiDailyLimit" type="number" inputMode="numeric" min={1} max={platformLimit} className="max-w-xs"
          defaultValue={state?.values?.aiDailyLimit ?? (dailyLimit === null ? "" : String(dailyLimit))} placeholder={String(platformLimit)} disabled={!mayEdit}
          error={state?.errors?.aiDailyLimit} help={`For the whole school. Empty: ${platformLimit} a day, the most DREAM TEAM allows. After that, everyone carries on without AI until tomorrow.`} />
      )}
      {mayEdit && <SubmitButton variant="secondary" pendingText="Saving…"><Words k="Save AI assistant" /></SubmitButton>}
    </form>
  );
}
