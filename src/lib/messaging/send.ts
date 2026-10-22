// Planning and recording a send: who gets what, on which channel, at what
// cost. Nothing here talks to a provider; the delivery job does (deliver.ts).
//
// A person never loses a message silently (G07): each person gets the
// message on a channel that can really carry it to them. SMS goes only from
// a template with a DLT template ID; on a real WhatsApp account only
// templates WhatsApp approved are used, and a typed message rides the ready
// "General announcement" template. When no channel can carry it, the
// preview says so before sending, and the person is kept on the message as
// "Not sent" with the reason, so it shows as not delivered and can be sent
// again once the channel is ready.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { enqueue } from "../jobs";
import { formatDate } from "../format";
import { CHANNEL_LABEL, channelSetups, PREFERRED_ORDER, PROVIDER_CHANNELS, whatsappIsLive, type Channel } from "./channels";
import { creditBalances, creditProblem, creditsFor, PAID_CHANNELS, spendCredits } from "./credits";
import { describeAudience, resolveAudience, SYSTEM_SCOPE, type AudienceRule, type Candidate, type Scope, type StudentInfo } from "./recipients";
import { bareText, currentVersions, isApproved, missingWords, render, strayBlanks, strayBraces, templateByKey, TYPED_CARRIER, unknownVariables, variablesIn, versionFor, type Rendered, type UsableVersion } from "./templates";
import { blanksFor, unknownBlankWords, type BlankAudience } from "./blanks";
import { inTestMode } from "./providers";
import { countWithReason } from "./skip-words";
import { BACKUP_TYPES, type BackupType } from "./settings";
import { CODE_MASK, codeSenderWords, hasCode, ONE_TIME_CODE, sealCode, withCode, type OneTimeCode } from "./one-time-code";

export const MAX_TEXT = 1000;
export const DELIVER_JOB = "messaging:deliver";
/** The start of the reason on a person no channel could carry the message to. Such a person is sent again with Resend, not Retry. */
export const NOT_SENT = "Not sent: ";
/** The reason on people of a scheduled message that was cancelled. */
export const CANCELLED_REASON = "Cancelled before it was sent.";

export class MessagingProblem extends Error {}

export type SendInput = {
  to: AudienceRule;
  /** One or more channels, or "preferred": for each person the first of WhatsApp, SMS, email and app that can carry it to them. */
  channels: Channel[] | "preferred";
  /** Channels to try, in order, for a person none of `channels` can reach (switched off, not approved, no DLT template ID, no address). */
  fallback?: Channel[];
  /** A template per channel. Required for SMS (rule 34); typed text goes by SMS only inside the ready "General announcement (SMS)" template. */
  templates?: Partial<Record<Channel, string | null>>;
  /** Typed text, for channels with no template. It may use blanks such as {student_name}. */
  text?: string | null;
  /** Title for app notifications and email. */
  title?: string | null;
  /** Blanks for everyone. */
  values?: Record<string, string>;
  /** Blanks for one student's guardians (e.g. due amount). Brothers and sisters then get one message each, unless the words are the same apart from their names. */
  perStudent?: Record<string, Record<string, string>>;
  /** Blanks for one guardian or staff member (e.g. their own Parent Link), by their id. */
  perPerson?: Record<string, Record<string, string>>;
  messageType?: "general" | BackupType;
  /** Fee, attendance and result messages: also send by SMS if not delivered or read in time. */
  smsBackup?: boolean;
  /** The SMS template used for backup SMS. Defaults to the SMS template with the same key. */
  backupTemplateId?: string | null;
  /** Emergency broadcasts reach people who opted out. */
  emergency?: boolean;
  /**
   * A one-time code (QA SEC-01): the {code} blank is kept as "••••••" and the code goes
   * only to the provider. A required system message: it reaches people who opted out,
   * is never resent, has no sender and is not an emergency broadcast (./one-time-code.ts).
   */
  oneTimeCode?: OneTimeCode | null;
  scheduledAt?: Date | null;
  /** How far the sender may reach. Software-made messages reach the whole school. */
  scope?: Scope;
  /** Who: the person (ctx.userId) or an automatic rule. */
  ruleKey?: string | null;
  trigger?: string | null;
  source?: { type: string; id: string } | null;
  attachmentFileIds?: string[];
  audienceLabel?: string;
  /** The same key never sends twice. */
  idempotencyKey?: string | null;
  /** "block" (default for people): refuse when credits are short. "fail": record and mark failed (automatic messages). */
  onNoCredits?: "block" | "fail";
  /** When no channel can carry it to anyone: "block" (default) refuses; "record" keeps it in Message History with everyone as Not sent (messages the software sends by itself). */
  onNobody?: "block" | "record";
  /** Leave out these candidates (used to stop an automatic rule repeating itself). */
  exclude?: (candidateKey: string) => boolean;
  /** A single named person: a missing blank blocks the send instead of skipping them. */
  single?: boolean;
  resendOfId?: string | null;
};

/** What a row's text is made from, so rows to one phone can be joined into one message. */
type Source = { body: string | null; typed: string | null; carried: boolean; title: string | null; values: Record<string, string> };

export type PlannedRow = {
  candidate: Candidate;
  rowKey: string;
  studentId: string | null;
  channel: Channel;
  address: string;
  language: string;
  version: UsableVersion | null;
  title: string | null;
  text: string;
  values: Record<string, string>;
  credits: number;
  /** Every row key this message covers: more than one when brothers and sisters on one phone get one message. */
  keys?: string[];
  students?: StudentInfo[];
  source?: Source;
};

