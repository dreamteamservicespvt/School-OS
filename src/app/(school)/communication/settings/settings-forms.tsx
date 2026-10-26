"use client";

// The parts of Message Settings. Each part saves on its own.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/controls";
import {
  archiveGroupAction, archiveTopicAction, findGuardians, optOutAction, saveDeliveryAction, saveParentLinkAction,
  saveQueryRulesAction, saveRuleAction, saveTopicAction, setCommFeatureAction,
} from "./actions";
import { Words } from "@/lib/i18n/client";
import { TimeInput } from "@/components/ui/date-input";

type Opt = { value: string; label: string };
const box = "size-5 accent-brand";
const input = "h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15";

function useSave() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<string | void>, after?: () => void) => start(async () => {
    setMsg(null);
    const m = await fn();
    if (m) setMsg(m);
    else { after?.(); router.refresh(); }
  });
  return { msg, pending, save };
}

function Problem({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{msg}</p> : null;
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <Switch on={on} onChange={onChange} label={label} disabled={disabled} />;
}

// ── Automatic messages ────────────────────────────────────────────────────

export type RuleRowData = {
  key: string; label: string; when: string; module: string; audience: "parents" | "staff"; isOn: boolean; channels: string[]; sendTo: string;
  timing: Record<string, string>; timingFields: { key: string; label: string; kind: "time" | "days" }[];
  templates: { channel: string; label: string; href: string | null; problem: string | null }[];
  /** The channel is chosen on another page (fee reminders: Fee Settings). */
  channelsSetIn?: { label: string; href: string } | null;
};

export function RuleRow({ rule, channels }: { rule: RuleRowData; channels: Opt[] }) {
  const [isOn, setOn] = useState(rule.isOn);
  const [chs, setChs] = useState(rule.channels);
  const [sendTo, setSendTo] = useState(rule.sendTo);
  const [timing, setTiming] = useState(rule.timing);
  const [open, setOpen] = useState(false);
  const { msg, pending, save } = useSave();
  const dirty = isOn !== rule.isOn || chs.join() !== rule.channels.join() || sendTo !== rule.sendTo || JSON.stringify(timing) !== JSON.stringify(rule.timing);
  const doSave = (on = isOn) => save(() => saveRuleAction({ key: rule.key, isOn: on, channels: chs, sendTo, timing }), () => setOpen(false));

  return (
    <li className="px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-left">
            <span className="font-semibold text-[14px]">{rule.label}</span>
            <span className="block text-[12.5px] text-ink3"><Words k="When" /> {rule.when.charAt(0).toLowerCase() + rule.when.slice(1)} · {chs.map((c) => channels.find((x) => x.value === c)?.label ?? c).join(", ") || "no channel"}{rule.timingFields.map((f) => ` · ${f.label.toLowerCase()} ${timing[f.key]}`).join("")} <Words k="· from" /> {rule.module}</span>
          </button>
          {rule.templates.some((t) => t.problem) && isOn && <p className="mt-1 text-sm text-bad">{rule.templates.filter((t) => t.problem).map((t) => t.problem).join(" ")}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : "Change"}</Button>
        <Toggle on={isOn} label={`${rule.label} on or off`} disabled={pending} onChange={(v) => { setOn(v); if (!open) save(() => saveRuleAction({ key: rule.key, isOn: v, channels: chs, sendTo, timing })); }} />
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-sunken/70 p-3">
          {rule.channelsSetIn ? (
            <p className="text-sm"><span className="font-medium"><Words k="Channel:" /></span> {chs.map((c) => channels.find((x) => x.value === c)?.label ?? c).join(", ")}<Words k=", chosen in" /> <a href={rule.channelsSetIn.href} className="text-brand underline">{rule.channelsSetIn.label}</a> <Words k="with the days it goes." /></p>
          ) : (
            <fieldset>
              <legend className="mb-1 text-sm font-medium"><Words k="Channels" /></legend>
              <div className="flex flex-wrap gap-x-4">
                {channels.map((c) => (
                  <label key={c.value} className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" className={box} checked={chs.includes(c.value)} onChange={(e) => setChs(e.target.checked ? [...chs, c.value] : chs.filter((x) => x !== c.value))} /> {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <p className="mb-1 text-sm font-medium"><Words k="Template" /></p>
            <ul className="text-sm">
              {rule.templates.filter((t) => chs.includes(t.channel)).map((t) => (
                <li key={t.channel}>{channels.find((c) => c.value === t.channel)?.label}: {t.href ? <a href={t.href} className="text-brand underline">{t.label}</a> : <span className="text-bad">{t.label}</span>}</li>
              ))}
            </ul>
          </div>
          {rule.audience === "parents" && (
            <label className="block text-sm font-medium"><Words k="Who receives it" />
              <select value={sendTo} onChange={(e) => setSendTo(e.target.value)} className={`${input} mt-1 block w-full sm:w-72`}>
                <option value="primary">The main contact of each child</option>
                <option value="all">All guardians of each child</option>
              </select>
            </label>
          )}
          {rule.timingFields.map((f) => (
            <label key={f.key} className="block text-sm font-medium">{f.label}
              {f.kind === "time"
                ? <TimeInput value={timing[f.key] ?? ""} onChange={(e) => setTiming({ ...timing, [f.key]: e.target.value })} wrapperClassName="mt-1 w-40" className={`${input} block w-full`} />
                : <input type="number" min={0} max={30} value={timing[f.key] ?? ""} onChange={(e) => setTiming({ ...timing, [f.key]: e.target.value })} className={`${input} mt-1 block w-40`} />}
            </label>
          ))}
          <Problem msg={msg} />
          <div className="flex gap-2">
            <Button size="sm" loading={pending} loadingText="Saving" disabled={!dirty} onClick={() => doSave()}><Words k="Save" /></Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(false); setChs(rule.channels); setSendTo(rule.sendTo); setTiming(rule.timing); setOn(rule.isOn); }}><Words k="Cancel" /></Button>
          </div>
        </div>
      )}
      {!open && <Problem msg={msg} />}
    </li>
  );
}

// ── Delivery ──────────────────────────────────────────────────────────────

export function DeliveryForm({ retryLimit, backup, backupTypes, noticeApproval }: { retryLimit: number; backup: Record<string, { on: boolean; waitMinutes: number }>; backupTypes: Opt[]; noticeApproval: string }) {
  const [retry, setRetry] = useState(String(retryLimit));
  const [b, setB] = useState(backup);
  const [approval, setApproval] = useState(noticeApproval);
  const { msg, pending, save } = useSave();
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1 font-medium"><Words k="SMS backup" /></legend>
        <p className="mb-2 text-sm text-ink3"><Words k="Anyone whose WhatsApp or app message fails, or is not read within the wait time, gets the same message by SMS. Backup SMS use the message type’s SMS template with a DLT template ID and use credits." /></p>
        <ul className="space-y-2">
          {backupTypes.map((t) => (
            <li key={t.value} className="flex flex-wrap items-center gap-3">
              <Toggle on={b[t.value]?.on ?? false} label={`SMS backup for ${t.label}`} onChange={(v) => setB({ ...b, [t.value]: { ...b[t.value], on: v } })} />
              <span className="w-44 font-medium">{t.label}</span>
              <label className="flex items-center gap-2 text-sm"><Words k="Wait" />
                <select value={b[t.value]?.waitMinutes ?? 120} disabled={!b[t.value]?.on} onChange={(e) => setB({ ...b, [t.value]: { ...b[t.value], waitMinutes: Number(e.target.value) } })} className={input}>
                  {[30, 60, 120, 240, 480, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 1440 ? "24 hours" : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block font-medium"><Words k="Retry limit for failed messages" />
          <select value={retry} onChange={(e) => setRetry(e.target.value)} className={`${input} mt-1 block w-full`}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "try" : "tries"}</option>)}
          </select>
          <span className="mt-1 block text-sm font-normal text-ink3"><Words k="How many times a failed message can be retried." /></span>
        </label>
        <label className="block font-medium"><Words k="Notice approval rule" />
          <select value={approval} onChange={(e) => setApproval(e.target.value)} className={`${input} mt-1 block w-full`}>
            <option value="parents">Notices to parents need the principal&rsquo;s approval</option>
            <option value="all">Every notice needs approval</option>
            <option value="none">No approval needed</option>
          </select>
          <span className="mt-1 block text-sm font-normal text-ink3"><Words k="The Principal and School Admin publish without approval." /></span>
        </label>
      </div>
      <Problem msg={msg} />
      <Button loading={pending} loadingText="Saving" onClick={() => save(() => saveDeliveryAction({ retryLimit: Number(retry), backup: b, noticeApproval: approval }))}><Words k="Save delivery settings" /></Button>
    </div>
  );
}

// ── Queries ───────────────────────────────────────────────────────────────

export function QueryRulesForm({ on, hours, types, escalateToId, people, rating }: { on: boolean; hours: Record<string, number>; types: Opt[]; escalateToId: string; people: Opt[]; rating: boolean }) {
  const [isOn, setOn] = useState(on);
  const [h, setH] = useState<Record<string, string>>(Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, String(v)])));
  const [esc, setEsc] = useState(escalateToId);
  const [rate, setRate] = useState(rating);
  const { msg, pending, save } = useSave();
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3"><Toggle on={isOn} onChange={setOn} label="Reply time limits on or off" /> <span className="font-medium"><Words k="Reply time limits (response-time targets)" /></span></label>
      <div className={`grid gap-3 sm:grid-cols-4 ${isOn ? "" : "opacity-60"}`}>
        {types.map((t) => (
          <label key={t.value} className="block text-sm font-medium">{t.label}
            <span className="mt-1 flex items-center gap-2"><input type="number" min={1} max={720} disabled={!isOn} value={h[t.value] ?? ""} onChange={(e) => setH({ ...h, [t.value]: e.target.value })} className={`${input} w-24`} /> <Words k="hours" /></span>
          </label>
        ))}
      </div>
      <label className="block text-sm font-medium"><Words k="Escalate overdue queries to" />
        <select value={esc} disabled={!isOn} onChange={(e) => setEsc(e.target.value)} className={`${input} mt-1 block w-full sm:w-96`}>
          <option value="">Choose…</option>
          {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-3"><Toggle on={rate} onChange={setRate} label="Rating request on or off" /> <span><Words k="Ask the requester to rate how it was handled (1 to 5) when a query is closed" /></span></label>
      <Problem msg={msg} />
      <Button loading={pending} loadingText="Saving" onClick={() => save(() => saveQueryRulesAction({ on: isOn, hours: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)])), escalateToId: esc, rating: rate }))}><Words k="Save query rules" /></Button>
    </div>
  );
}

