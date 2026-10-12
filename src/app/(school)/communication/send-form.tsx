"use client";

// Send Message in three parts: who, what, check and send (11-communication.md).
// The form is checked here first and again on the server; "Check and send"
// shows the count, the credit cost, who is left out and a real preview.
import Link from "next/link";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { checkOrSend, findPeople, saveGroup, type SendState } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Channel = "whatsapp" | "sms" | "email" | "app";
export type SendFormData = {
  year: string | null;
  classes: { id: string; name: string }[];
  sections: { id: string; classId: string; label: string }[];
  on: Channel[];
  preferred: Channel;
  templates: { id: string; name: string; category: string; channel: Channel; body: string; subject: string | null; languages: string[]; usable: boolean; locked: boolean }[];
  roles: { key: string; name: string }[];
  departments: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  balances: { whatsapp: number; sms: number };
  backupDefaults: Record<string, boolean>;
  smsReady: boolean;
  scopeLabel: string;
  staffAllowed: boolean;
  wholeSchool: boolean;
  canEmergency: boolean;
  canSend: boolean;
  sendKey: string;
  timeZone: string;
  channelLabels: Record<Channel, string>;
  /** People chosen before the page opened, e.g. the parents of students chosen on the Student List. */
  initialPeople?: Person[];
  /** Why some chosen students were left out (outside the sender's classes, or not studying). */
  initialNote?: string | null;
};

const KINDS = [
  { key: "parents", label: "Parents", staff: false },
  { key: "students", label: "Students", staff: false },
  { key: "staff", label: "Staff", staff: true },
  { key: "teachers", label: "Teachers", staff: true },
  { key: "admins", label: "Admins", staff: true },
];
const TYPES = [
  { key: "general", label: "General" },
  { key: "fee", label: "Fee" },
  { key: "attendance", label: "Attendance" },
  { key: "result", label: "Result" },
];
export type Person = { type: "guardian" | "student" | "staff" | "parentsOf"; id: string; name: string; detail: string };
const PERSON_FIELD: Record<Person["type"], string> = { guardian: "guardianIds", student: "studentIds", staff: "staffIds", parentsOf: "guardiansOf" };

const chip = (on: boolean) =>
  `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand ${on ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line-strong bg-surface hover:bg-surface-2"}`;

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <p id={id} className="mt-1 text-sm text-danger">{text}</p> : null;
}

