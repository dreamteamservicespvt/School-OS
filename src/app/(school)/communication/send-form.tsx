"use client";

// Send Message in three parts: who gets it, what and how, check and send (11-communication.md),
// in the approved design (design/ui-prototype/src/mod-communication.jsx SendMessage). The "Check and
// send" card is worked out on the server while the form is filled in: the real count, the credit
// cost, who is left out and why, and the message as each real person will see it.
import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Bookmark, BellOff, CalendarClock, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Clock, Coins, Eye, FileText, FlaskConical, GraduationCap,
  LayoutGrid, ListChecks, Lock, Mail, MessageCircle, MessageSquareText, Paperclip, School, Send, Siren, TriangleAlert, User, Users, X, type LucideIcon,
} from "lucide-react";
import { checkOrSend, findPeople, livePreview, saveGroup, type SendState } from "./actions";
import type { SendPreview } from "@/lib/communication/send-form";
import { blanksFor, strayBlanks, unfitBlankWords, unknownBlankWords, unknownVariables, type BlankAudience } from "@/lib/messaging/blanks";
import { countWithReason } from "@/lib/messaging/skip-words";
import { EMERGENCY_EVENT } from "./send-head-actions";
import { TranslatePanel } from "./translate-panel";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Segmented, Checkbox } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Split, Col } from "@/components/ui/split";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

type Channel = "whatsapp" | "sms" | "email" | "app";
export type Person = { type: "guardian" | "student" | "staff" | "parentsOf"; id: string; name: string; detail: string };
type Template = { id: string; name: string; category: string; channel: Channel; body: string; subject: string | null; version: number; languages: string[]; dlt: string | null; usable: boolean; locked: boolean };

export type SendFormData = {
  year: string | null;
  classes: { id: string; name: string; count: number }[];
  sections: { id: string; classId: string; label: string; count: number }[];
  on: Channel[];
  preferred: Channel;
  channelNotes: Record<Channel, string>;
  templates: Template[];
  roles: { key: string; name: string }[];
  departments: { id: string; name: string; count: number }[];
  staffCount: number;
  groups: { id: string; name: string }[];
  balances: { whatsapp: number; sms: number };
  backupDefaults: Record<string, boolean>;
  backupWait: Record<string, number>;
  smsReady: boolean;
  scopeLabel: string;
  staffAllowed: boolean;
  wholeSchool: boolean;
  full: boolean;
  canEmergency: boolean;
  canSend: boolean;
  sendKey: string;
  timeZone: string;
  channelLabels: Record<Channel, string>;
  /** People chosen before the page opened, e.g. the parents of students chosen on the Student List. */
  initialPeople?: Person[];
  /** Why some chosen students were left out (outside the sender's classes, or not studying). */
  initialNote?: string | null;
  /** A saved group opened from "Saved groups". */
  initialGroup?: string | null;
  /** "Translate for parents" is offered: the AI assistant and its translation switch are on for this person (G40). */
  translate?: boolean;
};

