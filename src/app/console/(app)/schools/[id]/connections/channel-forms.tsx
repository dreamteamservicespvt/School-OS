"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addCreditsAction, saveChannelAction, saveDltAction, saveSmsDltIdAction, testChannelAction, type ChannelState } from "./actions";
import { Words } from "@/lib/i18n/client";

const input = "h-11 w-full rounded-lg border bg-surface px-3";
type Field = { key: string; label: string; secret: boolean; help?: string; required: boolean };

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-brand" : "bg-surface-3"}`}>
      <span className={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export type ChannelCardData = {
  schoolId: string;
  channel: "whatsapp" | "sms" | "email";
  label: string;
  provider: string;
  providers: { key: string; label: string }[];
  fields: Record<string, Field[]>;
  config: Record<string, string>;
  hasSecrets: boolean;
  secretsLast4: string | null;
  isOn: boolean;
  live: boolean;
  lowCreditAlert: number;
  lastTest: { at: string; ok: boolean; note: string } | null;
  testTo: string;
  webhook: string | null;
};

export function ChannelCard({ data, readOnly = false }: { data: ChannelCardData; readOnly?: boolean }) {
  const router = useRouter();
  const [provider, setProvider] = useState(data.provider);
  const [config, setConfig] = useState(data.config);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [isOn, setOn] = useState(data.isOn);
  const [live, setLive] = useState(data.live);
  const [alert, setAlert] = useState(String(data.lowCreditAlert));
  const [state, setState] = useState<ChannelState>(null);
  const [testTo, setTestTo] = useState(data.testTo);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const fields = data.fields[provider] ?? [];
  const keep = provider === data.provider && data.hasSecrets;
  const err = (k: string) => state?.errors?.[k];

  const save = () => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = (f.secret ? secrets[f.key] : config[f.key])?.trim() ?? "";
      if (f.required && !v && !(f.secret && keep)) out[f.key] = `Enter the ${f.label.toLowerCase()}.`;
    }
    if (live && provider === "sandbox") out.live = "Choose a real provider to send for real.";
    if (Object.keys(out).length) { setState({ ok: false, errors: out, message: Object.keys(out).length === 1 ? Object.values(out)[0] : `Please fix ${Object.keys(out).length} things before saving.` }); return; }
    start(async () => {
      const r = await saveChannelAction(data.schoolId, data.channel, { provider, live, isOn, config, secrets, lowCreditAlert: Number(alert) });
      setState(r);
      if (r?.ok) { setSecrets({}); router.refresh(); }
    });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5" aria-labelledby={`ch-${data.channel}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id={`ch-${data.channel}`} className="text-lg font-semibold">{data.label}</h2>
        <Badge tone={data.isOn ? (data.live ? "success" : "warning") : "neutral"}>{data.isOn ? (data.live ? "On, sending for real" : "On, test mode") : "Off"}</Badge>
        {!readOnly && <label className="ml-auto flex items-center gap-2 text-sm font-medium"><Toggle on={isOn} onChange={setOn} label={`${data.label} on or off`} /> {isOn ? "Switched on" : "Switched off"}</label>}
      </div>
      {err("isOn") && <p className="mb-3 text-sm text-danger">{err("isOn")}</p>}
      {readOnly ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-2"><Words k="Provider" /></dt><dd className="font-medium">{data.providers.find((p) => p.key === data.provider)?.label ?? data.provider}</dd></div>
          <div><dt className="text-ink-2"><Words k="Sending" /></dt><dd className="font-medium">{data.live ? "For real" : "Test mode"}</dd></div>
          {fields.map((f) => (
            <div key={f.key} className="min-w-0"><dt className="text-ink-2">{f.label}</dt><dd className="break-all font-medium">{f.secret ? (data.hasSecrets ? `Saved (ends in ${data.secretsLast4 ?? "••••"})` : "Not saved") : data.config[f.key] || "Not given"}</dd></div>
          ))}
          {data.channel !== "email" && <div><dt className="text-ink-2"><Words k="Low credit alert" /></dt><dd className="font-medium tabular-nums">{data.lowCreditAlert.toLocaleString("en-IN")}</dd></div>}
        </dl>
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium"><Words k="Provider" />
          <select value={provider} onChange={(e) => { setProvider(e.target.value); if (e.target.value === "sandbox") setLive(false); }} className={`${input} mt-1 border-line-strong`}>
            {data.providers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <div className="text-sm">
          <span className="block font-medium"><Words k="Sending" /></span>
          <label className="mt-2 flex items-center gap-2"><Toggle on={live} onChange={setLive} label="Send for real" /> {live ? "For real: messages reach people and use credits" : "Test mode: messages are recorded, nothing is sent"}</label>
          {err("live") && <p className="mt-1 text-danger">{err("live")}</p>}
        </div>
        {fields.map((f) => (
          <label key={f.key} className="block text-sm font-medium">{f.label}{f.required && <span className="text-danger" aria-hidden> *</span>}
            {f.secret ? (
              <input type="password" autoComplete="new-password" value={secrets[f.key] ?? ""} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                placeholder={keep ? `Saved (ends in ${data.secretsLast4 ?? "••••"}). Type to replace.` : ""} className={`${input} mt-1 ${err(f.key) ? "border-danger" : "border-line-strong"}`} />
            ) : (
              <input value={config[f.key] ?? ""} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} className={`${input} mt-1 ${err(f.key) ? "border-danger" : "border-line-strong"}`} />
            )}
            {err(f.key) ? <span className="mt-1 block font-normal text-danger">{err(f.key)}</span> : f.help && <span className="mt-1 block font-normal text-ink-2">{f.help}</span>}
          </label>
        ))}
        {data.channel !== "email" && (
          <label className="block text-sm font-medium"><Words k="Low credit alert" />
            <input type="number" min={0} value={alert} onChange={(e) => setAlert(e.target.value)} className={`${input} mt-1 border-line-strong`} />
            <span className="mt-1 block font-normal text-ink-2"><Words k="Warn when fewer credits than this are left." /></span>
          </label>
        )}
      </div>
      )}
      {data.webhook && provider !== "sandbox" && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-medium"><Words k="Delivery report address" /></p>
          <p className="mt-1 break-all font-mono">{data.webhook}</p>
          <p className="mt-1 text-ink-2">{data.channel === "whatsapp" ? "Add this as the webhook in Meta, with the webhook verify token above, and subscribe to messages." : "Give this to MSG91 for delivery reports, with the delivery report key above in place of <key>."}</p>
        </div>
      )}
      {state && !state.ok && state.message && !Object.keys(state.errors ?? {}).length && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>}
      {!readOnly && <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Button loading={pending} loadingText="Saving" onClick={save}><Words k="Save" /> {data.label}</Button>
        <div className="flex flex-1 flex-wrap items-end justify-end gap-2">
          <label className="text-sm font-medium"><Words k="Send a test to" />
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} inputMode={data.channel === "email" ? "email" : "numeric"} placeholder={data.channel === "email" ? "you@school.in" : "Your mobile"} className={`${input} mt-1 w-56 border-line-strong`} />
          </label>
          <Button variant="secondary" loading={testing} loadingText="Sending" onClick={() => startTest(async () => { setTest(await testChannelAction(data.schoolId, data.channel, testTo)); router.refresh(); })}><Words k="Send test" /></Button>
        </div>
      </div>}
      {test ? <p role="status" className={`mt-2 text-sm ${test.ok ? "text-success" : "text-danger"}`}>{test.message}</p> : data.lastTest && (
        <p className="mt-2 text-sm text-ink-2"><Words k="Last test" /> {data.lastTest.at}: <span className={data.lastTest.ok ? "text-success" : "text-danger"}>{data.lastTest.note}</span></p>
      )}
    </section>
  );
}