export function SendForm({ data }: { data: SendFormData }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState<SendState, FormData>(checkOrSend, null);
  const [groupState, dispatchGroup, groupPending] = useActionState<SendState, FormData>(saveGroup, null);
  const [kinds, setKinds] = useState<string[]>(data.initialPeople?.length ? [] : ["parents"]);
  const [sections, setSections] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [groupId, setGroupId] = useState("");
  const [people, setPeople] = useState<Person[]>(data.initialPeople ?? []);
  const [channels, setChannels] = useState<Channel[]>([data.preferred]);
  const [tpl, setTpl] = useState<Partial<Record<Channel, string>>>({});
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("general");
  const [backup, setBackup] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [word, setWord] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sample, setSample] = useState(0);
  const [stale, setStale] = useState(true);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [showGroup, setShowGroup] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touch = () => setStale(true);
  const preview = !stale && state?.preview ? state.preview : null;
  const serverErrors = state?.errors ?? {};
  const err = (k: string) => errors[k] ?? serverErrors[k];

  const templatesFor = (ch: Channel) => data.templates.filter((t) => t.channel === ch && t.usable);
  const chosenTemplates = channels.map((c) => data.templates.find((t) => t.id === tpl[c])).filter(Boolean) as SendFormData["templates"];
  const needsText = channels.some((c) => c !== "sms" && !tpl[c]);
  const needsTitle = channels.some((c) => (c === "app" || c === "email") && !tpl[c]);
  const backupAllowed = type !== "general" && channels.some((c) => c !== "sms");
  const smsBackupTemplates = templatesFor("sms");
  const staffChosen = kinds.some((k) => ["staff", "teachers", "admins"].includes(k));
  const sectionsByClass = useMemo(() => data.classes.map((c) => ({ ...c, sections: data.sections.filter((s) => s.classId === c.id) })), [data.classes, data.sections]);

  function toggle<T>(list: T[], v: T, set: (x: T[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    touch();
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!kinds.length && !groupId && !people.length) e.kinds = "Choose who gets the message.";
    if (!channels.length) e.channels = "Choose at least one channel.";
    if (channels.includes("sms") && !tpl.sms) e.template_sms = "Choose an SMS template. An SMS can only be sent from a template with a DLT template ID.";
    if (needsText && !text.trim()) e.text = "Type the message, or choose a template.";
    if (text.length > 1000) e.text = `The message has ${text.length} characters. It can have at most 1000.`;
    if (needsTitle && !title.trim()) e.title = "Give the message a title. App notifications and emails show it first.";
    if (when === "later") {
      if (!at) e.scheduledAt = "Choose the date and time to send.";
    }
    if (backup && backupAllowed && !channels.includes("sms") && !smsBackupTemplates.length) e.smsBackup = "SMS backup needs an SMS template with a DLT template ID. Add one in Message Templates, or untick SMS backup.";
    return e;
  }

  function submit(intent: "check" | "send") {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    const fd = new FormData(formRef.current!);
    fd.set("intent", intent);
    if (intent === "send" && state?.preview) fd.set("fingerprint", state.preview.fingerprint);
    if (intent === "check") setSample(0);
    setStale(false);
    startTransition(() => dispatch(fd));
  }

  function lookFor(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setFound(await findPeople(q)); } catch { setFound([]); } finally { setSearching(false); }
    }, 300);
  }

  const smsTemplatesMissing = channels.includes("sms") && templatesFor("sms").length === 0;

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit("check"); }} className="space-y-6" noValidate>
      <input type="hidden" name="sendKey" value={data.sendKey} />
      {state && !state.ok && state.message && !stale && <Alert tone="danger">{state.message}</Alert>}

      {/* WHO */}
      <section aria-labelledby="who" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 id="who" className="text-lg font-semibold">1. Who</h2>
        <p className="text-sm text-ink-2">You can reach: {data.scopeLabel}.</p>
        {data.initialPeople && data.initialPeople.length > 0 && (
          <Alert tone="info" className="mt-3">
            The main contact of each of the {data.initialPeople.length} student{data.initialPeople.length === 1 ? "" : "s"} you chose is added below. Tick &ldquo;Both parents&rdquo; to reach every guardian.
            {data.initialNote && <span className="mt-1 block">{data.initialNote}</span>}
          </Alert>
        )}
        <fieldset className="mt-3" aria-describedby={err("kinds") ? "e-kinds" : undefined}>
          <legend className="mb-2 text-sm font-medium">Recipient type</legend>
          <div className="flex flex-wrap gap-2" id="f-kinds" tabIndex={-1}>
            {KINDS.filter((k) => !k.staff || data.staffAllowed).map((k) => (
              <label key={k.key} className={chip(kinds.includes(k.key))}>
                <input type="checkbox" name="kinds" value={k.key} checked={kinds.includes(k.key)} onChange={() => toggle(kinds, k.key, setKinds)} className="sr-only" />
                {k.label}
              </label>
            ))}
          </div>
          <FieldError id="e-kinds" text={err("kinds")} />
        </fieldset>

        {(kinds.includes("parents") || kinds.includes("students")) && sectionsByClass.length > 0 && (
          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium">Narrow by class or section</legend>
            <p className="mb-2 text-sm text-ink-2">{sections.length || classes.length ? "Only the classes and sections ticked." : data.wholeSchool ? "Nothing ticked: the whole school." : "Nothing ticked: all your sections."}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sectionsByClass.map((c) => (
                <div key={c.id} className="rounded-xl border border-line p-3">
                  {data.wholeSchool ? (
                    <label className="flex min-h-11 items-center gap-2 font-medium">
                      <input type="checkbox" name="classIds" value={c.id} checked={classes.includes(c.id)} onChange={() => toggle(classes, c.id, setClasses)} className="size-5 accent-brand" />
                      {c.name} (all sections)
                    </label>
                  ) : <p className="font-medium">{c.name}</p>}
                  <div className="flex flex-wrap gap-x-4">
                    {c.sections.map((s) => (
                      <label key={s.id} className="flex min-h-11 items-center gap-2">
                        <input type="checkbox" name="sectionIds" value={s.id} checked={sections.includes(s.id) || classes.includes(c.id)} disabled={classes.includes(c.id)}
                          onChange={() => toggle(sections, s.id, setSections)} className="size-5 accent-brand" />
                        {s.label.replace(`${c.name} `, "")}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {(kinds.includes("parents") || people.some((p) => p.type === "parentsOf")) && (
          <label className="mt-3 flex min-h-11 items-center gap-2">
            <input type="checkbox" name="allGuardians" onChange={touch} className="size-5 accent-brand" />
            Both parents, not only the main contact
          </label>
        )}

        {staffChosen && data.roles.length > 0 && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Narrow by role (optional)</legend>
            <div className="flex flex-wrap gap-x-4">
              {data.roles.map((r) => (
                <label key={r.key} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="roleKeys" value={r.key} onChange={touch} className="size-5 accent-brand" />{r.name}
                </label>
              ))}
            </div>
            {data.departments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4">
                <span className="w-full text-sm font-medium">Department (optional)</span>
                {data.departments.map((d) => (
                  <label key={d.id} className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name="departmentIds" value={d.id} onChange={touch} className="size-5 accent-brand" />{d.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="f-groupId" className="mb-1 block text-sm font-medium">Saved group</label>
            <select id="f-groupId" name="groupId" value={groupId} onChange={(e) => { setGroupId(e.target.value); touch(); }} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3">
              <option value="">No group</option>
              {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {data.groups.length === 0 && <p className="mt-1 text-sm text-ink-2">Save a set of recipients below to reuse it.</p>}
          </div>
          <div className="relative">
            <label htmlFor="f-people" className="mb-1 block text-sm font-medium">Add people one by one</label>
            <input id="f-people" type="search" value={search} onChange={(e) => lookFor(e.target.value)} placeholder="Name, admission number or phone"
              className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3" autoComplete="off" aria-controls="people-results" />
            {search.trim().length >= 2 && (
              <ul id="people-results" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface shadow-pop">
                {searching && <li className="p-3 text-sm text-ink-2">Searching…</li>}
                {!searching && found.length === 0 && <li className="p-3 text-sm text-ink-2">Nobody found in your scope.</li>}
                {found.map((p) => (
                  <li key={`${p.type}:${p.id}`}>
                    <button type="button" className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2"
                      onClick={() => { if (!people.some((x) => x.id === p.id)) setPeople([...people, p]); setSearch(""); setFound([]); touch(); }}>
                      <span className="font-medium">{p.name}</span><span className="text-sm text-ink-2">{p.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {people.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="People added">
            {people.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-brand-text">
                <input type="hidden" name={PERSON_FIELD[p.type]} value={p.id} />
                {p.name}
                <button type="button" aria-label={`Remove ${p.name}`} onClick={() => { setPeople(people.filter((x) => x.id !== p.id)); touch(); }} className="grid size-8 place-items-center rounded-full hover:bg-surface">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* WHAT */}
      <section aria-labelledby="what" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 id="what" className="text-lg font-semibold">2. What</h2>
        <fieldset className="mt-3">
          <legend className="mb-2 text-sm font-medium">Channel <span className="text-danger" aria-hidden>*</span></legend>
          <div className="flex flex-wrap gap-2" id="f-channels" tabIndex={-1}>
            {(["whatsapp", "sms", "email", "app"] as Channel[]).map((c) => {
              const off = !data.on.includes(c);
              return (
                <label key={c} className={`${chip(channels.includes(c))} ${off ? "cursor-not-allowed opacity-55" : ""}`} title={off ? "Switched off in Settings, SMS, WhatsApp & Email" : undefined}>
                  <input type="checkbox" name="channels" value={c} checked={channels.includes(c)} disabled={off} onChange={() => toggle(channels, c, setChannels)} className="sr-only" />
                  {data.channelLabels[c]}{off ? " (off)" : ""}
                </label>
              );
            })}
          </div>
          <FieldError id="e-channels" text={err("channels")} />
          {data.on.length < 4 && <p className="mt-1 text-sm text-ink-2">Channels marked off are switched on in <Link href="/settings/messaging" className="underline">Settings, SMS, WhatsApp &amp; Email</Link>.</p>}
          {channels.includes("sms") && !data.smsReady && <Alert tone="warning" className="mt-2">Add your DLT entity ID and sender header in Settings, SMS, WhatsApp &amp; Email before sending SMS.</Alert>}
        </fieldset>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {channels.filter((c) => c !== "app" || templatesFor("app").length).map((c) => (
            <div key={c}>
              <label htmlFor={`f-template_${c}`} className="mb-1 block text-sm font-medium">
                {data.channelLabels[c]} template{c === "sms" && <span className="text-danger" aria-hidden> *</span>}
              </label>
              <select id={`f-template_${c}`} name={`template_${c}`} value={tpl[c] ?? ""} onChange={(e) => { setTpl({ ...tpl, [c]: e.target.value }); touch(); }}
                aria-invalid={err(`template_${c}`) ? true : undefined} aria-describedby={`e-template_${c}`}
                className={`h-11 w-full rounded-lg border bg-surface px-3 ${err(`template_${c}`) ? "border-danger" : "border-line-strong"}`}>
                <option value="">{c === "sms" ? "Choose an SMS template" : "No template: type the message"}</option>
                {templatesFor(c).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.category}</option>)}
              </select>
              <FieldError id={`e-template_${c}`} text={err(`template_${c}`)} />
              {c === "sms" && smsTemplatesMissing && (
                <p className="mt-1 text-sm text-danger">No SMS template has a DLT template ID yet. Add it in <Link href="/communication/templates?channel=sms" className="underline">Message Templates</Link>, or send by WhatsApp.</p>
              )}
            </div>
          ))}
        </div>

        {chosenTemplates.length > 0 && (
          <div className="mt-4 space-y-2">
            {chosenTemplates.map((t) => (
              <div key={t.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                <p className="font-medium">{data.channelLabels[t.channel]}: {t.name} <span className="font-normal text-ink-2">({t.languages.length} language{t.languages.length === 1 ? "" : "s"})</span></p>
                <p className="mt-1 whitespace-pre-line">{t.body}</p>
                {t.locked && <p className="mt-1 text-ink-2">This template is approved{t.channel === "sms" ? " on the DLT portal" : " by WhatsApp"}, so its words are fixed. Only the blanks in {"{ }"} are filled for each person.</p>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-4">
          <div>
            <label htmlFor="f-title" className="mb-1 block text-sm font-medium">Title{needsTitle && <span className="text-danger" aria-hidden> *</span>}</label>
            <input id="f-title" name="title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); touch(); }} aria-invalid={err("title") ? true : undefined} aria-describedby="e-title"
              className={`h-11 w-full rounded-lg border bg-surface px-3 ${err("title") ? "border-danger" : "border-line-strong"}`} placeholder={needsTitle ? "For app notifications and emails" : "Optional"} />
            <FieldError id="e-title" text={err("title")} />
          </div>
          {needsText && (
            <div>
              <label htmlFor="f-text" className="mb-1 block text-sm font-medium">Message <span className="text-danger" aria-hidden>*</span></label>
              <textarea id="f-text" name="text" rows={5} value={text} maxLength={1000} onChange={(e) => { setText(e.target.value); touch(); }} aria-invalid={err("text") ? true : undefined} aria-describedby="e-text h-text"
                className={`w-full rounded-lg border bg-surface px-3 py-2 ${err("text") ? "border-danger" : "border-line-strong"}`} />
              <FieldError id="e-text" text={err("text")} />
              <p id="h-text" className="mt-1 text-sm text-ink-2">{text.length} of 1000 characters. Blanks like {"{student_name}"} are filled for each person.</p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="f-messageType" className="mb-1 block text-sm font-medium">Message type</label>
            <select id="f-messageType" name="messageType" value={type} onChange={(e) => { setType(e.target.value); setBackup(Boolean(data.backupDefaults[e.target.value])); touch(); }} className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3">
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {backupAllowed && (
            <div>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="smsBackup" checked={backup} onChange={(e) => { setBackup(e.target.checked); touch(); }} className="size-5 accent-brand" id="f-smsBackup" />
                If not delivered or read, also send by SMS
              </label>
              {backup && (
                <select name="backupTemplateId" aria-label="SMS template for the backup" onChange={touch} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3">
                  {smsBackupTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <FieldError id="e-smsBackup" text={err("smsBackup")} />
            </div>
          )}
        </div>
      </section>

      {/* CHECK AND SEND */}
      <section aria-labelledby="check" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <h2 id="check" className="text-lg font-semibold">3. Check and send</h2>
        <fieldset className="mt-3">
          <legend className="mb-2 text-sm font-medium">When</legend>
          <div className="flex flex-wrap gap-2">
            <label className={chip(when === "now")}><input type="radio" name="when" value="now" checked={when === "now"} onChange={() => { setWhen("now"); touch(); }} className="sr-only" />Send now</label>
            <label className={chip(when === "later")}><input type="radio" name="when" value="later" checked={when === "later"} onChange={() => { setWhen("later"); touch(); }} className="sr-only" />Schedule for later</label>
          </div>
          {when === "later" && (
            <div className="mt-2 max-w-xs">
              <label htmlFor="f-scheduledAt" className="mb-1 block text-sm font-medium">Date and time</label>
              <input id="f-scheduledAt" type="datetime-local" name="scheduledAt" value={at} onChange={(e) => { setAt(e.target.value); touch(); }} aria-describedby="e-scheduledAt"
                className={`h-11 w-full rounded-lg border bg-surface px-3 ${err("scheduledAt") ? "border-danger" : "border-line-strong"}`} />
              <FieldError id="e-scheduledAt" text={err("scheduledAt")} />
            </div>
          )}
        </fieldset>

        {data.canEmergency && (
          <label className="mt-4 flex min-h-11 items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3 text-danger">
            <input type="checkbox" name="emergency" checked={emergency} onChange={(e) => { setEmergency(e.target.checked); touch(); }} className="mt-0.5 size-5 accent-bad" />
            <span><span className="font-semibold">Emergency broadcast.</span> Goes to everyone chosen, including parents who opted out. Use only when truly urgent.</span>
          </label>
        )}

        {!preview && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" loading={pending} loadingText="Checking">Check and send</Button>
            <Button variant="ghost" onClick={() => setShowGroup(!showGroup)} aria-expanded={showGroup}>Save recipients as a group</Button>
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-4" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm text-ink-2">Users to notify</p>
                <p className="text-2xl font-semibold">{preview.people}</p>
                <p className="text-sm text-ink-2">{preview.audienceLabel}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm text-ink-2">Credit cost</p>
                {preview.cost.length === 0 ? <p className="text-lg font-semibold">Free</p> : preview.cost.map((c) => <p key={c.channel} className="font-semibold">{c.channel}: {c.credits} credits</p>)}
                {preview.backupCost > 0 && <p className="text-sm">Up to {preview.backupCost} SMS backup: {preview.backupCost} credits</p>}
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-sm text-ink-2">Available credits</p>
                <p>WhatsApp {preview.balances.whatsapp} · SMS {preview.balances.sms}</p>
                {preview.creditProblem ? <p className="font-medium text-danger">Not enough credits</p> : <p className="font-medium text-success">Sufficient credits</p>}
              </div>
            </div>
            {preview.creditProblem && <Alert tone="danger" action={<Link className="font-medium underline" href="/settings/messaging">Top up</Link>}>{preview.creditProblem}</Alert>}
            {preview.problems.map((p) => <Alert key={p} tone="danger">{p}</Alert>)}
            {preview.skipped.length > 0 && (
              <Alert tone="warning" title={`${preview.skipped.reduce((n, g) => n + g.count, 0)} will be left out`}>
                <ul className="list-disc pl-5">
                  {preview.skipped.map((g) => <li key={g.reason}>{g.reason}: {g.count} ({g.names.join(", ")}{g.count > g.names.length ? " and others" : ""})</li>)}
                </ul>
              </Alert>
            )}
            {preview.samples.length > 0 && (
              <div className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-ink-2">Preview as {preview.samples[sample].name} sees it · {preview.samples[sample].description}</p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={sample === 0} onClick={() => setSample(sample - 1)} aria-label="Previous recipient">‹</Button>
                    <span className="text-sm text-ink-2">{sample + 1} of {preview.samples.length}</span>
                    <Button size="sm" variant="ghost" disabled={sample >= preview.samples.length - 1} onClick={() => setSample(sample + 1)} aria-label="Next recipient">›</Button>
                  </div>
                </div>
                <div className="mt-2 rounded-xl bg-surface-2 p-3">
                  <Badge tone="brand">{preview.samples[sample].channel}</Badge>
                  {preview.samples[sample].parts !== null && <span className="ml-2 text-sm text-ink-2">{preview.samples[sample].parts} SMS part{preview.samples[sample].parts === 1 ? "" : "s"}</span>}
                  {preview.samples[sample].title && <p className="mt-2 font-semibold">{preview.samples[sample].title}</p>}
                  <p className="mt-1 whitespace-pre-line">{preview.samples[sample].text}</p>
                </div>
              </div>
            )}
            {preview.emergency && (
              <label className="block max-w-sm">
                <span className="text-sm font-medium">Type <strong>EMERGENCY</strong> to send to everyone chosen, including parents who opted out</span>
                <input name="emergencyWord" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
              </label>
            )}
            <p className="text-sm text-ink-2">{preview.scheduledAt ? "It can be cancelled until it goes." : "This cannot be unsent once delivered."}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant={preview.emergency ? "danger" : "primary"} loading={pending} loadingText="Sending"
                disabled={!data.canSend || preview.people === 0 || Boolean(preview.creditProblem) || preview.problems.length > 0 || (preview.emergency && word.trim().toUpperCase() !== "EMERGENCY")}
                onClick={() => submit("send")}>
                {preview.emergency ? `Send emergency broadcast to ${preview.people}` : preview.scheduledAt ? `Schedule for ${preview.people} ${preview.people === 1 ? "person" : "people"}` : `Send now to ${preview.people} ${preview.people === 1 ? "person" : "people"}`}
              </Button>
              <Button variant="secondary" onClick={() => setStale(true)}>Change</Button>
            </div>
          </div>
        )}

        {showGroup && !preview && (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor="f-groupName" className="mb-1 block text-sm font-medium">Group name</label>
              <input id="f-groupName" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} placeholder="For example: Class 10 parents" className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
            </div>
            <Button variant="secondary" loading={groupPending} loadingText="Saving" onClick={() => {
              const fd = new FormData(formRef.current!);
              fd.set("groupName", groupName);
              startTransition(() => dispatchGroup(fd));
            }}>Save group</Button>
            {groupState?.message && <p role={groupState.ok ? "status" : "alert"} className={`w-full text-sm ${groupState.ok ? "text-success" : "text-danger"}`}>{groupState.message}</p>}
          </div>
        )}
      </section>
    </form>
  );
}