/** A person no channel can carry the message to, with the reason. Recorded as Failed ("Not sent: …"). */
export type NotSentRow = {
  candidate: Candidate;
  rowKey: string;
  studentId: string | null;
  channel: Channel;
  address: string;
  language: string;
  text: string;
  values: Record<string, string>;
  reason: string;
};

export type SkipGroup = { reason: string; count: number; names: string[]; keys?: string[]; notSent?: boolean };

export type Plan = {
  channels: Channel[];
  rows: PlannedRow[];
  /** People none of the channels can carry it to (shown before sending; kept as Not sent). */
  notSent?: NotSentRow[];
  people: number;
  skipped: SkipGroup[];
  /** What the messages cost in credits, channel by channel (shown before sending). */
  cost: Partial<Record<Channel, number>>;
  /** The credits that will really be used: none on a channel in test mode, which sends nothing. */
  charged: Partial<Record<Channel, number>>;
  /** Channels used by this message that are in test mode: nobody receives what goes on them. */
  testMode: Channel[];
  backupCost: number;
  balances: Record<"whatsapp" | "sms", number>;
  creditProblem: string | null;
  problems: string[];
  audienceLabel: string;
  backupTemplateId: string | null;
};

function digits(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10 ? d : null;
}

function addSkip(groups: Map<string, SkipGroup>, reason: string, name: string, key: string, notSent = false) {
  const g = groups.get(reason) ?? { reason, count: 0, names: [], keys: [], ...(notSent ? { notSent: true } : {}) };
  g.count++;
  if (g.names.length < 50) g.names.push(name);
  g.keys!.push(key);
  groups.set(reason, g);
}

/** "Ravi", "Ravi and Sita", "Ravi, Sita and Anu". */
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The child blanks for some students. */
function studentValues(students: StudentInfo[]): Record<string, string> {
  if (!students.length) return {};
  return {
    student_name: join(students.map((s) => s.name)),
    class: join([...new Set(students.map((s) => s.classLabel))]),
    admission_no: join(students.map((s) => s.admissionNo)),
  };
}

/** The values every message knows by itself: school, date, the person and their child. */
function baseValues(school: { name: string; phone: string | null; timeZone: string }, c: Candidate, students: StudentInfo[]): Record<string, string> {
  const v: Record<string, string> = {
    school_name: school.name,
    date: formatDate(new Date(), school.timeZone),
  };
  if (school.phone) v.school_phone = school.phone;
  if (c.type === "guardian") v.guardian_name = c.name;
  if (c.type === "staff" || c.type === "login") v.staff_name = c.name;
  return { ...v, ...studentValues(students) };
}

function addressFor(c: Candidate, channel: Channel, providersOn = true): { address: string } | { skip: string } {
  if (channel === "app") {
    // With no WhatsApp, SMS or email connected, parents cannot get it at all: say so plainly.
    if (c.type === "guardian") return { skip: providersOn ? "Parents have no app; they get WhatsApp, SMS or email" : "Parents have no app, and WhatsApp, SMS and email are not connected, so they will not get it" };
    return c.userLoginId ? { address: c.userLoginId } : { skip: "No School OS login for app messages" };
  }
  if (c.type === "student") return { skip: "Students get app messages only" };
  if (channel === "email") return c.email ? { address: c.email } : { skip: "No email address" };
  const phone = digits(c.phone);
  return phone ? { address: phone } : { skip: "No mobile number" };
}

type Filled = { ok: true; text: string; values: Record<string, string> } | { ok: false; missing: string[] };

/**
 * Fills a row's text from its source. Typed text is filled first; a template
 * that carries it gets the filled words (without their own greeting and
 * school name) in its {message} blank.
 */
function fill(src: Source, values: Record<string, string>, schoolName: string): Filled {
  const v: Record<string, string> = { ...values };
  const typed: Rendered | null = src.typed ? render(src.typed, v) : null;
  if (src.body === null) {
    if (!typed) return { ok: false, missing: [] };
    if (!typed.ok) return typed;
    v.message ??= typed.text;
    return { ok: true, text: typed.text, values: v };
  }
  if (src.carried) {
    if (!typed || !typed.ok) return typed ?? { ok: false, missing: ["message"] };
    v.message = bareText(typed.text, schoolName);
  } else if (v.message === undefined && typed) {
    if (typed.ok) v.message = typed.text;
    else if (variablesIn(src.body).includes("message")) return typed;
  }
  const r = render(src.body, v);
  return r.ok ? { ok: true, text: r.text, values: v } : r;
}

/** Blanks that differ only by whom a message names; rows to one phone that differ only in these become one message. */
const NAME_KEYS = ["student_name", "class", "admission_no", "guardian_name", "staff_name"] as const;
/** Blanks that belong to one child (an amount, a receipt, a personal link): such messages are never joined for brothers and sisters. */
const OWN_KEYS = new Set(["due_amount", "due_date", "paid_amount", "payment_date", "receipt_number", "link", "code", "ticket_number"]);

/**
 * One message per phone (or email or login) per send. Rows to the same
 * address with the same words are one message; rows whose words differ only
 * by the names (two guardian records with one number, or brothers and
 * sisters) become one message naming all the children, unless the message
 * carries a child's own amount, receipt or link.
 */