type Aud = "school" | "classes" | "sections" | "staff" | "single" | "group";
const AUD: Record<Aud, { label: string; icon: LucideIcon }> = {
  school: { label: "Whole school", icon: School },
  classes: { label: "Classes", icon: GraduationCap },
  sections: { label: "Sections", icon: LayoutGrid },
  staff: { label: "Staff", icon: Users },
  single: { label: "One person", icon: User },
  group: { label: "Saved group", icon: Bookmark },
};
const CH: Record<Channel, { icon: LucideIcon; label: string }> = {
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  sms: { icon: MessageSquareText, label: "SMS" },
  email: { icon: Mail, label: "Email" },
  app: { icon: Bell, label: "App notice" },
};
const TYPES = [
  { value: "general", label: "General", category: null },
  { value: "fee", label: "Fees", category: "Fees" },
  { value: "attendance", label: "Attendance", category: "Attendance" },
  { value: "result", label: "Exams and results", category: "Exams and results" },
];
const LANG: Record<string, string> = { en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi", bn: "Bengali" };
const PERSON_FIELD: Record<Person["type"], string> = { guardian: "guardianIds", student: "studentIds", staff: "staffIds", parentsOf: "guardiansOf" };
const fmt = (n: number) => n.toLocaleString("en-IN");

/** Several-at-once buttons, the same look as the class picker on Students. */
function Toggles({ options, value, onToggle, label }: { options: { value: string; label: string; count?: number }[]; value: string[]; onToggle: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onToggle(o.value)}
            className={cx("h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2", on ? "bg-ink text-bg border-ink" : "bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink")}>
            {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}{o.label}
            {o.count != null && <span className={cx("text-[11.5px] tnum", on ? "opacity-70" : "text-ink3")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const Problem = ({ text, className }: { text?: string; className?: string }) =>
  text ? <p className={cx("text-[12.5px] text-bad flex items-center gap-1.5", className)} role="alert"><CircleAlert size={14} aria-hidden="true" className="shrink-0" />{text}</p> : null;

function toggleIn<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function SendForm({ data }: { data: SendFormData }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, dispatch, pending] = useActionState<SendState, FormData>(checkOrSend, null);
  const [groupState, dispatchGroup, groupPending] = useActionState<SendState, FormData>(saveGroup, null);

  const audOptions: Aud[] = [
    ...(data.wholeSchool ? (["school", "classes"] as Aud[]) : []),
    ...(data.sections.length ? (["sections"] as Aud[]) : []),
    ...(data.staffAllowed ? (["staff"] as Aud[]) : []),
    "single",
    ...(data.groups.length ? (["group"] as Aud[]) : []),
  ];
  const firstAud: Aud = data.initialPeople?.length ? "single" : data.initialGroup ? "group" : audOptions[0];
  const [aud, setAud] = useState<Aud>(firstAud);
  const [who, setWho] = useState<string[]>(["parents"]);
  const [classes, setClasses] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [staffKinds, setStaffKinds] = useState<string[]>(["staff"]);
  const [depts, setDepts] = useState<string[]>([]);
  const [allGuardians, setAllGuardians] = useState(false);
  const [groupId, setGroupId] = useState(data.initialGroup ?? data.groups[0]?.id ?? "");
  const [people, setPeople] = useState<Person[]>(data.initialPeople ?? []);
  const [channels, setChannels] = useState<Channel[]>(data.preferred === "app" ? ["app"] : [data.preferred, "app"]);
  const [tpl, setTpl] = useState<Partial<Record<Channel, string>>>({});
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("general");
  const [backup, setBackup] = useState(false);
  const [backupTpl, setBackupTpl] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [word, setWord] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pi, setPi] = useState(0);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [liveRaw, setLive] = useState<SendPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState(0);
  const [trBlock, setTrBlock] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSeq = useRef(0);

  const touch = () => setVersion((v) => v + 1);
  const isStaff = aud === "staff";
  const parentsChosen = (["school", "classes", "sections"].includes(aud) && who.includes("parents")) || (aud === "single" && people.some((p) => p.type === "parentsOf"));
  const typeInfo = TYPES.find((t) => t.value === type)!;
  const templatesFor = (ch: Channel) => data.templates.filter((t) => t.channel === ch && t.usable && (!typeInfo.category || t.category === typeInfo.category || t.category === "General"));
  const chosen = channels.map((c) => data.templates.find((t) => t.id === tpl[c])).filter(Boolean) as Template[];
  const needsText = channels.some((c) => c !== "sms" && !tpl[c]);
  const needsTitle = channels.some((c) => (c === "app" || c === "email") && !tpl[c]);
  const backupOk = type !== "general";
  const backupShown = channels.some((c) => c === "whatsapp" || c === "app") && !channels.includes("sms");
  const smsBackupTemplates = data.templates.filter((t) => t.channel === "sms" && t.usable && (!typeInfo.category || t.category === typeInfo.category));
  const backupOn = backup && backupOk && backupShown;
  const attachable = channels.includes("whatsapp") || channels.includes("email");
  // The blanks a typed message can fill for the people chosen (COMM-01, COMM-02).
  const blankKinds: BlankAudience[] = aud === "staff" ? ["staff"]
    : aud === "school" || aud === "classes" || aud === "sections" ? who.map((w): BlankAudience => (w === "students" ? "students" : "parents"))
      : aud === "single" ? [...new Set(people.map((p): BlankAudience => (p.type === "staff" ? "staff" : p.type === "student" ? "students" : "parents")))] : [];
  const usableBlanks = blanksFor(blankKinds);
  const blanksHint = `Blanks you can use: ${usableBlanks.map((k) => `{${k}}`).join(", ")}`;
  const textWords = needsText ? text : "";
  const strayTyped = [...new Set([...strayBlanks(textWords), ...strayBlanks(title)])];
  // A blank not on the list ({parent_name}) is named at once, with the one meant; such a message cannot be sent.
  const blankError = strayTyped.length
    ? `The message has ${strayTyped.length === 1 ? "a blank" : "blanks"} that cannot be filled: ${strayTyped.join(", ")}. Use blanks from the list, or take out the braces.`
    : unknownBlankWords([...new Set([...unknownVariables(textWords), ...unknownVariables(title)])], usableBlanks);
  const blankWarning = blankError ? null : unfitBlankWords(`${textWords} ${title}`, blankKinds);
  const titleBlankError = blankError && (unknownVariables(title).length || strayBlanks(title).length) && !(unknownVariables(textWords).length || strayBlanks(textWords).length) ? blankError : null;

  // The emergency broadcast button at the top of the page.
  useEffect(() => {
    const go = () => {
      setEmergency(true);
      if (data.wholeSchool) setAud("school");
      touch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(EMERGENCY_EVENT, go);
    return () => window.removeEventListener(EMERGENCY_EVENT, go);
  }, [data.wholeSchool]);

  const err = useMemo(() => {
    const e: Record<string, string> = {};
    if (aud === "classes" && !classes.length) e.who = "Choose at least one class.";
    if (aud === "sections" && !sections.length) e.who = "Choose at least one section.";
    if (["school", "classes", "sections"].includes(aud) && !who.length) e.who = "Choose parents, students or both.";
    if (aud === "staff" && !staffKinds.length) e.who = "Choose all staff, teachers or admins.";
    if (aud === "single" && !people.length) e.who = "Find and add at least one person.";
    if (aud === "group" && !groupId) e.who = "Choose a saved group.";
    if (!channels.length) e.channels = "Choose at least one way to send.";
    if (channels.includes("sms") && !tpl.sms) e.sms = "An SMS can only be sent from a template with a DLT template ID. Pick a template, or untick SMS.";
    if (needsTitle && !title.trim()) e.title = "Add a title. Email and app notices show it at the top.";
    if (needsText && !text.trim()) e.text = "Type the message, or choose a template.";
    if (text.length > 1000) e.text = `Keep it under 1,000 characters. It has ${fmt(text.length)}.`;
    if (blankError && !e.text) { if (titleBlankError) e.title ??= blankError; else e.text = blankError; }
    if (when === "later" && !at) e.scheduledAt = "Choose the date and time to send.";
    if (backupOn && !smsBackupTemplates.length) e.backup = "SMS backup needs an SMS template with a DLT template ID for this message type. Add one in Message Templates, or untick SMS backup.";
    if (trBlock && needsText) e.translations = trBlock;
    return e;
  }, [aud, classes, sections, who, staffKinds, people, groupId, channels, tpl, needsTitle, title, needsText, text, when, at, backupOn, smsBackupTemplates.length, blankError, titleBlankError, trBlock]);
  const whoReady = !err.who;
  const live = whoReady ? liveRaw : null;
  const valid = Object.keys(err).length === 0;

  // Count, cost and preview from the server, a moment after each change.
  useEffect(() => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    if (!whoReady) return;
    const seq = ++liveSeq.current;
    liveTimer.current = setTimeout(async () => {
      if (!formRef.current) return;
      setChecking(true);
      const fd = new FormData(formRef.current);
      fd.delete("file");
      try {
        const r = await livePreview(fd);
        if (seq === liveSeq.current) { setLive(r.preview); setPi(0); }
      } catch {
        if (seq === liveSeq.current) setLive(null);
      } finally {
        if (seq === liveSeq.current) setChecking(false);
      }
    }, 450);
    return () => { if (liveTimer.current) clearTimeout(liveTimer.current); };
  }, [version, whoReady]);

  function lookFor(q: string) {
    setSearch(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setFound(await findPeople(q)); } catch { setFound([]); } finally { setSearching(false); }
    }, 300);
  }

  const n = live?.people ?? 0;
  const kindsNow = aud === "staff" ? ["staff"] : aud === "single" || aud === "group" ? [] : who;
  const noun = kindsNow.length === 1 && kindsNow[0] === "parents" ? (n === 1 ? "parent" : "parents") : kindsNow.length === 1 && kindsNow[0] === "staff" ? "staff" : kindsNow.length === 1 && kindsNow[0] === "students" ? (n === 1 ? "student" : "students") : n === 1 ? "person" : "people";
  const free = channels.filter((c) => c === "app" || c === "email");
  // Test mode sends nothing and uses no credits (COMM-04).
  const paidTotal = (live?.cost ?? []).filter((c) => !c.test).reduce((a, c) => a + c.credits, 0) + (live?.backupTest ? 0 : live?.backupCost ?? 0);
  const testMode = live?.testMode ?? [];
  const testWords = testMode.length ? `${testMode.join(" and ")} ${testMode.length > 1 ? "are" : "is"} in test mode` : null;
  const available = (channels.includes("whatsapp") ? data.balances.whatsapp : 0) + (channels.includes("sms") || backupOn ? data.balances.sms : 0);
  const skippedTotal = (live?.skipped ?? []).reduce((a, g) => a + g.count, 0);
  const blocked = !live || n === 0 || Boolean(live.creditProblem) || live.problems.length > 0;
  const sample = live?.samples.length ? live.samples[Math.min(pi, live.samples.length - 1)] : null;
  const sendLabel = n === 0 ? "Nobody to send to" : emergency ? `Send emergency broadcast to ${fmt(n)}` : when === "now" ? `Send to ${fmt(n)} ${noun}` : `Schedule for ${fmt(n)} ${noun}`;
  // A send that cannot go (nobody reached, a blank that cannot be filled, credits short) cannot be pressed; the reason shows below it.
  const cannotSend = Boolean(live) && whoReady && blocked;
  const serverMessage = state && !state.ok ? state.message : null;

  function trySend() {
    setTried(true);
    if (!valid) {
      const first = ["who", "channels", "sms", "title", "text", "translations", "scheduledAt", "backup"].find((k) => err[k]);
      document.getElementById(`send-${first}`)?.focus();
      return;
    }
    if (blocked) return;
    setConfirm(true);
  }

  function doSend() {
    if (!formRef.current || !live) return;
    const fd = new FormData(formRef.current);
    fd.set("intent", "send");
    fd.set("fingerprint", live.fingerprint);
    startTransition(() => dispatch(fd));
  }

  const whoLabel = aud === "school" ? (data.year ? `Whole school, ${data.year}` : "Whole school")
    : aud === "classes" ? `${classes.length} class${classes.length === 1 ? "" : "es"}`
      : aud === "sections" ? data.sections.filter((s) => sections.includes(s.id)).map((s) => s.label).join(", ")
        : aud === "staff" ? (depts.length ? data.departments.filter((d) => depts.includes(d.id)).map((d) => d.name).join(", ") : "All staff")
          : aud === "group" ? data.groups.find((g) => g.id === groupId)?.name ?? "" : people.map((p) => p.name).join(", ");

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); trySend(); }} noValidate encType="multipart/form-data">
      <input type="hidden" name="sendKey" value={data.sendKey} />
      {/* Who, as the form fields the server reads. */}
      {(aud === "school" || aud === "classes" || aud === "sections") && who.map((k) => <input key={k} type="hidden" name="kinds" value={k} />)}
      {aud === "classes" && classes.map((id) => <input key={id} type="hidden" name="classIds" value={id} />)}
      {aud === "sections" && sections.map((id) => <input key={id} type="hidden" name="sectionIds" value={id} />)}
      {aud === "staff" && staffKinds.map((k) => <input key={k} type="hidden" name="kinds" value={k} />)}
      {aud === "staff" && depts.map((id) => <input key={id} type="hidden" name="departmentIds" value={id} />)}
      {aud === "single" && people.map((p) => <input key={p.id} type="hidden" name={PERSON_FIELD[p.type]} value={p.id} />)}
      {aud === "group" && groupId && <input type="hidden" name="groupId" value={groupId} />}
      {allGuardians && parentsChosen && <input type="hidden" name="allGuardians" value="on" />}
      {channels.map((c) => <input key={c} type="hidden" name="channels" value={c} />)}
      {channels.map((c) => tpl[c] ? <input key={c} type="hidden" name={`template_${c}`} value={tpl[c]} /> : null)}
      {backupOn && <input type="hidden" name="smsBackup" value="on" />}
      {backupOn && (backupTpl || smsBackupTemplates[0]) && <input type="hidden" name="backupTemplateId" value={backupTpl || smsBackupTemplates[0].id} />}
      <input type="hidden" name="when" value={when} />
      {emergency && <input type="hidden" name="emergency" value="on" />}
      {emergency && <input type="hidden" name="emergencyWord" value={word} />}

      {emergency && (
        <Banner tone="bad" icon={Siren} className="mb-5" title="Emergency broadcast."
          action={<Button size="sm" variant="secondary" icon={X} onClick={() => { setEmergency(false); setWord(""); touch(); }}><Words k="Not an emergency" /></Button>}>
          <Words k="Goes to everyone chosen, including parents who opted out. You will type EMERGENCY to send it." />
        </Banner>
      )}
      {serverMessage && <Banner tone="bad" className="mb-5">{serverMessage}</Banner>}

      <Split side={380}>
        <Col>
          {/* 1. Who */}
          <Card>
            <CardHeader title="1. Who gets it" icon={Users}
              description={data.full ? "Pick one group. Anyone who opted out is left out, except in an emergency." : "Only the people you are allowed to message are offered."} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className={cx("grid gap-2", audOptions.length > 3 ? "grid-cols-2 md:grid-cols-4" : audOptions.length === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3")} role="radiogroup" aria-label="Who gets it" id="send-who" tabIndex={-1}>
                {audOptions.map((a) => {
                  const Ic = AUD[a].icon;
                  return (
                    <button key={a} type="button" role="radio" aria-checked={aud === a} onClick={() => { setAud(a); touch(); }}
                      className={cx("h-14 rounded-xl border flex items-center gap-2.5 px-3 text-left text-[13.5px] font-semibold transition", aud === a ? "border-brand bg-brand/8 text-brand ring-1 ring-brand" : "border-line text-ink2 hover:border-ink3/50")}>
                      <Ic size={18} className="shrink-0" aria-hidden="true" />{AUD[a].label}
                    </button>
                  );
                })}
              </div>

              {data.initialPeople && data.initialPeople.length > 0 && aud === "single" && (
                <p className="text-[13px] text-ink2"><Words k="The main contact of each of the" /> {data.initialPeople.length} <Words k="student" />{data.initialPeople.length === 1 ? "" : "s"} <Words k="you chose on the Student List is added below." />{data.initialNote ? ` ${data.initialNote}` : ""}</p>
              )}

              {(aud === "school" || aud === "classes" || aud === "sections") && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Send to" /></p>
                  <Toggles label="Send to" options={[{ value: "parents", label: "Parents" }, { value: "students", label: "Students" }]} value={who} onToggle={(v) => { setWho(toggleIn(who, v)); touch(); }} />
                </div>
              )}
              {aud === "school" && (
                <p className="text-[13.5px] text-ink2">
                  <Words k="All" /> <b className="font-semibold">{fmt(data.sections.reduce((a, s) => a + s.count, 0))} <Words k="students" /></b> <Words k="studying" /> {data.year ? `in ${data.year}` : "this year"}{who.includes("parents") ? ", through their parents. A family with two children gets one message." : "."}
                </p>
              )}
              {aud === "classes" && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Classes" /> <span className="text-ink3 font-normal"><Words k="· students in each" /></span></p>
                  <Toggles label="Classes" options={data.classes.map((c) => ({ value: c.id, label: c.name, count: c.count }))} value={classes} onToggle={(v) => { setClasses(toggleIn(classes, v)); touch(); }} />
                </div>
              )}
              {aud === "sections" && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2">{data.wholeSchool ? "Sections" : "Your sections"} <span className="text-ink3 font-normal"><Words k="· students in each" /></span></p>
                  <Toggles label="Sections" options={data.sections.map((s) => ({ value: s.id, label: s.label, count: s.count }))} value={sections} onToggle={(v) => { setSections(toggleIn(sections, v)); touch(); }} />
                  {!data.wholeSchool && <p className="text-[12.5px] text-ink3 mt-2"><Words k="Other classes are not offered. To reach them, ask the office." /></p>}
                </div>
              )}
              {aud === "staff" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Who" /></p>
                    <Toggles label="Staff"
                      options={[{ value: "staff", label: "All staff", count: data.staffCount }, { value: "teachers", label: "Teachers" }, { value: "admins", label: "Admins" }]}
                      value={staffKinds} onToggle={(v) => { setStaffKinds(v === "staff" ? ["staff"] : toggleIn(staffKinds.filter((x) => x !== "staff"), v)); touch(); }} />
                  </div>
                  {data.departments.length > 0 && (
                    <div>
                      <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Departments" /> <span className="text-ink3 font-normal"><Words k="· none chosen means every department" /></span></p>
                      <Toggles label="Departments" options={data.departments.map((d) => ({ value: d.id, label: d.name, count: d.count }))} value={depts} onToggle={(v) => { setDepts(toggleIn(depts, v)); touch(); }} />
                    </div>
                  )}
                </div>
              )}
              {aud === "single" && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <label htmlFor="send-people" className="sr-only"><Words k="Find a parent, student or staff member" /></label>
                    <input id="send-people" type="search" value={search} onChange={(e) => lookFor(e.target.value)} placeholder="Student or parent name, admission number or phone"
                      className={cx(inputCls(), "h-11")} autoComplete="off" aria-controls="send-people-results" />
                    {search.trim().length >= 2 && (
                      <ul id="send-people-results" className="mt-1 flex flex-col rounded-xl border border-line bg-surface p-1">
                        {searching && <li className="p-3 text-[13.5px] text-ink3"><Words k="Searching…" /></li>}
                        {!searching && found.length === 0 && <li className="p-3 text-[13.5px] text-ink3"><Words k="Nobody found among the people you may message." /></li>}
                        {found.map((p) => (
                          <li key={`${p.type}:${p.id}`}>
                            <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70"
                              onClick={() => { if (!people.some((x) => x.id === p.id)) setPeople([...people, p]); setSearch(""); setFound([]); touch(); }}>
                              <Avatar name={p.name} size={38} />
                              <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{p.name}</span><span className="block text-[12.5px] text-ink3 truncate">{p.detail}</span></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {people.length > 0 && (
                    <ul className="flex flex-col gap-2" aria-label="People added">
                      {people.map((p) => (
                        <li key={p.id} className="rounded-xl border border-line p-3 flex items-center gap-3">
                          <Avatar name={p.name.replace(/^Parents of /, "")} size={40} />
                          <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{p.name}</p><p className="text-[12.5px] text-ink3 truncate">{p.detail}</p></div>
                          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => { setPeople(people.filter((x) => x.id !== p.id)); touch(); }}
                            className="grid size-9 place-items-center rounded-xl text-ink2 hover:bg-sunken"><X size={17} aria-hidden="true" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {aud === "group" && (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2" role="radiogroup" aria-label="Saved group">
                  {data.groups.map((g) => (
                    <li key={g.id}>
                      <button type="button" role="radio" aria-checked={groupId === g.id} onClick={() => { setGroupId(g.id); touch(); }}
                        className={cx("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition", groupId === g.id ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line hover:border-ink3/50")}>
                        <span className="w-9 h-9 rounded-lg bg-sunken grid place-items-center shrink-0"><Bookmark size={17} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1 font-semibold text-[14px] truncate">{g.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {parentsChosen && (
                <div className="flex items-center gap-3">
                  <Checkbox id="send-both" checked={allGuardians} onChange={(v) => { setAllGuardians(v); touch(); }} label="Both parents, not only the main contact" />
                  <label htmlFor="send-both" className="text-[14px]"><Words k="Both parents, not only the main contact" /></label>
                </div>
              )}
              {tried && <Problem text={err.who} />}
            </div>
          </Card>

          {/* 2. What and how */}
          <Card>
            <CardHeader title="2. What and how" icon={MessageSquareText} description="WhatsApp first. SMS needs an approved template with a DLT template ID." />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5"><Words k="Send by" /> <span className="text-bad" aria-hidden="true">*</span></p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" id="send-channels" tabIndex={-1}>
                  {(["whatsapp", "sms", "email", "app"] as Channel[]).map((c) => {
                    const on = channels.includes(c);
                    const off = !data.on.includes(c);
                    const Ic = CH[c].icon;
                    return (
                      <button key={c} type="button" aria-pressed={on} disabled={off} onClick={() => { setChannels(toggleIn(channels, c)); touch(); }}
                        title={off ? "Switched on in Settings, SMS, WhatsApp & Email" : undefined}
                        className={cx("rounded-xl border p-3 text-left transition flex flex-col gap-1 disabled:opacity-55 disabled:cursor-not-allowed", on ? "border-brand bg-brand/8 ring-1 ring-brand" : "border-line hover:border-ink3/50")}>
                        <span className={cx("flex items-center gap-2 text-[14px] font-semibold", on ? "text-brand" : "text-ink")}><Ic size={17} aria-hidden="true" />{CH[c].label}{on && <Check size={15} strokeWidth={3} className="ml-auto" aria-hidden="true" />}</span>
                        <span className="text-[11.5px] text-ink3 leading-snug">{data.channelNotes[c]}</span>
                      </button>
                    );
                  })}
                </div>
                {tried && <Problem text={err.channels} className="mt-1.5" />}
                {data.on.length < 4 && <p className="text-[12.5px] text-ink3 mt-1.5"><Words k="Channels that are not connected are switched on in" /> <Link href="/settings/messaging" className="underline"><Words k={"Settings, SMS, WhatsApp & Email"} /></Link>.</p>}
                {channels.includes("sms") && !data.smsReady && <Problem className="mt-1.5" text="Add your DLT entity ID and sender header in Settings, SMS, WhatsApp & Email before sending SMS." />}
              </div>

              {backupShown && (
                <div className={cx("rounded-xl p-3.5 flex items-start gap-3", backupOk ? "bg-sunken/70" : "bg-sunken/40")}>
                  <div className="pt-0.5"><Checkbox id="send-backup" checked={backupOn} onChange={(v) => { if (backupOk) { setBackup(v); touch(); } }} label="If not delivered or read, also send by SMS" /></div>
                  <div className={cx("text-[14px] min-w-0 flex-1", !backupOk && "opacity-60")}>
                    <label htmlFor="send-backup" className="font-semibold"><Words k="If not delivered or read, also send by SMS" /></label>
                    <span className="block text-[12.5px] text-ink3 mt-0.5">
                      {backupOk
                        ? `After ${Math.round((data.backupWait[type] ?? 120) / 60 * 10) / 10} hours, anyone whose message failed or is unread gets the approved SMS version. Counted in the cost.`
                        : "SMS backup is for fee, attendance and result messages only."}
                    </span>
                    {backupOn && smsBackupTemplates.length > 1 && (
                      <select aria-label="SMS template for the backup" value={backupTpl || smsBackupTemplates[0].id} onChange={(e) => { setBackupTpl(e.target.value); touch(); }} className={cx(inputCls(), "h-10 mt-2")}>
                        {smsBackupTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.dlt ? ` · DLT ${t.dlt.slice(-6)}` : ""}</option>)}
                      </select>
                    )}
                    {tried && <Problem text={err.backup} className="mt-1.5" />}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldShell label="Message type" id="send-type" help={backupOk && data.backupDefaults[type] ? "SMS backup is on for this type in Message Settings" : "Sets which templates are offered"}>
                  <select id="send-type" name="messageType" value={type} className={cx(inputCls(), "h-11 pr-9")}
                    onChange={(e) => { setType(e.target.value); setBackup(Boolean(data.backupDefaults[e.target.value])); setTpl({}); touch(); }}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </FieldShell>
                {channels.map((c) => (
                  <FieldShell key={c} label={channels.length > 1 ? `${CH[c].label} template` : "Template"} id={c === "sms" ? "send-sms" : `send-tpl-${c}`} required={c === "sms"}
                    error={tried && c === "sms" ? err.sms : undefined}
                    help={c === "sms" ? (templatesFor("sms").length ? "Only templates with a DLT template ID are offered for SMS" : undefined) : "Optional for WhatsApp, email and app"}>
                    <select id={c === "sms" ? "send-sms" : `send-tpl-${c}`} value={tpl[c] ?? ""} className={cx(inputCls(tried && c === "sms" && err.sms), "h-11 pr-9")}
                      onChange={(e) => { const v = e.target.value; setTpl({ ...tpl, [c]: v }); const t = data.templates.find((x) => x.id === v); if (t?.subject && !title) setTitle(t.subject); touch(); }}>
                      <option value="">{c === "sms" ? "Choose an SMS template" : "None, type my own message"}</option>
                      {templatesFor(c).map((t) => <option key={t.id} value={t.id}>{t.name}{t.dlt ? ` · DLT ${t.dlt.slice(-6)}` : ""}</option>)}
                    </select>
                    {c === "sms" && templatesFor("sms").length === 0 && (
                      <p className="text-[12.5px] text-bad"><Words k="No SMS template has a DLT template ID yet. Add it in" /> <Link href="/communication/templates?channel=sms" className="underline"><Words k="Message Templates" /></Link><Words k=", or send by WhatsApp." /></p>
                    )}
                  </FieldShell>
                ))}
              </div>

              <FieldShell label="Title" id="send-title" required={needsTitle} error={titleBlankError ?? (tried ? err.title : undefined)}>
                <input id="send-title" name="title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); touch(); }}
                  aria-invalid={tried && err.title ? true : undefined} className={cx(inputCls(tried && err.title), "h-11")} placeholder="Shown at the top of an email or app notice" />
              </FieldShell>

              {chosen.map((t) => (
                <div key={t.id}>
                  <p className="text-[13px] font-semibold text-ink2 mb-1.5">{chosen.length > 1 || needsText ? `${CH[t.channel].label} message` : "Message"}</p>
                  <div className="rounded-xl bg-sunken/70 border border-line p-3.5 text-[14.5px] leading-relaxed whitespace-pre-line break-words">
                    {t.body.split(/(\{[a-z_]+\})/g).map((part, i) => /^\{[a-z_]+\}$/.test(part) ? <span key={i} className="rounded bg-brand/12 px-1 text-brand font-semibold">{part}</span> : part)}
                  </div>
                  <p className="text-[12.5px] text-ink3 mt-1.5 flex gap-1.5">
                    <Lock size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                    {t.locked ? `Approved template, version ${t.version}. The text is locked; only the blanks fill in for each person.` : `Template, version ${t.version}. The blanks fill in for each person.`} <Words k="Languages:" /> {t.languages.map((l) => LANG[l] ?? l).join(", ")}.
                  </p>
                </div>
              ))}
              {needsText && (
                <FieldShell label={chosen.length ? "Message for the other channels" : "Message"} id="send-text" required error={(blankError && !titleBlankError ? blankError : null) ?? (tried ? err.text : undefined)}
                  help={`${fmt(text.length)} of 1,000 characters · ${blanksHint}`}>
                  <textarea id="send-text" name="text" rows={5} value={text} maxLength={1000} onChange={(e) => { setText(e.target.value); touch(); }}
                    aria-invalid={(blankError && !titleBlankError) || (tried && err.text) ? true : undefined} aria-describedby={blankError && !titleBlankError ? "send-text-error" : "send-text-help"}
                    className={cx(inputCls(Boolean(blankError && !titleBlankError) || (tried && err.text)), "py-2.5")} />
                  {blankError && !titleBlankError && <p className="text-[12.5px] text-ink3">{fmt(text.length)} <Words k="of 1,000 characters" /></p>}
                  {blankWarning && <p className="text-[12.5px] text-warn flex gap-1.5"><TriangleAlert size={14} className="shrink-0 mt-0.5" aria-hidden="true" />{blankWarning}</p>}
                </FieldShell>
              )}

              {attachable && (
                <div>
                  <input ref={fileRef} type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" id="send-file"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
                  {fileName ? (
                    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                      <span className="w-9 h-9 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><FileText size={17} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">{fileName}</span><span className="block text-[12px] text-ink3"><Words k="Goes with the email. PDF or picture, up to 10 MB." /></span></span>
                      <Button size="sm" variant="ghost" onClick={() => { if (fileRef.current) fileRef.current.value = ""; setFileName(null); }}><Words k="Remove" /></Button>
                    </div>
                  ) : (
                    <Button variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}><Words k="Attach a file" /></Button>
                  )}
                </div>
              )}

              {!isStaff && data.translate && needsText && (
                <div id="send-translations" tabIndex={-1}>
                  <TranslatePanel text={text} title={title} languages={live?.languages ?? []}
                    getForm={() => { if (!formRef.current) return null; const fd = new FormData(formRef.current); fd.delete("file"); return fd; }}
                    onChanged={touch} onBlock={setTrBlock} />
                </div>
              )}
              {!isStaff && (
                <p className="text-[12.5px] text-ink3">Language: each parent gets a template in their own language when the template has that version; a typed message goes as written{data.translate && needsText ? ", unless you translate it above" : ""}.</p>
              )}
            </div>
          </Card>

          {/* When */}
          <Card>
            <CardHeader title="When" icon={Clock} description="A scheduled message can be cancelled until it goes" />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <Segmented label="When" value={when} onChange={(v) => { setWhen(v as "now" | "later"); touch(); }} className="self-start"
                options={[{ value: "now", label: "Send now", icon: Send }, { value: "later", label: "Schedule", icon: CalendarClock }]} />
              {when === "later" && (
                <FieldShell label="Date and time" id="send-scheduledAt" required className="max-w-xs" error={tried ? err.scheduledAt : undefined} help="Within the next 90 days">
                  <input id="send-scheduledAt" type="datetime-local" name="scheduledAt" value={at} onChange={(e) => { setAt(e.target.value); touch(); }} className={cx(inputCls(tried && err.scheduledAt), "h-11 tnum")} />
                </FieldShell>
              )}
            </div>
          </Card>
        </Col>

        {/* 3. Check and send */}
        <Col className="xl:sticky xl:top-4">
          <Card className={cx("overflow-hidden", emergency && "border-bad/40")} aria-live="polite">
            <CardHeader title="3. Check and send" icon={ListChecks} description="Exactly who, how much, and what they will see" />
            <div className="px-5 pb-4">
              <p className="eyebrow text-ink3"><Words k="Users to notify" /></p>
              <p className={cx("font-display text-[34px] font-semibold tnum leading-tight transition-opacity", checking && "opacity-50")}>
                {whoReady && live ? fmt(n) : "–"} <span className="text-[16px] text-ink3 font-sans font-semibold">{noun}</span>
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink2">
                {!whoReady && <li className="flex gap-2"><Users size={15} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{err.who}</span></li>}
                {whoReady && live && <li className="flex gap-2"><Users size={15} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{live.audienceLabel || whoLabel}</span></li>}
                {live?.skipped.map((g) => (
                  <li key={g.reason} className={cx("flex gap-2", g.notSent && "text-bad")}>
                    {/opted out/i.test(g.reason) ? <BellOff size={15} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /> : <TriangleAlert size={15} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />}
                    <span>{countWithReason(g.count, g.reason)}{g.names.length ? ` (${g.names.slice(0, 3).join(", ")}${g.count > 3 ? " and others" : ""})` : ""}</span>
                  </li>
                ))}
                {!data.full && <li className="flex gap-2"><Lock size={15} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span><Words k="Limited to" /> {data.scopeLabel}</span></li>}
              </ul>
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="eyebrow text-ink3 mb-2"><Words k="Message credits" /></p>
              <ul className="flex flex-col gap-1.5 text-[13.5px] tnum">
                {(live?.cost ?? []).filter((c) => c.credits > 0).map((c) => (
                  <li key={c.channel} className="flex justify-between gap-3"><span className="text-ink2">{c.channel}{c.test ? " · test mode" : ""}</span><span className="font-semibold">{c.test ? "None used" : fmt(c.credits)}</span></li>
                ))}
                {(live?.backupCost ?? 0) > 0 && <li className="flex justify-between gap-3"><span className="text-ink2"><Words k="SMS backup · up to" /> {fmt(live!.backupCost)} <Words k="SMS" />{live?.backupTest ? " · test mode" : ""}</span><span className="font-semibold">{live?.backupTest ? "None used" : `up to ${fmt(live!.backupCost)}`}</span></li>}
                {free.length > 0 && <li className="flex justify-between gap-3"><span className="text-ink2">{free.map((c) => CH[c].label).join(" and ")}</span><span className="font-semibold"><Words k="Free" /></span></li>}
                <li className="flex justify-between gap-3 border-t border-line/70 pt-1.5 mt-0.5"><span className="font-semibold"><Words k="Total" /></span><span className="font-semibold">{live?.backupCost && !live.backupTest ? "up to " : ""}{paidTotal ? fmt(paidTotal) : testWords ? "None" : "Free"}</span></li>
              </ul>
              {live && (
                <p className={cx("mt-2.5 text-[13px] font-semibold flex items-center gap-1.5", live.creditProblem ? "text-bad" : "text-ok")}>
                  {live.creditProblem ? <CircleAlert size={15} aria-hidden="true" /> : <CircleCheck size={15} aria-hidden="true" />}
                  {live.creditProblem ?? (paidTotal ? `Sufficient credits · ${fmt(available)} available` : "No credits needed")}
                </p>
              )}
              {testWords && (
                <p className="mt-2 text-[13px] text-warn flex gap-1.5"><FlaskConical size={15} className="shrink-0 mt-0.5" aria-hidden="true" /><span>{testWords}<Words k=": nobody will receive this message, and no credits are used. Connect it in" /> <Link href="/settings/messaging" className="underline"><Words k={"Settings, SMS, WhatsApp & Email"} /></Link> <Words k="to send for real." /></span></p>
              )}
              {live?.creditProblem && <Link href="/settings/messaging" className="mt-1 inline-block text-[13px] font-semibold text-brand underline"><Words k="Top up credits" /></Link>}
            </div>
            {/* Preview as one real person sees it */}
            <div className="border-t border-line px-5 py-4 bg-sunken/40">
              <div className="flex items-center gap-2 mb-3">
                <p className="eyebrow text-ink3 flex-1"><Words k="Preview" /></p>
                {live && live.samples.length > 0 && <span className="text-[12px] text-ink3 tnum">{Math.min(pi, live.samples.length - 1) + 1} <Words k="of" /> {live.samples.length}</span>}
                <button type="button" aria-label="Previous recipient" disabled={!live || pi === 0} onClick={() => setPi(pi - 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink2 hover:bg-sunken disabled:opacity-40"><ChevronLeft size={17} aria-hidden="true" /></button>
                <button type="button" aria-label="Next recipient" disabled={!live || pi >= live.samples.length - 1} onClick={() => setPi(pi + 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink2 hover:bg-sunken disabled:opacity-40"><ChevronRight size={17} aria-hidden="true" /></button>
              </div>
              {sample ? (
                <>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <Avatar name={sample.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold truncate">{sample.name}</p><p className="text-[12px] text-ink3 truncate">{sample.description}</p></div>
                    {sample.translated && <Pill tone="brand" className="!h-[22px] !text-[11.5px]">{sample.translated}</Pill>}
                    <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">{sample.channel}</Pill>
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-surface border border-line p-3 shadow-card max-w-full">
                    {sample.title && <p className="text-[13px] font-semibold mb-1">{sample.title}</p>}
                    {sample.text ? <p className="text-[14px] leading-relaxed break-words whitespace-pre-line">{sample.text}</p> : <p className="text-[14px] text-ink3"><Words k="Type the message to see it here." /></p>}
                    {fileName && <p className="mt-2 text-[12.5px] text-ink2 flex items-center gap-1.5 rounded-lg bg-sunken px-2 py-1.5"><FileText size={14} aria-hidden="true" />{fileName}</p>}
                    {sample.parts !== null && <p className="text-[11px] text-ink3 text-right mt-1 tnum">{sample.parts} <Words k="SMS part" />{sample.parts === 1 ? "" : "s"}</p>}
                  </div>
                </>
              ) : (
                <p className="text-[13.5px] text-ink3">{checking ? "Working out who gets it…" : whoReady ? "Nobody to preview yet." : "Choose who gets it to see the message as they will."}</p>
              )}
              {live?.problems.map((p) => <Problem key={p} text={p} className="mt-2" />)}
            </div>
            <div className="border-t border-line p-4 flex flex-col gap-2">
              <Button type="submit" variant={emergency ? "danger" : "primary"} size="lg" className="w-full !h-14 !text-[16px]" icon={emergency ? Siren : when === "now" ? Send : CalendarClock}
                loading={pending} loadingText="Sending" disabled={!data.canSend || cannotSend}>
                {live && whoReady ? sendLabel : when === "now" ? "Send" : "Schedule"}
              </Button>
              {tried && !valid && <p className="text-[12.5px] text-bad text-center"><Words k="Fix the marked fields above first." /></p>}
              {(tried || cannotSend) && valid && blocked && live && <p className="text-[12.5px] text-bad text-center">{live.creditProblem ?? live.problems[0] ?? "Nobody can be reached with these choices."}</p>}
              {cannotSend && !valid && blankError && <p className="text-[12.5px] text-bad text-center"><Words k="Fix the blank in the message first." /></p>}
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" icon={Bookmark} disabled={!whoReady || aud === "group"} onClick={() => { setGroupName(whoLabel.slice(0, 60)); setGroupOpen(true); }}><Words k="Save as group" /></Button>
                <Button variant="ghost" className="flex-1" icon={Eye} disabled={!live || live.samples.length < 2} onClick={() => setPi(live ? (pi + 1) % live.samples.length : 0)}><Words k="Next person" /></Button>
              </div>
              <p className="text-[12px] text-ink3 text-center">{when === "later" ? "It can be cancelled until it goes." : "A message cannot be unsent once delivered."}</p>
            </div>
          </Card>
        </Col>
      </Split>

      <Dialog open={confirm} onClose={() => setConfirm(false)}
        title={emergency ? "Emergency broadcast" : `${when === "now" ? "Send" : "Schedule"} to ${fmt(n)} ${noun}?`}
        sub={emergency ? "Goes to everyone chosen, including those who opted out." : "A message cannot be unsent once delivered. A wrong message needs a correction message."}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}><Words k="Go back" /></Button>
          <Button variant={emergency ? "danger" : "primary"} icon={emergency ? Siren : when === "now" ? Send : CalendarClock} loading={pending} loadingText="Sending"
            disabled={emergency && word.trim().toUpperCase() !== "EMERGENCY"} onClick={() => { doSend(); setConfirm(false); }}>{sendLabel}</Button>
        </>}>
        {testWords && (
          <Banner tone="warn" icon={FlaskConical} className="mb-3" title={`${testWords}.`}>
            <Words k="Nobody will receive this message. It is only recorded in Message History, and no credits are used." />
          </Banner>
        )}
        <ul className="flex flex-col gap-2.5 text-[14px] pb-1">
          <li className="flex gap-2.5"><Users size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{live?.audienceLabel || whoLabel}{skippedTotal ? `. ${fmt(skippedTotal)} left out.` : "."}</span></li>
          <li className="flex gap-2.5"><Send size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{channels.map((c) => CH[c].label).join(", ")}{live?.backupCost ? ", with SMS backup" : ""}</span></li>
          <li className="flex gap-2.5"><Coins size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span className="tnum">{paidTotal ? `${live?.backupCost && !live.backupTest ? "Up to " : ""}${fmt(paidTotal)} credits of ${fmt(available)}` : testWords ? "No credits: test mode" : "No credits needed"}</span></li>
          <li className="flex gap-2.5"><Clock size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{when === "now" ? "Now" : at.replace("T", ", ")}</span></li>
          {fileName && <li className="flex gap-2.5"><Paperclip size={17} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>{fileName}</span></li>}
        </ul>
        {emergency && (
          <FieldShell label="Type EMERGENCY to send it" id="send-emergency-word" required className="mt-3">
            <input id="send-emergency-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" className={cx(inputCls(), "h-11")} />
          </FieldShell>
        )}
      </Dialog>

      <Dialog open={groupOpen} onClose={() => setGroupOpen(false)} title="Save as a group" sub="Pick it next time under Who gets it"
        footer={<>
          <Button variant="secondary" onClick={() => setGroupOpen(false)}><Words k="Cancel" /></Button>
          <Button loading={groupPending} loadingText="Saving" onClick={() => {
            if (!formRef.current) return;
            const fd = new FormData(formRef.current);
            fd.delete("file");
            fd.set("groupName", groupName);
            startTransition(() => dispatchGroup(fd));
          }}><Words k="Save group" /></Button>
        </>}>
        <FieldShell label="Group name" id="send-group-name" required error={groupState && !groupState.ok ? groupState.message : undefined}
          help={groupState?.ok ? groupState.message : "It updates as students join or leave."}>
          <input id="send-group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} className={cx(inputCls(), "h-11")} />
        </FieldShell>
      </Dialog>
    </form>
  );
}