export function TopicList({ topics, owners }: { topics: { id: string; name: string; owner: string; archived: boolean }[]; owners: Opt[] }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const { msg, pending, save } = useSave();
  const start = (t: { id: string; name: string; owner: string } | null) => { setEdit(t?.id ?? "new"); setName(t?.name ?? ""); setOwner(t?.owner ?? ""); };
  const form = (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sunken/70 p-3">
      <label className="text-sm font-medium"><Words k="Topic" /><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={`${input} mt-1 block w-48`} /></label>
      <label className="text-sm font-medium"><Words k="Default owner" />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${input} mt-1 block w-64`}>
          <option value="">Nobody (picked up by hand)</option>
          {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <Button size="sm" loading={pending} loadingText="Saving" onClick={() => save(() => saveTopicAction({ id: edit === "new" ? null : edit, name, owner }), () => setEdit(null))}><Words k="Save" /></Button>
      <Button size="sm" variant="secondary" onClick={() => setEdit(null)}><Words k="Cancel" /></Button>
    </div>
  );
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line">
        {topics.map((t) => (
          <li key={t.id} className="py-2">
            {edit === t.id ? form : (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`min-w-32 font-medium ${t.archived ? "text-ink3 line-through" : ""}`}>{t.name}</span>
                <span className="flex-1 text-sm text-ink3">{owners.find((o) => o.value === t.owner)?.label ?? "No default owner"}</span>
                {!t.archived && <Button size="sm" variant="ghost" onClick={() => start(t)}><Words k="Change" /></Button>}
                <Button size="sm" variant="ghost" onClick={() => save(() => archiveTopicAction(t.id, !t.archived))}>{t.archived ? "Restore" : "Archive"}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {edit === "new" ? form : <Button size="sm" variant="secondary" onClick={() => start(null)}><Words k="Add topic" /></Button>}
      <Problem msg={msg} />
    </div>
  );
}

// ── Opt-out ───────────────────────────────────────────────────────────────

export function OptOutPanel({ ways, rows }: { ways: string[]; rows: { id: string; name: string; detail: string; since: string; how: string; note: string | null }[] }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Awaited<ReturnType<typeof findGuardians>>>([]);
  const [pick, setPick] = useState<{ id: string; name: string; optedOut: boolean } | null>(null);
  const [how, setHow] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { msg, pending, save } = useSave();

  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => { findGuardians(q).then((r) => { if (live) setFound(r); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const submit = (g: { id: string; optedOut: boolean }, optOut: boolean, h: string, n: string) => {
    if (!h) { setErr("Choose how the parent told the school."); return; }
    if (h === "Other" && n.trim().length < 5) { setErr("Write how the parent told the school, in at least 5 characters."); return; }
    setErr(null);
    save(() => optOutAction({ guardianId: g.id, optOut, how: h, note: n }), () => { setPick(null); setQ(""); setFound([]); setHow(""); setNote(""); });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sunken/70 p-3">
        <p className="mb-2 font-medium"><Words k="Record a change" /></p>
        {!pick ? (
          <div className="relative">
            <label htmlFor="oo-q" className="sr-only"><Words k="Find a parent" /></label>
            <input id="oo-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setFound([]); }} placeholder="Find a parent by name or mobile" className={`${input} w-full`} autoComplete="off" />
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
                {found.map((g) => (
                  <li key={g.id}><button type="button" onClick={() => { setPick(g); setFound([]); }} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left hover:bg-sunken/70">
                    <span>{g.name} <span className="text-sm text-ink3">{g.detail}</span></span>{g.optedOut && <span className="text-sm text-bad"><Words k="Opted out" /></span>}
                  </button></li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p><span className="font-medium">{pick.name}</span> {pick.optedOut ? "has opted out. Restart messages?" : "gets messages now. Stop non-emergency messages?"} <button type="button" className="text-sm text-brand underline" onClick={() => setPick(null)}><Words k="Choose another" /></button></p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium"><Words k="How the parent told the school" />
                <select value={how} onChange={(e) => setHow(e.target.value)} className={`${input} mt-1 block w-52`}>
                  <option value="">Choose…</option>
                  {ways.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              <label className="min-w-48 flex-1 text-sm font-medium"><Words k="Note" />
                <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1 block w-full`} />
              </label>
              <Button loading={pending} loadingText="Saving" variant={pick.optedOut ? "primary" : "danger"} onClick={() => submit(pick, !pick.optedOut, how, note)}>{pick.optedOut ? "Restart messages" : "Opt out"}</Button>
            </div>
          </div>
        )}
        {(err || msg) && <div className="mt-2"><Problem msg={err ?? msg} /></div>}
      </div>
      {rows.length === 0 ? <p className="text-ink3"><Words k="No parent has opted out. Emergency messages always reach everyone." /></p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-medium">{r.name}</span> <span className="text-sm text-ink3">{r.detail} <Words k="· since" /> {r.since} · {r.how}{r.note ? ` · ${r.note}` : ""}</span></span>
              <ConfirmButton trigger="Restart messages" title={`Restart messages to ${r.name}?`} confirmLabel="Restart messages"
                onConfirm={async () => { const m = await optOutAction({ guardianId: r.id, optOut: false, how: "Phone call", note: "Restarted from Message Settings" }); return m; }}>
                <Words k="They will get normal messages again, recorded as a phone call. To record another way, find the parent above." />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Saved groups ──────────────────────────────────────────────────────────

export function GroupArchive({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Archive" triggerVariant="ghost" title={`Archive the group "${name}"?`} confirmLabel="Archive group"
      onConfirm={async () => { const m = await archiveGroupAction(id); if (!m) router.refresh(); return m; }}>
      <Words k="It can no longer be chosen in Send Message. Messages already sent to it are not changed." />
    </ConfirmButton>
  );
}

// ── Parent Link ───────────────────────────────────────────────────────────

export function ParentLinkForm({ on, shows, switches, autoSend, codeMinutes, deviceDays, templateHref }: { on: boolean; shows: Record<string, boolean>; switches: { key: string; label: string; description: string }[]; autoSend: boolean; codeMinutes: number; deviceDays: number; templateHref: string | null }) {
  const [isOn, setOn] = useState(on);
  const [s, setS] = useState(shows);
  const [auto, setAuto] = useState(autoSend);
  const [code, setCode] = useState(String(codeMinutes));
  const [days, setDays] = useState(String(deviceDays));
  const { msg, pending, save } = useSave();
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3"><Toggle on={isOn} onChange={setOn} label="Parent Link on or off" /> <span className="font-medium"><Words k="Parent Link is" /> {isOn ? "on" : "off"} <Words k="for the school" /></span></label>
      <fieldset disabled={!isOn} className={isOn ? "" : "opacity-60"}>
        <legend className="mb-1 font-medium"><Words k="What it shows" /></legend>
        <ul className="space-y-1">
          {switches.map((w) => (
            <li key={w.key}><label className="flex min-h-11 items-start gap-3 py-1">
              <input type="checkbox" className={`${box} mt-0.5`} checked={s[w.key] !== false} onChange={(e) => setS({ ...s, [w.key]: e.target.checked })} />
              <span><span className="font-medium">{w.label}</span> <span className="block text-sm text-ink3">{w.description}</span></span>
            </label></li>
          ))}
        </ul>
        <p className="mt-1 text-sm text-ink3"><Words k="Fees and Pay, receipts, attendance this month, the datesheet and report cards are added here as their modules are switched on." /></p>
      </fieldset>
      <label className="flex items-center gap-3"><Toggle on={auto} onChange={setAuto} label="Send links on admission" /> <span><Words k="Send links automatically when an admission is approved" />{templateHref && <> (<a href={templateHref} className="text-brand underline"><Words k="template" /></a>)</>}</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium"><Words k="One-time code valid for" />
          <span className="mt-1 flex items-center gap-2"><input type="number" min={5} max={30} value={code} onChange={(e) => setCode(e.target.value)} className={`${input} w-24`} /> <Words k="minutes" /></span>
        </label>
        <label className="block text-sm font-medium"><Words k="A verified phone stays verified for" />
          <span className="mt-1 flex items-center gap-2"><input type="number" min={7} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={`${input} w-24`} /> <Words k="days" /></span>
        </label>
      </div>
      <Problem msg={msg} />
      <Button loading={pending} loadingText="Saving" onClick={() => {
        const c = Number(code), d = Number(days);
        if (!Number.isInteger(c) || c < 5 || c > 30) return save(async () => "The one-time code can be valid for 5 to 30 minutes.");
        if (!Number.isInteger(d) || d < 7 || d > 365) return save(async () => "A verified phone can stay verified for 7 to 365 days.");
        save(() => saveParentLinkAction({ on: isOn, shows: s, autoSendOnAdmission: auto, codeMinutes: c, deviceDays: d }));
      }}><Words k="Save Parent Link settings" /></Button>
    </div>
  );
}

// ── Optional pages ────────────────────────────────────────────────────────

/** WhatsApp Inbox and Surveys, switched on for this school only (School Feature). */
export function FeatureSwitches({ features }: { features: { key: string; label: string; description: string; on: boolean }[] }) {
  const [on, setOn] = useState(Object.fromEntries(features.map((f) => [f.key, f.on])));
  const { msg, pending, save } = useSave();
  return (
    <>
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {features.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-5 py-3.5">
            <label htmlFor={`feat-${f.key}`} className="min-w-0 flex-1 text-[14px]">
              <b className="font-semibold block">{f.label}</b>
              <span className="text-[12.5px] text-ink3">{f.description}</span>
            </label>
            <Switch id={`feat-${f.key}`} on={on[f.key]} label={f.label} disabled={pending}
              onChange={(v) => { setOn({ ...on, [f.key]: v }); save(() => setCommFeatureAction(f.key, v)); }} />
          </li>
        ))}
      </ul>
      {msg && <div className="px-5 pb-4"><Problem msg={msg} /></div>}
    </>
  );
}