function oneMessagePerAddress(rows: PlannedRow[], schoolName: string): { rows: PlannedRow[]; dropped: { row: PlannedRow; into: PlannedRow }[] } {
  const byAddress = new Map<string, PlannedRow[]>();
  for (const r of rows) {
    const k = `${r.channel}:${r.address.toLowerCase()}`;
    byAddress.set(k, [...(byAddress.get(k) ?? []), r]);
  }
  const out: PlannedRow[] = [];
  const dropped: { row: PlannedRow; into: PlannedRow }[] = [];
  const blankNames = Object.fromEntries(NAME_KEYS.map((k) => [k, "\u0001"]));
  const shape = (r: PlannedRow) => {
    if (!r.source) return `text:${r.text}`;
    const f = fill(r.source, { ...r.source.values, ...Object.fromEntries(NAME_KEYS.filter((k) => k in r.source!.values).map((k) => [k, blankNames[k]])) }, schoolName);
    return `${r.version?.id ?? "-"}|${f.ok ? f.text : r.text}|${r.source.title ?? ""}`;
  };
  for (const group of byAddress.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const clusters: PlannedRow[][] = [];
    for (const r of group) {
      const sameText = clusters.find((c) => c[0].text === r.text && c[0].title === r.title);
      if (sameText) { sameText.push(r); continue; }
      const s = shape(r);
      const own = r.source ? [...variablesIn(r.source.body ?? ""), ...variablesIn(r.source.typed ?? "")].some((k) => OWN_KEYS.has(k)) : true;
      // Rows of two guardian records join only when they are about the same children: a child one of them
      // has a custody restriction for is never added to the other's message (../students/guardian-access.ts).
      const fits = (c: PlannedRow[]) => c.every((m) => m.candidate.key === r.candidate.key || sameStudents(m, r));
      const sameShape = clusters.find((c) => shape(c[0]) === s && (!own || sameStudents(c[0], r)) && fits(c));
      if (sameShape) sameShape.push(r); else clusters.push([r]);
    }
    for (const c of clusters) {
      const first = c[0];
      if (c.length === 1) { out.push(first); continue; }
      const merged = joinRows(c, schoolName);
      out.push(merged);
      for (const r of c.slice(1)) if (r.candidate.key !== first.candidate.key) dropped.push({ row: r, into: merged });
    }
  }
  return { rows: out, dropped };
}

const sameStudents = (a: PlannedRow, b: PlannedRow) => (a.students ?? []).map((s) => s.id).sort().join() === (b.students ?? []).map((s) => s.id).sort().join();

function joinRows(rows: PlannedRow[], schoolName: string): PlannedRow {
  const first = rows[0];
  const keys = [...new Set(rows.flatMap((r) => r.keys ?? [r.rowKey]))];
  if (rows.every((r) => r.text === first.text) || !first.source) return { ...first, keys };
  const students = [...new Map(rows.flatMap((r) => r.students ?? []).map((s) => [s.id, s])).values()];
  const values: Record<string, string> = { ...first.source.values };
  // A child blank the sender set by hand (e.g. "5 A") is joined as written; otherwise it is worked out for all the children.
  const own = studentValues(students);
  for (const k of ["student_name", "class", "admission_no"] as const) {
    if (!(k in values)) continue;
    const byHand = rows.some((r) => r.source!.values[k] !== studentValues(r.students ?? [])[k]);
    values[k] = byHand ? join([...new Set(rows.map((r) => r.source!.values[k]).filter(Boolean))]) : own[k] ?? values[k];
  }
  const f = fill(first.source, values, schoolName);
  if (!f.ok) return { ...first, keys };
  const title = first.source.title ? render(first.source.title, f.values) : null;
  const ids = [...new Set(rows.map((r) => r.studentId))];
  return {
    ...first,
    keys,
    students,
    studentId: ids.length === 1 ? ids[0] : null,
    text: f.text,
    title: title && title.ok ? title.text : first.title,
    values: f.values,
    credits: creditsFor(first.channel, f.text),
    source: { ...first.source, values },
  };
}

type Route = { ok: true; versions: UsableVersion[] | null; carried: boolean } | { ok: false; why: string };

/** Template check: a blank that cannot be filled blocks the send, naming it. */
const strayWords = (stray: string[]) => `The message has ${stray.length === 1 ? "a blank" : "blanks"} that cannot be filled: ${stray.join(", ")}. Use blanks from the list, such as {student_name}, or take out the braces.`;

/** "WhatsApp and SMS are not connected; the SMS template "X" has no DLT template ID". */
function notSentReason(whys: string[]) {
  const all = [...new Set(whys)];
  const off = all.filter((w) => w.endsWith(" is not connected")).map((w) => w.replace(/ is not connected$/, ""));
  const rest = all.filter((w) => !w.endsWith(" is not connected"));
  const parts = [...(off.length ? [`${join(off)} ${off.length > 1 ? "are" : "is"} not connected`] : []), ...rest];
  // Parents never have the app; that is only worth saying when nothing else is wrong.
  const useful = parts.length > 1 ? parts.filter((p) => p !== "parents have no app") : parts;
  return `${NOT_SENT}${useful.join("; ")}`;
}

/**
 * Works out exactly who gets what: resolves the audience, applies opt-outs
 * and scope, picks for each person a channel that can carry the message and
 * their language version, fills the blanks, sends one message per phone and
 * counts the credits. Used for the preview and for the send.
 */
