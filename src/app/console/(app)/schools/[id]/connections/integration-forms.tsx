"use client";

// Console: one of a school's other connections. DREAM TEAM types the details and keys
// here; the school's own Settings only shows the status.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { TextArea, TextField } from "@/components/ui/field";
import { INTEGRATION_STATUS, checkIntegrationFields, type IntegrationDef } from "@/lib/settings/switch-rules";
import { connectIntegrationAction, disconnectIntegrationAction, retestIntegrationAction, type IntegrationState } from "./integration-actions";

export type IntegrationCardData = {
  schoolId: string;
  def: IntegrationDef;
  status: string;
  config: Record<string, string>;
  hasSecrets: boolean;
  lastCheck: string | null;
  lastError: string | null;
};

export function IntegrationCard({ data }: { data: IntegrationCardData }) {
  const { schoolId, def, status, config, hasSecrets } = data;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<IntegrationState>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const st = INTEGRATION_STATUS[status] ?? INTEGRATION_STATUS["not-connected"];
  const connected = status !== "not-connected";
  const shown = { ...(state?.errors ?? {}), ...errors };

  const openForm = () => {
    // Details shown again; keys never: a blank key field keeps the saved one.
    setValues(Object.fromEntries(def.fields.map((f) => [f.key, f.type === "secret" ? "" : config[f.key] ?? ""])));
    setErrors({}); setState(null); setOpen(true);
  };

  const save = () => {
    const found = checkIntegrationFields(def, values, { secretsKept: hasSecrets });
    setErrors(found);
    if (Object.keys(found).length) { setState({ ok: false, message: Object.keys(found).length === 1 ? Object.values(found)[0] : `Please fix ${Object.keys(found).length} things before saving.` }); return; }
    startSave(async () => {
      const r = await connectIntegrationAction(schoolId, def.key, values);
      setState(r);
      setTest(null);
      if (r?.ok) setOpen(false);
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{def.name}</p>
          <p className="text-sm text-ink-2">{def.about}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {connected && (
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-ink-2">{f.label}</dt>
              <dd className="break-all font-medium">{f.type === "secret" ? (hasSecrets ? "Saved" : "Not saved") : config[f.key] || "Not given"}</dd>
            </div>
          ))}
        </dl>
      )}
      {test ? <p role="status" className={`text-sm ${test.ok ? "text-success" : "text-danger"}`}>{test.message}</p> : data.lastCheck && (
        <p className="text-sm text-ink-2">Last checked {data.lastCheck}{status === "error" && data.lastError ? <>: <span className="text-danger">{data.lastError}</span></> : ""}</p>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant={connected ? "secondary" : "primary"} onClick={openForm}>{connected ? "Change details" : "Connect"}<span className="sr-only"> {def.name}</span></Button>
        {connected && (
          <Button size="sm" variant="secondary" loading={testing} loadingText="Testing" onClick={() => startTest(async () => { setTest(await retestIntegrationAction(schoolId, def.key)); router.refresh(); })}>
            Test<span className="sr-only"> {def.name}</span>
          </Button>
        )}
        {connected && (
          <ConfirmButton trigger="Disconnect" triggerVariant="ghost" title={`Disconnect ${def.name}?`} confirmLabel={`Disconnect ${def.name}`} confirmVariant="danger"
            onConfirm={async () => { const m = await disconnectIntegrationAction(schoolId, def.key); if (!m) { setTest(null); router.refresh(); } return m; }}>
            School OS stops using {def.name} for this school. The saved details and keys are removed; you will need them again to reconnect.
          </ConfirmButton>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${connected ? "Change" : "Connect"} ${def.name}`}>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
          {state && !state.ok && state.message && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>}
          {def.fields.map((f) => {
            const keep = f.type === "secret" && hasSecrets;
            const common = {
              label: f.label, name: f.key, required: f.required && !keep, error: shown[f.key], placeholder: f.placeholder,
              value: values[f.key] ?? "", help: keep ? "A key is saved. Leave blank to keep it." : f.help,
            };
            if (f.type === "secret" && f.key === "serviceKey") {
              return <TextArea key={f.key} {...common} rows={4} autoComplete="off" spellCheck={false} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />;
            }
            return (
              <TextField key={f.key} {...common} type={f.type === "secret" ? "password" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                autoComplete={f.type === "secret" ? "new-password" : "off"} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            );
          })}
          <p className="text-sm text-ink-2">Saving tests the details straight away. Keys are stored encrypted and never shown again. The change goes into the school’s Audit Log with your name.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button type="submit" loading={saving} loadingText="Saving and testing">Save and test</Button>
          </div>
        </form>
      </Dialog>
    </li>
  );
}
