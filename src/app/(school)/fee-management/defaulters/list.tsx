"use client";

// The defaulters list with selection, bulk actions and the reminder sheet
// (mod-fees.jsx Defaulters and ReminderSheet). Rows open the student's
// reminder and call history (?who=), worked out on the server.

import { SMS_OFFERED } from "@/lib/messaging/sms-offered";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, PhoneCall, Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Segmented, Switch } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Banner, SettingRow } from "@/components/money/kit";
import { SelectField, TextArea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { formatRupeesShort } from "@/lib/format";
import { previewReminderAction, sendReminderAction, type PreviewResult } from "./actions";
import { Words, useT } from "@/lib/i18n/client";

export type DefaulterItem = {
  id: string;
  name: string;
  adm: string;
  photo: string | null;
  cls: string;
  parent: string;
  phone: string;
  amount: string;
  amountShort: string;
  amountPaise: string;
  /** With one ageing group chosen, the student's whole overdue ("of ₹30,000 overdue"); the amount shown is the group's. */
  ofAll?: string | null;
  heads: string;
  since: string;
  days: number;
  tone: "bad" | "warn" | "neutral";
  lastReminder: string | null;
  reminders: number;
  promised: string | null;
  /** Promise to Pay (when on): "Promised for 25-10-2026", or a broken promise, which puts the family first. */
  promise: { words: string; tone: "info" | "bad" } | null;
};

type Option = { value: string; label: string };
const PAGE = 50;

export function DefaulterList({ rows, canEdit, canCollect = canEdit, footer, empty, openAll, templates, gateway, csvHref, whoHref }: {
  rows: DefaulterItem[];
  canEdit: boolean;
  /** Sits at the fee counter (not the Principal or School Admin, who read this page). */
  canCollect?: boolean;
  footer: React.ReactNode;
  empty: React.ReactNode;
  openAll: boolean;
  templates: Record<"whatsapp" | "sms" | "email", Option[]>;
  gateway: boolean;
  csvHref: string;
  whoHref: Record<string, string>;
}) {
  const router = useRouter();
  const tr = useT();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [send, setSend] = useState<DefaulterItem[] | null>(openAll ? rows : null);
  const [seen, setSeen] = useState({ openAll, rows });
  // 50 a page (layman loop 2: 321 rows made one 21,000 px page). Sending to all still means every row.
  const [page, setPage] = useState(1);
  if (seen.openAll !== openAll || seen.rows !== rows) {
    setSeen({ openAll, rows });
    if (seen.rows !== rows) setPage(1);
    if (openAll) setSend(rows);
  }
  const closeSend = () => {
    setSend(null);
    if (sp.get("send")) {
      const u = new URLSearchParams(sp.toString());
      u.delete("send");
      router.replace(u.size ? `${pathname}?${u}` : pathname, { scroll: false });
    }
  };
  if (!rows.length) return <>{empty}</>;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * PAGE, at * PAGE);
  const allOn = shown.every((r) => sel.has(r.id));
  const toggle = (k: string) => setSel((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chosen = rows.filter((r) => sel.has(r.id));
  const callList = `${csvHref}${csvHref.includes("?") ? "&" : "?"}format=csv&calls=1&${chosen.map((r) => `id=${r.id}`).join("&")}`;

  return (
    <>
      {canEdit && sel.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap">
          <p className="text-[13.5px] font-semibold text-brand mr-2">{sel.size} <Words k="selected" /></p>
          <Button size="sm" variant="secondary" icon={Send} onClick={() => setSend(chosen)}><Words k="Send reminder" /></Button>
          <a href={callList} download className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line bg-surface text-[13.5px] font-semibold hover:bg-sunken"><PhoneCall size={15} aria-hidden="true" /><Words k="Call list" /></a>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}><Words k="Clear" /></Button>
        </div>
      )}
      <div className="hidden lg:block overflow-x-auto scroll-thin">
        <table className="w-full text-left text-[14px]" style={{ minWidth: 900 }}>
          <caption className="sr-only"><Words k="Students with overdue fees" /></caption>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {canEdit && <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && shown.some((r) => sel.has(r.id))} onChange={() => setSel((x) => { const n = new Set(x); for (const r of shown) { if (allOn) n.delete(r.id); else n.add(r.id); } return n; })} /></th>}
              {["Student", "Class", "Parent", "Overdue", "Oldest due", "Last reminder", ""].map((l, i) => (
                <th key={i} scope="col" className={cx("px-3 py-3 font-semibold whitespace-nowrap", i === 0 && !canEdit && "pl-5", l === "Overdue" && "text-right")}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className={cx("border-b border-line/70 last:border-0 transition group relative", sel.has(d.id) ? "bg-brand/5" : "hover:bg-sunken/60")}>
                {canEdit && <td className="pl-4 pr-2 py-3 relative z-10"><Checkbox label={`Select ${d.name}`} checked={sel.has(d.id)} onChange={() => toggle(d.id)} /></td>}
                <td className={cx("px-3 py-2.5", !canEdit && "pl-5")}>
                  <Link href={whoHref[d.id]} scroll={false} className="absolute inset-0" aria-label={`Open ${d.name}`} />
                  <div className="flex items-center gap-3"><Avatar name={d.name} size={34} src={d.photo} /><div className="min-w-0"><p className="font-semibold leading-tight">{d.name}</p><p className="text-[12px] text-ink3 font-mono">{d.adm}</p></div></div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{d.cls}</td>
                <td className="px-3 py-2.5"><p className="leading-tight">{d.parent || "—"}</p><p className="text-[12.5px] text-ink3 tnum">{d.phone}</p></td>
                <td className="px-3 py-2.5 text-right tnum"><p className="font-semibold">{d.amount}</p>{d.ofAll && <p className="text-[12px] text-ink3">{tr.any(d.ofAll)}</p>}<p className="text-[12px] text-ink3 max-w-[180px] truncate ml-auto">{d.heads}</p></td>
                <td className="px-3 py-2.5"><p className="tnum">{d.since}</p><Pill tone={d.tone} className="!h-5 !text-[11px]">{d.days} <Words k="days" /></Pill></td>
                <td className="px-3 py-2.5">
                  {d.promise && <Pill tone={d.promise.tone} className="!h-5 !text-[11px] mb-1">{d.promise.words}</Pill>}
                  {d.promise && !d.lastReminder ? <p className="text-[12px] text-ink3">{d.promise.tone === "info" ? "Reminders paused" : "Not reminded yet"}</p> : d.lastReminder ? <><p className="text-[13px]">{d.lastReminder}</p><p className="text-[12px] text-ink3">{d.reminders} <Words k="sent" />{d.promised ? ` · promised ${d.promised}` : ""}</p></>
                    : <span className="text-[13px] text-ink3">{d.promised ? `Promised ${d.promised}` : "Not reminded yet"}</span>}
                </td>
                <td className="pr-5 pl-3 py-2.5 relative z-10 text-right">{canCollect && <ButtonLink size="sm" variant="soft" href={`/fee-management/collect/${d.id}`}><Words k="Collect" /></ButtonLink>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="lg:hidden divide-y divide-line/70">
        {shown.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            {canEdit && <Checkbox label={`Select ${d.name}`} checked={sel.has(d.id)} onChange={() => toggle(d.id)} />}
            <Link href={whoHref[d.id]} scroll={false} className="flex items-center gap-3 min-w-0 flex-1 active:bg-sunken">
              <Avatar name={d.name} size={42} src={d.photo} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{d.name}</p>
                {/* The fee items on their own line: "Class 7 B · Tuiti…" lost what is owed (phone-width PW-09). */}
                <p className="text-[13px] text-ink3 truncate">{d.cls}</p>
                <p className="text-[12.5px] text-ink3 line-clamp-2">{d.heads}</p>
                {d.promise && <p className={cx("text-[12.5px] font-semibold truncate", d.promise.tone === "bad" ? "text-bad" : "text-info")}>{d.promise.words}</p>}
              </div>
              <div className="text-right shrink-0"><p className="font-semibold tnum">{d.amount}</p>{d.ofAll && <p className="text-[11.5px] text-ink3 tnum">{tr.any(d.ofAll)}</p>}<Pill tone={d.tone} className="!h-5 !text-[11px]">{d.days} <Words k="days" /></Pill></div>
              <ChevronRight size={18} className="text-ink3 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3 flex-wrap"><span className="tnum">{footer}</span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={at <= 1} onClick={() => setPage(at - 1)}><Words k="Previous" /></Button>
            <span className="tnum">{at} / {pages}</span>
            <Button size="sm" variant="secondary" disabled={at >= pages} onClick={() => setPage(at + 1)}><Words k="Next" /></Button>
          </span>
        )}
      </div>
      {send && send.length > 0 && canEdit && <ReminderSheet list={send} onClose={closeSend} onSent={() => { setSel(new Set()); closeSend(); }} templates={templates} gateway={gateway} />}
    </>
  );
}

// SMS is not offered while SMS_OFFERED is false (owner, 15 Nov 2026).
const CHANNELS = [{ value: "whatsapp", label: "WhatsApp" }, ...(SMS_OFFERED ? [{ value: "sms", label: "SMS" }] : []), { value: "email", label: "Email" }];
const OWN = "__own";

function ReminderSheet({ list, onClose, onSent, templates, gateway }: { list: DefaulterItem[]; onClose: () => void; onSent: () => void; templates: Record<"whatsapp" | "sms" | "email", Option[]>; gateway: boolean }) {
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const opts = templates[channel];
  const [tpl, setTpl] = useState(opts[0]?.value ?? OWN);
  // {how_to_pay} is each parent's own way to pay: their Parent Link, a payment link, or "Please pay at the school office." (src/lib/fees/reminder-pay.ts),
  // so the words never promise online payment that is off.
  const [text, setText] = useState("Dear {guardian_name}, fees of {due_amount} for {student_name} ({class}) are overdue since {due_date}. {how_to_pay} - {school_name}");
  const [link, setLink] = useState(gateway);
  const [when, setWhen] = useState("now");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(sendReminderAction as never, null);
  const formRef = useRef<HTMLFormElement>(null);
  const n = list.length;
  const total = useMemo(() => list.reduce((a, d) => a + BigInt(d.amountPaise), BigInt(0)), [list]);
  const totalShort = list.length === 1 ? list[0].amountShort : formatRupeesShort(total);
  const ownWording = tpl === OWN;

  /** A new channel: SMS needs an approved template; the others keep the wording when it exists there. */
  const pickChannel = (c: typeof channel) => {
    const first = templates[c][0]?.value ?? OWN;
    setChannel(c);
    setTpl(c === "sms" ? first : (templates[c].some((t) => t.value === tpl) || tpl === OWN ? tpl : first));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (!formRef.current) return;
      const fd = new FormData(formRef.current);
      startCheck(async () => setPreview(await previewReminderAction(fd)));
    }, 300);
    return () => clearTimeout(t);
  }, [channel, tpl, text, link, when, list]);

  useEffect(() => { if (state?.ok) onSent(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = !preview || !preview.ok || Boolean(preview.creditProblem) || preview.problems.length > 0 || preview.recipients === 0 || (channel === "sms" && ownWording);
  // One count everywhere, from the server's plan: parents reached, messages sent (one per child), and their cost.
  const ready = preview?.ok ? preview : null;
  const parents = (k: number) => `${k} ${k === 1 ? "parent" : "parents"}`;
  const label = ready ? `${when === "now" ? "Send to" : "Schedule for"} ${parents(ready.recipients)}` : preview ? "Send reminder" : "Checking…";
  const channelLabel = CHANNELS.find((c) => c.value === channel)!.label;

  return (
    <Dialog open onClose={onClose} wide title={ready ? `Send fee reminder to ${parents(ready.recipients)}` : "Send fee reminder"}
      sub={`${n} ${n === 1 ? "student" : "students"} on the list. Check the message, the count and the cost before sending.`}
      footer={<>
        <Button variant="ghost" onClick={onClose}><Words k="Cancel" /></Button>
        <Button variant="primary" icon={Send} disabled={blocked || checking} loading={pending} onClick={() => formRef.current?.requestSubmit()}>{label}</Button>
      </>}>
      <form ref={formRef} action={action} className="flex flex-col gap-4">
        {list.map((d) => <input key={d.id} type="hidden" name="studentId" value={d.id} />)}
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="when" value={when} />
        {link && <input type="hidden" name="link" value="on" />}
        {!ownWording && <input type="hidden" name="templateId" value={tpl} />}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[["Parents", ready ? ready.recipients : "…"], ["Overdue", totalShort], ["Cost", ready ? (ready.testMode ? "None (test mode)" : `${ready.cost} ${ready.cost === 1 ? "credit" : "credits"}`) : "…"]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className="font-display text-[19px] font-semibold tnum leading-tight truncate">{v}</p></div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-ink2"><Words k="Send by" /></span><Segmented label="Send by" value={channel} onChange={(v) => pickChannel(v as typeof channel)} options={CHANNELS} className="w-full" /></div>
          <SelectField name="_tpl" label="Ready message" value={tpl} onChange={(e) => setTpl(e.target.value)}
            options={[...opts, ...(channel === "sms" ? [] : [{ value: OWN, label: "Write my own message" }])]} placeholder={opts.length || channel !== "sms" ? undefined : "No approved SMS template"} />
        </div>
        {ownWording && channel !== "sms" && (
          <TextArea name="text" label="Message" rows={3} value={text} onChange={(e) => setText(e.target.value)} help="Words in { } fill in by themselves: {guardian_name}, {due_amount}, {student_name}, {class}, {due_date}, {how_to_pay}, {link}, {school_name}. Do not change them." />
        )}
        {channel === "sms" && opts.length === 0 && <Alert tone="warning"><Words k="SMS needs an approved template. Add one in Communication, Templates (category Fees), or choose WhatsApp." /></Alert>}
        <div className="rounded-2xl border border-line divide-y divide-line/70">
          {gateway
            ? <SettingRow title="Add the payment link" sub="A link to pay online, valid 7 days. Off: pay at the school office."><Switch on={link} onChange={setLink} label="Add the payment link" /></SettingRow>
            : <SettingRow title="Payment link" sub="Online payment is not set up. Ask DREAM TEAM." />}
          <SettingRow title="Send" sub={when === "now" ? "Goes out now" : "Goes out tomorrow at 9:00 AM"}><Segmented size="sm" label="When" value={when} onChange={setWhen} options={[{ value: "now", label: "Now" }, { value: "later", label: "Tomorrow 9 AM" }]} /></SettingRow>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5">
            {ready?.sampleFor ? `Preview for ${ready.sampleFor.parent}${ready.sampleFor.students.length ? `, about ${ready.sampleFor.students.join(" and ")}` : ""}${ready.messages > 1 ? ` (1 of ${ready.messages} messages)` : ""}` : "Preview"}
          </p>
          <div className="rounded-2xl bg-ok/8 border border-ok/20 p-3.5 text-[14px] leading-relaxed max-w-md whitespace-pre-line">
            {preview?.ok ? preview.sample ?? "Nobody on this list can get the message." : checking ? "Getting the preview…" : "—"}
          </div>
        </div>
        {preview && !preview.ok && <Alert tone="danger">{preview.message}</Alert>}
        {preview?.ok && preview.testMode && <Banner tone="warn" title="Test mode: nothing is sent, no credits used." />}
        {preview?.ok && (
          <Banner tone={preview.creditProblem || preview.problems.length ? "bad" : "info"}
            title={preview.creditProblem ?? preview.problems[0] ?? `${preview.messages} ${channelLabel} ${preview.messages === 1 ? "message" : "messages"} to ${parents(preview.recipients)}${preview.messages > preview.recipients ? " (one for each child)" : ""}.${preview.testMode ? "" : ` Cost: ${preview.cost} ${preview.cost === 1 ? "credit" : "credits"}. This cannot be unsent.`}`}>
            {/* Every student on the list is counted: reached, skipped (with names) or owing nothing now (loop 4). */}
            {[
              `${preview.reached} of ${preview.students} ${preview.students === 1 ? "student" : "students"} covered`,
              ...preview.skipped.map((s) => `${s.count} skipped: ${s.reason.toLowerCase()}${s.names.length ? ` (${s.names.join(", ")}${s.count > s.names.length ? "…" : ""})` : ""}`),
              preview.nothingDue ? `${preview.nothingDue} owe nothing now` : null,
            ].filter(Boolean).join(" · ")}
          </Banner>
        )}
        {state && !state.ok && state.message && <Alert tone="danger">{state.message}</Alert>}
      </form>
    </Dialog>
  );
}