export async function planMessage(tx: Tx, ctx: SchoolContext, input: SendInput): Promise<Plan> {
  const problems: string[] = [];
  const problem = (p: string) => { if (!problems.includes(p)) problems.push(p); };
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, phone: true, timeZone: true, defaultLanguage: true, smsDltEntityId: true, smsSenderHeader: true } });
  const setups = await channelSetups(tx, ctx);
  const on = new Set<Channel>(["app", ...PROVIDER_CHANNELS.filter((c) => setups[c].isOn)]);
  const providersOn = on.has("whatsapp") || on.has("sms") || on.has("email");
  const live = whatsappIsLive(setups.whatsapp);
  const smsReady = Boolean(school.smsDltEntityId && school.smsSenderHeader);
  const preferred = input.channels === "preferred";
  const primary: Channel[] = preferred ? [] : [...new Set(input.channels as Channel[])];
  const fallback: Channel[] = [...new Set(preferred ? PREFERRED_ORDER : input.fallback ?? [])].filter((c) => !primary.includes(c));
  const tried = [...primary, ...fallback];
  const typed = (input.text ?? "").trim();
  const title = (input.title ?? "").trim() || null;

  if (tried.length === 0) problem("Choose at least one channel.");
  for (const ch of primary) {
    if (!on.has(ch)) problem(`${CHANNEL_LABEL[ch]} is switched off. Switch it on in Settings, SMS, WhatsApp & Email, or choose another channel.`);
  }
  if (primary.includes("sms") && !smsReady) problem("Add your DLT entity ID and sender header in Settings, SMS, WhatsApp & Email before sending SMS.");

  // Templates chosen for each channel; SMS only from a template with a DLT template ID (rule 34).
  const chosen = new Map<Channel, { name: string; versions: UsableVersion[] }>();
  for (const ch of tried) {
    const templateId = input.templates?.[ch] ?? null;
    if (!templateId) continue;
    const t = await tx.template.findFirst({ where: { id: templateId, schoolId: ctx.schoolId, archivedAt: null } });
    if (!t || t.channel !== ch) {
      if (primary.includes(ch)) problem(`The ${CHANNEL_LABEL[ch]} template was not found. Choose it again.`);
      continue;
    }
    let versions = await currentVersions(tx, ctx, t.id);
    if (ch === "sms") {
      versions = versions.filter((v) => v.dltTemplateId);
      if (versions.length === 0 && primary.includes(ch)) problem(`"${t.name}" has no DLT template ID. Add it in Message Templates.`);
    }
    chosen.set(ch, { name: t.name, versions });
  }
  if (typed.length > MAX_TEXT) problem(`The message has ${typed.length} characters. It can have at most ${MAX_TEXT}.`);
  const strayTyped = [...new Set([...strayBlanks(typed), ...strayBlanks(title ?? "")])];
  if (strayTyped.length) problem(strayWords(strayTyped));
  // A blank that is not on the list ({parent_name}) blocks the send, naming the blank meant (COMM-01). It is not
  // a value the people lack, so nobody is counted as "has no …" for it: it stays as typed in the preview.
  const unknownTyped = [...new Set([...unknownVariables(typed), ...unknownVariables(title ?? "")])];
  const asTyped: Record<string, string> = Object.fromEntries(unknownTyped.map((k) => [k, `{${k}}`]));
  for (const ch of primary) {
    if (!chosen.has(ch) && ch !== "sms" && !typed) problem(`Type the message, or choose a ${CHANNEL_LABEL[ch]} template.`);
  }
  if (primary.some((c) => c === "app" || c === "email") && !chosen.size && !title) {
    problem("Give the message a title. App notifications and emails show it first.");
  }

  // Which channel can carry this message, for parents and for staff.
  const routeFor = async (ch: Channel, kind: "guardian" | "staff"): Promise<Route> => {
    const no = (why: string): Route => ({ ok: false, why });
    const label = ch === "email" ? "email" : CHANNEL_LABEL[ch];
    if (!on.has(ch)) return no(`${label} is not connected`);
    if (ch === "app" && kind === "guardian") return no("parents have no app");
    if (ch === "sms" && !smsReady) return no("SMS needs the DLT entity ID and sender header (Settings, SMS, WhatsApp & Email)");
    const c = chosen.get(ch);
    if (c) {
      if (ch === "sms" && !c.versions.length) return no(`the SMS template "${c.name}" has no DLT template ID`);
      if (ch === "whatsapp" && live) {
        const approved = c.versions.filter(isApproved);
        return approved.length ? { ok: true, versions: approved, carried: false } : no(`WhatsApp has not approved the template "${c.name}" yet`);
      }
      return { ok: true, versions: c.versions, carried: false };
    }
    if (input.templates?.[ch]) return no(`the ${label} template was not found`);
    if (!typed) return no(`there is no ${label} template for this message`);
    if (ch === "app") return { ok: true, versions: null, carried: false };
    if (ch === "email") return title ? { ok: true, versions: null, carried: false } : no("an email needs a title");
    if (ch === "whatsapp" && !live) return { ok: true, versions: null, carried: false };
    // SMS, and WhatsApp on a real account, take typed words only inside a ready template.
    const t = await templateByKey(tx, ctx, TYPED_CARRIER[kind], ch);
    const all = t ? await currentVersions(tx, ctx, t.id) : [];
    const versions = ch === "sms" ? all.filter((v) => v.dltTemplateId) : all.filter(isApproved);
    if (versions.length) return { ok: true, versions, carried: true };
    const name = t?.name ?? (kind === "guardian" ? "General announcement" : "Message to staff");
    return no(ch === "sms" ? `a typed SMS goes only in the "${name}" template, which has no DLT template ID` : `a typed WhatsApp message goes only in the "${name}" template, which WhatsApp has not approved yet`);
  };
  const routes = new Map<string, Route>();
  for (const ch of tried) for (const kind of ["guardian", "staff"] as const) routes.set(`${ch}:${kind}`, await routeFor(ch, kind));
  if (primary.includes("sms") && !chosen.has("sms") && typed && !routes.get("sms:guardian")!.ok && !routes.get("sms:staff")!.ok) {
    problem("An SMS can only be sent from a template with a DLT template ID. Choose an SMS template, or send by WhatsApp.");
  }

  // SMS backup (fee, attendance and result messages only).
  let backupVersions: UsableVersion[] = [];
  let backupTemplateId: string | null = null;
  const backupWanted = Boolean(input.smsBackup && input.messageType && (BACKUP_TYPES as readonly string[]).includes(input.messageType) && tried.some((c) => c !== "sms"));
  if (backupWanted) {
    backupTemplateId = input.backupTemplateId ?? null;
    if (!backupTemplateId) {
      const key = input.ruleKey ?? null;
      const t = key ? await tx.template.findFirst({ where: { schoolId: ctx.schoolId, key, channel: "sms", archivedAt: null } }) : null;
      backupTemplateId = t?.id ?? null;
    }
    if (backupTemplateId) backupVersions = (await currentVersions(tx, ctx, backupTemplateId)).filter((v) => v.dltTemplateId);
    if (!backupVersions.length) {
      if (input.ruleKey) backupTemplateId = null; // automatic messages simply go without backup
      else problem("SMS backup needs an SMS template with a DLT template ID for this message. Choose one, or untick SMS backup.");
    }
    if (!on.has("sms") && backupVersions.length) {
      if (input.ruleKey) backupTemplateId = null;
      else problem("SMS backup needs SMS to be switched on in Settings, SMS, WhatsApp & Email.");
    }
  }

  const scope = input.scope ?? SYSTEM_SCOPE;
  const candidates = await resolveAudience(tx, ctx, input.to, scope);
  if (unknownTyped.length) {
    const kinds = [...new Set(candidates.map((c): BlankAudience => (c.type === "guardian" ? "parents" : c.type === "student" ? "students" : "staff")))];
    problem(unknownBlankWords(unknownTyped, blanksFor(kinds))!);
  }
  const skipped = new Map<string, SkipGroup>();
  const planned: PlannedRow[] = [];
  const notSent: NotSentRow[] = [];

  for (const c of candidates) {
    if (input.exclude?.(c.key)) continue;
    if (!c.inScope) { addSkip(skipped, "Outside your classes", c.name, c.key); continue; }
    if (c.optedOut && !input.emergency && !input.oneTimeCode) { addSkip(skipped, "Opted out of messages", c.name, c.key); continue; }
    const kind = c.type === "guardian" ? "guardian" : "staff";
    // One message per student when each student has their own values (fee due, absent today).
    const split = c.type === "guardian" && input.perStudent ? c.students.filter((s) => input.perStudent![s.id]) : null;
    const units: (string | null)[] = split ? (split.length ? split.map((s) => s.id) : [null]) : [null];
    let personAdded = false;
    let personNotSent = false;
    let personSkip: string | null = null;
    for (const studentId of units) {
      const students = studentId ? c.students.filter((s) => s.id === studentId) : c.students;
      const values: Record<string, string> = {
        ...asTyped,
        ...baseValues(school, c, students),
        ...(input.values ?? {}),
        ...(studentId ? input.perStudent![studentId] : c.students.length === 1 && input.perStudent?.[c.students[0].id] ? input.perStudent[c.students[0].id] : {}),
        ...(input.perPerson?.[c.id] ?? {}),
        // The code itself is never in a stored text or blank: only the mask is.
        ...(input.oneTimeCode ? { code: CODE_MASK } : {}),
      };
      const rowKey = studentId ? `${c.key}:${studentId}` : c.key;
      const whys: string[] = [];
      let addressSkip: string | null = null;
      let missing: string | null = null;

      const attempt = (ch: Channel, isPrimary: boolean): PlannedRow | null => {
        const route = routes.get(`${ch}:${kind}`)!;
        if (!route.ok) {
          // Parents chosen for the app on purpose keep the plain reason they always had.
          if (ch === "app" && c.type === "guardian" && isPrimary) { const a = addressFor(c, ch, providersOn); if ("skip" in a) addressSkip ??= a.skip; }
          else whys.push(route.why);
          return null;
        }
        const addr = addressFor(c, ch, providersOn);
        if ("skip" in addr) { addressSkip ??= addr.skip; return null; }
        let version: UsableVersion | null = null;
        let rowTitle = title;
        const src: Source = { body: null, typed: typed || null, carried: false, title: null, values };
        if (route.versions) {
          version = versionFor(route.versions, c.language, school.defaultLanguage);
          if (!version) { whys.push(`there is no ${CHANNEL_LABEL[ch]} text for this message`); return null; }
          src.body = version.body;
          src.carried = route.carried;
          rowTitle = route.carried ? title : version.subject ?? title;
        }
        if (src.body === null && !src.typed) return null;
        src.title = rowTitle;
        const f = fill(src, values, school.name);
        if (!f.ok) {
          if (input.single) throw new MessagingProblem(`${c.name} has ${missingWords(f.missing)}, so the message cannot be sent. Fix the record, or remove that blank.`);
          missing = `Has ${missingWords(f.missing)}`;
          return null;
        }
        const t = rowTitle ? render(rowTitle, f.values) : null;
        if (t && !t.ok) {
          if (input.single) throw new MessagingProblem(`${c.name} has ${missingWords(t.missing)}, so the message cannot be sent. Fix the record, or remove that blank.`);
          missing = `Has ${missingWords(t.missing)}`;
          return null;
        }
        const stray = [...new Set([...strayBraces(f.text), ...(t && t.ok ? strayBraces(t.text) : [])])];
        if (stray.length && !strayTyped.length && !unknownTyped.length) problem(strayWords(stray));
        return {
          candidate: c,
          rowKey,
          keys: [rowKey],
          students,
          studentId: studentId ?? (c.students.length === 1 ? c.students[0].id : c.type === "student" ? c.id : null),
          channel: ch,
          address: addr.address,
          language: version?.language ?? c.language,
          version,
          title: t && t.ok ? t.text : rowTitle,
          text: f.text,
          values: f.values,
          // Counted on the words as sent: the mask would make an SMS look like Unicode.
          credits: creditsFor(ch, input.oneTimeCode ? withCode(f.text, input.oneTimeCode.code) : f.text),
          source: src,
        };
      };

      const unit: PlannedRow[] = [];
      for (const ch of primary) { const r = attempt(ch, true); if (r) unit.push(r); }
      if (!unit.length) for (const ch of fallback) { const r = attempt(ch, false); if (r) { unit.push(r); break; } }
      if (unit.length) { planned.push(...unit); personAdded = true; continue; }
      if (missing) { personSkip = missing; continue; }
      if (addressSkip) { personSkip ??= addressSkip; continue; }
      if (whys.length) {
        // Kept on the message as Not sent, on the first connected channel, so it shows as not delivered.
        const ch = tried.find((x) => on.has(x) && x !== "app") ?? tried[0] ?? "app";
        const a = addressFor(c, ch, providersOn);
        const t = typed ? render(typed, values) : null;
        notSent.push({ candidate: c, rowKey, studentId: studentId ?? (c.students.length === 1 ? c.students[0].id : c.type === "student" ? c.id : null), channel: ch, address: "address" in a ? a.address : "", language: c.language, text: t?.ok ? t.text : typed, values, reason: notSentReason(whys) });
        personNotSent = true;
        continue;
      }
      personSkip ??= "Nothing to send to this person";
    }
    if (!personAdded && !personNotSent) addSkip(skipped, personSkip ?? "Nothing to send to this person", c.name, c.key);
  }

  // One message per phone, email or login.
  const { rows, dropped } = oneMessagePerAddress(planned, school.name);
  const reached = new Set(rows.map((r) => r.candidate.key));
  const droppedOnce = new Set<string>();
  for (const d of dropped) {
    if (reached.has(d.row.candidate.key) || droppedOnce.has(d.row.candidate.key)) continue;
    droppedOnce.add(d.row.candidate.key);
    const what = d.row.channel === "email" ? "email" : d.row.channel === "app" ? "login" : "number";
    addSkip(skipped, `Same ${what} as ${d.into.candidate.name}`, d.row.candidate.name, d.row.candidate.key);
  }
  const notSentPeople = new Map<string, NotSentRow>();
  for (const n of notSent) if (!reached.has(n.candidate.key) && !notSentPeople.has(n.candidate.key)) notSentPeople.set(n.candidate.key, n);
  for (const n of notSentPeople.values()) addSkip(skipped, n.reason, n.candidate.name, n.candidate.key, true);

  const cost: Partial<Record<Channel, number>> = {};
  for (const r of rows) if (PAID_CHANNELS.has(r.channel)) cost[r.channel] = (cost[r.channel] ?? 0) + r.credits;
  // Test mode sends nothing, so it uses no credits (COMM-04): the cost is shown, but not taken.
  const testOn = new Set<Channel>(PROVIDER_CHANNELS.filter((c) => on.has(c) && inTestMode(setups[c])));
  const charged: Partial<Record<Channel, number>> = Object.fromEntries(Object.entries(cost).filter(([c]) => !testOn.has(c as Channel)));

  // Backup SMS that may be needed: one per guardian message not already going by SMS.
  let backupCost = 0;
  if (backupVersions.length) {
    for (const r of rows) {
      if (r.channel === "sms" || r.candidate.type !== "guardian") continue;
      const v = backupVersions.find((x) => x.language === r.language) ?? backupVersions.find((x) => x.language === "en") ?? backupVersions[0];
      const out = render(v.body, r.values);
      backupCost += out.ok ? creditsFor("sms", out.text) : 0;
    }
  }

  const balances = await creditBalances(tx, ctx);
  const needs = { ...charged, sms: (charged.sms ?? 0) + (testOn.has("sms") ? 0 : backupCost) };
  const used = [...new Set(rows.map((r) => r.channel))];
  const backupUsed = backupVersions.length > 0 && backupCost > 0;
  return {
    // The channels chosen, and any a person fell back to (shown on Message History).
    channels: primary.length || used.length ? [...new Set([...primary, ...used])] : [...new Set(notSent.map((n) => n.channel))],
    rows,
    notSent,
    people: reached.size,
    skipped: [...skipped.values()].sort((a, b) => b.count - a.count),
    cost,
    charged,
    testMode: [...testOn].filter((c) => used.includes(c) || (c === "sms" && backupUsed)),
    backupCost,
    balances,
    creditProblem: creditProblem(needs, balances),
    problems,
    audienceLabel: input.audienceLabel ?? (await describeAudience(tx, ctx, input.to)),
    backupTemplateId: backupVersions.length ? backupTemplateId : null,
  };
}

