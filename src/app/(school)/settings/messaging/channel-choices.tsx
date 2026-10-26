"use client";

// One channel on Settings, SMS, WhatsApp & Email: what DREAM TEAM connected
// (never a key or provider ID), and the school's own choices: on or off, and
// the low-credit alert.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveChoicesAction, type ChannelState } from "./actions";
import { Words } from "@/lib/i18n/client";

export type ChannelStatus = {
  channel: "whatsapp" | "sms" | "email";
  label: string;
  /** Connected to a real provider by DREAM TEAM (not test mode). */
  connected: boolean;
  providerLabel: string;
  isOn: boolean;
  live: boolean;
  /** WhatsApp number or email sender shown to parents, when DREAM TEAM gave one. */
  sender: string | null;
  lowCreditAlert: number;
  lastTest: { at: string; ok: boolean } | null;
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-brand" : "bg-surface-3"}`}>
      <span className={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function ChannelChoices({ data, readOnly }: { data: ChannelStatus; readOnly: boolean }) {
  const router = useRouter();
  const [isOn, setOn] = useState(data.isOn);
  const [alert, setAlert] = useState(String(data.lowCreditAlert));
  const [state, setState] = useState<ChannelState>(null);
  const [pending, start] = useTransition();
  const paid = data.channel !== "email";
  const changed = isOn !== data.isOn || alert !== String(data.lowCreditAlert);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5" aria-labelledby={`ch-${data.channel}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id={`ch-${data.channel}`} className="text-lg font-semibold">{data.label}</h2>
        <Badge tone={data.isOn ? (data.live ? "success" : "warning") : "neutral"}>{data.isOn ? (data.live ? "On, sending for real" : "On, test mode") : "Off"}</Badge>
        {!readOnly && <label className="ml-auto flex items-center gap-2 text-sm font-medium"><Toggle on={isOn} onChange={setOn} label={`${data.label} on or off`} /> {isOn ? "Switched on" : "Switched off"}</label>}
      </div>
      <p className="mb-4 text-sm text-ink-2">
        {data.connected
          ? <Words k="Connected by DREAM TEAM. To change the account or number, tell DREAM TEAM support." />
          : <Words k="Not connected yet. DREAM TEAM connects it for you; until then messages are only recorded, nothing is sent." />}
      </p>
      {state?.errors?.isOn && <p role="alert" className="mb-3 text-sm text-danger">{state.errors.isOn}</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-2"><Words k="Connection" /></dt><dd className="font-medium">{data.connected ? data.providerLabel : "Not connected yet"}</dd></div>
        <div><dt className="text-ink-2"><Words k="Sending" /></dt><dd className="font-medium">{data.live ? "For real" : "Test mode: nothing is sent"}</dd></div>
        {data.sender && <div className="min-w-0"><dt className="text-ink-2">{data.channel === "email" ? "Sent from" : "Number parents see"}</dt><dd className="break-all font-medium">{data.sender}</dd></div>}
        {data.lastTest && <div><dt className="text-ink-2"><Words k="Last test" /></dt><dd className={`font-medium ${data.lastTest.ok ? "text-success" : "text-danger"}`}>{data.lastTest.ok ? "Passed" : "Problem"} · {data.lastTest.at}</dd></div>}
        {paid && readOnly && <div><dt className="text-ink-2"><Words k="Low credit alert" /></dt><dd className="font-medium tabular-nums">{data.lowCreditAlert.toLocaleString("en-IN")}</dd></div>}
      </dl>
      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          {paid && (
            <label className="block text-sm font-medium"><Words k="Low credit alert" />
              <input type="number" min={0} value={alert} onChange={(e) => setAlert(e.target.value)} className={`mt-1 h-11 w-40 rounded-lg border bg-surface px-3 ${state?.errors?.lowCreditAlert ? "border-danger" : "border-line-strong"}`} />
              <span className="mt-1 block font-normal text-ink-2">{state?.errors?.lowCreditAlert ?? <Words k="Warn when fewer credits than this are left." />}</span>
            </label>
          )}
          <Button className="ml-auto" disabled={!changed} loading={pending} loadingText="Saving" onClick={() => start(async () => {
            const r = await saveChoicesAction(data.channel, isOn, Number(alert));
            setState(r);
            if (r?.ok) router.refresh();
          })}><Words k="Save" /> {data.label}</Button>
        </div>
      )}
      {state && !state.ok && state.message && !Object.keys(state.errors ?? {}).length && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.message}</p>}
    </section>
  );
}