export function DltForm({ schoolId, entityId, header, readOnly = false }: { schoolId: string; entityId: string; header: string; readOnly?: boolean }) {
  const router = useRouter();
  const [e, setE] = useState(entityId);
  const [h, setH] = useState(header);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (readOnly) {
    return (
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-2"><Words k="DLT entity ID" /></dt><dd className="font-mono font-medium">{entityId || "Not given"}</dd></div>
        <div><dt className="text-ink-2"><Words k="Sender header" /></dt><dd className="font-mono font-medium">{header || "Not given"}</dd></div>
      </dl>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium"><Words k="DLT entity ID" />
          <input value={e} onChange={(x) => setE(x.target.value.trim())} maxLength={30} className={`${input} mt-1 border-line-strong font-mono`} />
          <span className="mt-1 block font-normal text-ink-2"><Words k="The school’s principal entity ID on the telecom DLT portal." /></span>
        </label>
        <label className="block text-sm font-medium"><Words k="Sender header" />
          <input value={h} onChange={(x) => setH(x.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} maxLength={6} className={`${input} mt-1 border-line-strong font-mono`} />
          <span className="mt-1 block font-normal text-ink-2"><Words k="6 letters, as approved on the DLT portal, for example SUNSPS." /></span>
        </label>
      </div>
      {msg && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{msg}</p>}
      <Button loading={pending} loadingText="Saving" onClick={() => {
        if (h && h.length !== 6) { setMsg("The sender header is exactly 6 letters, for example SUNSPS."); return; }
        start(async () => { const m = await saveDltAction(schoolId, e, h); setMsg(m ?? null); if (!m) router.refresh(); });
      }}><Words k="Save DLT details" /></Button>
    </div>
  );
}

export function CreditsForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState("whatsapp");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-medium"><Words k="Channel" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`${input} mt-1 w-36 border-line-strong`}>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
      </label>
      <label className="text-sm font-medium"><Words k="Credits" />
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} mt-1 w-32 border-line-strong`} />
      </label>
      <label className="min-w-48 flex-1 text-sm font-medium"><Words k="Note" />
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Invoice number or reason" className={`${input} mt-1 border-line-strong`} />
      </label>
      <Button loading={pending} loadingText="Adding" onClick={() => {
        const n = Number(amount);
        if (!Number.isInteger(n) || n === 0) { setMsg("Enter a whole number of credits. Use a minus number to correct a mistake."); return; }
        if (note.trim().length < 3) { setMsg("Write a note, for example the invoice number."); return; }
        start(async () => { const m = await addCreditsAction(schoolId, channel, n, note); setMsg(m ?? null); if (!m) { setAmount(""); setNote(""); router.refresh(); } });
      }}><Words k="Add credits" /></Button>
      {msg && <p role="alert" className="w-full text-sm text-danger">{msg}</p>}
    </div>
  );
}

/** One SMS text's DLT template ID, as registered on the DLT portal for that exact text. */
export function SmsDltIdForm({ schoolId, versionId, value, label }: { schoolId: string; versionId: string; value: string; label: string }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-56 flex-1 text-sm font-medium">DLT template ID
        <input value={v} onChange={(e) => setV(e.target.value.trim())} maxLength={40} aria-label={`DLT template ID for ${label}`} className={`${input} mt-1 border-line-strong font-mono`} />
      </label>
      <Button variant="secondary" loading={pending} loadingText="Saving" disabled={v === value} onClick={() => {
        if (v && !/^[A-Za-z0-9]{6,40}$/.test(v)) { setMsg("The DLT template ID can have only letters and numbers, as shown on the DLT portal."); return; }
        start(async () => { const m = await saveSmsDltIdAction(schoolId, versionId, v); setMsg(m ?? null); if (!m) router.refresh(); });
      }}>Save</Button>
      {msg && <p role="alert" className="w-full text-sm text-danger">{msg}</p>}
    </div>
  );
}