export type SendResult = {
  messageId: string;
  queued: number;
  people: number;
  skipped: SkipGroup[];
  cost: Partial<Record<Channel, number>>;
  scheduled: boolean;
  repeated: boolean;
  /** People no channel could carry it to, kept on the message as Not sent. */
  notSent?: number;
};

/** "Nobody would get this message. Not sent: WhatsApp is not connected (12)." */
function nobodyWords(plan: Plan) {
  const why = plan.skipped[0] ? ` ${plan.skipped.map((s) => `${s.reason} (${s.count})`).join(". ")}.` : "";
  return `Nobody would get this message.${why}`;
}

/**
 * Records one Message with a Message Recipient for each person and channel,
 * takes the credits, and queues delivery as a background job. Must be called
 * inside the caller's transaction (withSchool), so the message is saved
 * together with whatever caused it. People no channel could carry it to are
 * kept as Failed ("Not sent: …").
 */
export async function recordSend(tx: Tx, ctx: SchoolContext, input: SendInput, plan: Plan): Promise<SendResult> {
  if (input.idempotencyKey) {
    const existing = await tx.message.findUnique({ where: { schoolId_idempotencyKey: { schoolId: ctx.schoolId, idempotencyKey: input.idempotencyKey } }, include: { _count: { select: { recipients: true } } } });
    if (existing) return { messageId: existing.id, queued: existing._count.recipients, people: existing.recipientCount, skipped: existing.skipped as SkipGroup[], cost: {}, scheduled: existing.status === "SCHEDULED", repeated: true };
  }
  if (plan.problems.length) throw new MessagingProblem(plan.problems[0]);
  const notSent = plan.notSent ?? [];
  const sending = plan.rows.length > 0;
  // "Parents have no app … (1).": the reason keeps its own words and capitals (WhatsApp, SMS);
  // a count in front read "1 parents have no app".
  if (!sending && !(input.onNobody === "record" && notSent.length)) throw new MessagingProblem(nobodyWords(plan));
  const short = sending ? plan.creditProblem : null;
  if (short && (input.onNoCredits ?? "block") === "block") throw new MessagingProblem(short);
  const failForCredits = Boolean(short);

  const code = input.oneTimeCode ?? null;
  // Guard (QA SEC-01): a one-time code is never written into a message, whoever built the plan.
  if (code) {
    const stored = [input.text ?? "", input.title ?? "", ...plan.rows.flatMap((r) => [r.text, r.title ?? "", JSON.stringify(r.values)]), ...notSent.flatMap((n) => [n.text, JSON.stringify(n.values)])];
    if (stored.some((t) => hasCode(t, code.code))) throw new Error("A one-time code must never be stored in a message. Put CODE_MASK in the text and pass the code as oneTimeCode.");
  }

  const now = new Date();
  const scheduled = sending && !code && Boolean(input.scheduledAt && input.scheduledAt.getTime() > now.getTime() + 30_000);
  const first = plan.rows[0];
  const message = await tx.message.create({
    data: {
      schoolId: ctx.schoolId,
      title: (input.title ?? "").trim() || first?.title || null,
      body: (input.text ?? "").trim() || first?.version?.body || first?.text || notSent[0]?.text || "",
      channels: plan.channels,
      templateId: Object.values(input.templates ?? {}).find(Boolean) ?? null,
      audienceLabel: plan.audienceLabel.slice(0, 300),
      audience: input.to as Prisma.InputJsonValue,
      recipientCount: plan.people,
      // Not sent people are recipients (Failed), not "left out".
      skipped: plan.skipped.filter((g) => !g.notSent).map(({ reason, count, names }) => ({ reason, count, names })) as unknown as Prisma.InputJsonValue,
      creditCost: Object.values(plan.charged).reduce((a, b) => a + (b ?? 0), 0),
      status: !sending ? "SENT" : scheduled ? "SCHEDULED" : "QUEUED",
      sentAt: sending ? null : now,
      isEmergency: Boolean(input.emergency) && !code,
      messageType: code ? ONE_TIME_CODE : input.messageType ?? "general",
      smsBackup: Boolean(plan.backupTemplateId),
      backupTemplateId: plan.backupTemplateId,
      // A code is sent by School OS, not by the person who asked for it.
      sentById: input.ruleKey || code ? null : ctx.userId,
      ruleKey: input.ruleKey ?? null,
      trigger: input.trigger ?? null,
      sourceType: input.source?.type ?? null,
      sourceId: input.source?.id ?? null,
      attachmentFileIds: input.attachmentFileIds ?? [],
      resendOfId: input.resendOfId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      scheduledAt: scheduled ? input.scheduledAt : null,
    },
  });
  const at = now.toISOString();
  const person = (c: Candidate) => ({
    recipientType: c.type,
    guardianId: c.type === "guardian" ? c.id : null,
    staffId: c.type === "staff" ? c.id : null,
    userLoginId: c.userLoginId,
    name: c.name,
    description: c.description || null,
  });
  await tx.messageRecipient.createMany({
    data: [
      ...plan.rows.map((r) => {
        const testMode = plan.testMode.includes(r.channel);
        const noCredits = failForCredits && PAID_CHANNELS.has(r.channel) && !testMode;
        return {
          schoolId: ctx.schoolId,
          messageId: message.id,
          ...person(r.candidate),
          studentId: r.studentId,
          channel: r.channel,
          address: r.address,
          language: r.language,
          templateVersionId: r.version?.id ?? null,
          values: r.values,
          text: r.text,
          // Only until the delivery job hands it to the provider.
          sealedCode: code && !noCredits ? sealCode(code.code) : null,
          status: noCredits ? "FAILED" as const : "QUEUED" as const,
          failReason: noCredits ? "Not enough credits when it was sent. Top up and retry." : null,
          failedAt: noCredits ? now : null,
          credits: noCredits || testMode ? 0 : r.credits,
          history: [{ at, status: noCredits ? "FAILED" : "QUEUED", note: noCredits ? "Not enough credits" : scheduled ? "Scheduled" : null }],
        };
      }),
      ...notSent.map((n) => ({
        schoolId: ctx.schoolId,
        messageId: message.id,
        ...person(n.candidate),
        studentId: n.studentId,
        channel: n.channel,
        address: n.address,
        language: n.language,
        templateVersionId: null,
        values: n.values,
        text: n.text,
        status: "FAILED" as const,
        failReason: n.reason,
        failedAt: now,
        credits: 0,
        history: [{ at, status: "FAILED", note: n.reason }],
      })),
    ],
  });
  if (!failForCredits) {
    for (const [ch, n] of Object.entries(plan.charged)) {
      await spendCredits(tx, ctx, ch as Channel, n ?? 0, `${message.title ?? message.audienceLabel}: ${plan.rows.filter((r) => r.channel === ch).length} ${CHANNEL_LABEL[ch as Channel]}`, message.id);
    }
  }
  if (sending) await enqueue(tx, ctx, DELIVER_JOB, `deliver:${message.id}:0:0`, { messageId: message.id, round: "0", chunk: 0 }, scheduled ? input.scheduledAt! : now);
  await writeAudit(tx, ctx, {
    action: code ? "one-time-code-sent" : scheduled ? "scheduled-message" : input.emergency ? "sent-emergency-broadcast" : "sent-message",
    recordType: "Message",
    recordId: message.id,
    actorNote: input.ruleKey ? `Automatic rule: ${input.ruleKey}` : code ? codeSenderWords(code.purpose) : null,
    after: code
      ? { purpose: input.trigger ?? code.purpose, to: plan.audienceLabel, channels: plan.channels, credits: message.creditCost, code: "hidden" }
      : { to: plan.audienceLabel, people: plan.people, notSent: notSent.length, channels: plan.channels, credits: message.creditCost, scheduledAt: scheduled ? input.scheduledAt!.toISOString() : null },
  });
  return { messageId: message.id, queued: plan.rows.length, people: plan.people, skipped: plan.skipped, cost: plan.charged, scheduled, repeated: false, notSent: notSent.length };
}

/** Plans and records in one step. See the header of ./index.ts. */
export async function sendMessage(tx: Tx, ctx: SchoolContext, input: SendInput): Promise<SendResult> {
  if (input.idempotencyKey) {
    const existing = await tx.message.findUnique({ where: { schoolId_idempotencyKey: { schoolId: ctx.schoolId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return recordSend(tx, ctx, input, null as unknown as Plan);
  }
  const plan = await planMessage(tx, ctx, input);
  return recordSend(tx, ctx, input, plan);
}

/**
 * For a plan made by hand (one message to an applicant or a visitor): the
 * credits really used, none on a channel in test mode (COMM-04).
 */
export async function chargesFor(tx: Tx, ctx: SchoolContext, cost: Partial<Record<Channel, number>>): Promise<Pick<Plan, "charged" | "testMode">> {
  const setups = await channelSetups(tx, ctx);
  const testMode = PROVIDER_CHANNELS.filter((c) => setups[c].isOn && inTestMode(setups[c]) && c in cost);
  return { charged: Object.fromEntries(Object.entries(cost).filter(([c]) => !testMode.includes(c as (typeof PROVIDER_CHANNELS)[number]))), testMode };
}

/** "WhatsApp is in test mode, so nobody receives it." */
export function testModeWords(channels: Channel[]) {
  return channels.length ? `${join(channels.map((c) => CHANNEL_LABEL[c]))} ${channels.length > 1 ? "are" : "is"} in test mode, so nobody receives it` : "";
}

/** The credits a send really uses: "3 WhatsApp credits", "Free", or "No credits: WhatsApp is in test mode, so nobody receives it". */
export function creditWords(plan: Pick<Plan, "charged" | "testMode">, channelLabel = "") {
  const n = Object.values(plan.charged).reduce((a, b) => a + (b ?? 0), 0);
  const test = testModeWords(plan.testMode);
  if (n) return `${n.toLocaleString("en-IN")} ${channelLabel ? `${channelLabel} ` : ""}credits${test ? `; ${test}` : ""}`;
  return test ? `No credits: ${test}` : "Free";
}

/** Words for skipped people: "12 opted out of messages; 3 have no due amount". */
export function skippedWords(groups: SkipGroup[]) {
  return groups.map((g) => countWithReason(g.count, g.reason)).join("; ");
}

/** The reason nobody (or not everyone) got a message, in a sentence; null when everyone was reached. */
export function notSentWords(r: Pick<SendResult, "skipped" | "notSent">) {
  const g = r.skipped.find((x) => x.notSent);
  return g ? `${g.count} ${g.count === 1 ? "person was" : "people were"} not sent it: ${g.reason.slice(NOT_SENT.length)}.` : null;
}
