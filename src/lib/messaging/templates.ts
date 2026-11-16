// Message Templates (11-communication.md, Message Templates): blanks like
// {student_name}, a version for each save, one text per language, the DLT
// template ID for SMS (rule 34) and the WhatsApp approval status.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Channel } from "./channels";
import { appUrl } from "../parent-link/token";
import type { Prisma } from "@prisma/client";
import { STRAY, VARIABLES, variablesIn } from "./blanks";
import { READY_WHATSAPP, readyCard } from "./ready-whatsapp";

export const TEMPLATE_CATEGORIES = [
  { key: "fees", label: "Fees" },
  { key: "attendance", label: "Attendance" },
  { key: "exam", label: "Exams and results" },
  { key: "general", label: "General" },
  { key: "admission", label: "Admission" },
  { key: "homework", label: "Homework" },
  { key: "events", label: "Events and PTM" },
  { key: "staff", label: "Staff" },
  { key: "parent-link", label: "Parent Link" },
  { key: "queries", label: "Queries" },
  { key: "transport", label: "Transport" },
  { key: "front-office", label: "Front Office" },
] as const;

export const categoryLabel = (key: string) => TEMPLATE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

export { VARIABLES, VARIABLE_KEYS, variablesIn, unknownVariables, strayBlanks, whatsappProblems } from "./blanks";
export const sampleValues = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));

const BLANK = /\{([a-z_]+)\}/g;

export type Rendered = { ok: true; text: string } | { ok: false; missing: string[] };

/** Fills the blanks. A blank with no value is reported, never sent empty (Template check). */
export function render(text: string, values: Record<string, string | null | undefined>): Rendered {
  const missing = variablesIn(text).filter((k) => values[k] === undefined || values[k] === null || String(values[k]).trim() === "");
  if (missing.length) return { ok: false, missing };
  return { ok: true, text: text.replace(BLANK, (_, k: string) => String(values[k])) };
}

/**
 * Braces still in a filled-in text: a mistyped blank ({Student Name}), a
 * doubled one ({{diary}}) or a brace without its pair. Such a text never
 * reaches a parent (Template check).
 */
export function strayBraces(text: string): string[] {
  const found = [...new Set(text.match(STRAY) ?? [])];
  if (!found.length && /[{}]/.test(text)) found.push(text.includes("{") ? "{" : "}");
  return found;
}

export const variableLabel = (key: string) => VARIABLES.find((v) => v.key === key)?.label.toLowerCase() ?? key.replace(/_/g, " ");

/** "no due amount" — the reason a recipient is skipped. */
export function missingWords(missing: string[]) {
  return `no ${missing.map(variableLabel).join(" or ")}`;
}

/** SMS parts: 160 characters (153 per part when longer), or 70 (67) with Indian scripts. */
export function smsParts(raw: string): number {
  // A Parent Link, invite or payment link placeholder is counted as the real link it becomes.
  const text = raw.replace(/⟦parent-link:[^⟧]+⟧/g, `${appUrl()}/p/${"x".repeat(43)}`).replace(/⟦invite:[^⟧]+⟧/g, `${appUrl()}/invite/${"x".repeat(43)}`)
    .replace(/⟦pay-link:[^⟧]+⟧/g, `${appUrl()}/pay/${"x".repeat(36)}/${"x".repeat(43)}`).replace(/⟦receipt:[^⟧]+⟧/g, `${appUrl()}/r/${"x".repeat(86)}`);
  const unicode = /[^\x00-\x7F₹]/.test(text);
  const len = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return len <= single ? 1 : Math.ceil(len / multi);
}

/** DLT template IDs are letters and numbers only (inferred). */
export function checkDltId(v: string): string | null {
  if (!v) return null;
  return /^[A-Za-z0-9]{6,40}$/.test(v) ? null : "The DLT template ID can have only letters and numbers, as shown on the DLT portal.";
}

export type UsableVersion = {
  id: string;
  templateId: string;
  language: string;
  body: string;
  subject: string | null;
  variables: string[];
  dltTemplateId: string | null;
  whatsappName: string | null;
  whatsappStatus: string | null;
  /** WhatsApp card parts (./card.ts readCard), or null for a plain text. */
  whatsappCard?: unknown;
};

/** The current version of a template in each language. */
export async function currentVersions(tx: Tx, ctx: SchoolContext, templateId: string): Promise<UsableVersion[]> {
  return tx.templateVersion.findMany({
    where: { schoolId: ctx.schoolId, templateId, isCurrent: true },
    select: { id: true, templateId: true, language: true, body: true, subject: true, variables: true, dltTemplateId: true, whatsappName: true, whatsappStatus: true, whatsappCard: true },
    orderBy: { language: "asc" },
  });
}

/**
 * On a real WhatsApp account: a language whose current text WhatsApp has not
 * approved yet (new words sent for approval, src/lib/communication/whatsapp-ready.ts)
 * keeps going in its last text WhatsApp approved, until the new one is approved.
 * Texts "approved" only in test mode never count.
 */
export async function withLastApproved(tx: Tx, ctx: SchoolContext, templateId: string, versions: UsableVersion[]): Promise<UsableVersion[]> {
  const waiting = versions.filter((v) => !isApproved(v)).map((v) => v.language);
  if (!waiting.length) return versions;
  const older = await tx.templateVersion.findMany({
    where: { schoolId: ctx.schoolId, templateId, isCurrent: false, language: { in: waiting }, whatsappStatus: "APPROVED", whatsappName: { not: null }, OR: [{ whatsappNote: null }, { NOT: { whatsappNote: { startsWith: "Test mode" } } }] },
    select: { id: true, templateId: true, language: true, body: true, subject: true, variables: true, dltTemplateId: true, whatsappName: true, whatsappStatus: true, whatsappCard: true },
    orderBy: { version: "desc" },
  });
  return versions.map((v) => (isApproved(v) ? v : older.find((o) => o.language === v.language) ?? v));
}

/** The version for a language: that language, else the school's main language, else English, else any. */
export function versionFor(versions: UsableVersion[], language: string, schoolLanguage: string): UsableVersion | null {
  return versions.find((v) => v.language === language) ?? versions.find((v) => v.language === schoolLanguage) ?? versions.find((v) => v.language === "en") ?? versions[0] ?? null;
}

/** Why a version cannot be used on its channel, or null when it can. */
export function unusableReason(channel: Channel, v: Pick<UsableVersion, "dltTemplateId" | "whatsappStatus">): string | null {
  if (channel === "sms" && !v.dltTemplateId) return "This SMS template has no DLT template ID yet. The School OS support team adds it.";
  return null;
}

/** Approved by WhatsApp: on a real WhatsApp Business account only these can start a message to a parent. */
export function isApproved(v: Pick<UsableVersion, "whatsappStatus" | "whatsappName">) {
  return v.whatsappStatus === "APPROVED" && Boolean(v.whatsappName);
}

/**
 * The ready templates that carry a typed message on a channel that sends
 * only templates (SMS always, WhatsApp on a real account): the typed words
 * fill their {message} blank.
 */
export const TYPED_CARRIER = { guardian: "general", staff: "staff-message" } as const;

/**
 * "Dear Parent, the PTM is on Saturday. - Sunrise School" becomes "the PTM is
 * on Saturday.", because the carrying template adds its own greeting and the
 * school's name. Line breaks become spaces (WhatsApp refuses them in a blank).
 */
export function bareText(text: string, schoolName: string) {
  const one = text.replace(/\s+/g, " ").trim();
  const name = schoolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = one.replace(/^Dear [^,.!?]{1,60},\s*/i, "").replace(new RegExp(`\\s*[-–]\\s*${name}\\.?$`), "").trim();
  return bare || one;
}

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "te", label: "Telugu" },
  { code: "ta", label: "Tamil" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
];
export const languageLabel = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

type ReadyTemplate = { key: string; name: string; category: string; channel: Channel; subject?: string; texts: Record<string, string> };

/** A ready WhatsApp card (./ready-whatsapp.ts) as a ready template; its header and buttons come from readyCard. */
const wa = (key: string): ReadyTemplate => {
  const t = READY_WHATSAPP.find((x) => x.key === key);
  if (!t) throw new Error(`No ready WhatsApp card for ${key}`);
  return { key: t.key, name: t.name, category: t.category, channel: "whatsapp", texts: t.texts };
};

/**
 * Ready templates every school starts with, so automatic messages work from
 * the first day. SMS ones still need the school's own DLT template IDs. The
 * WhatsApp ones are cards (./ready-whatsapp.ts); SMS and app texts keep their words.
 */
export const READY_TEMPLATES: ReadyTemplate[] = [
  wa("absence"),
  { key: "absence", name: "Absent today (SMS)", category: "attendance", channel: "sms", texts: {
    en: "Dear Parent, {student_name} of {class} is absent today {date}. Please contact the school. - {school_name}",
  } },
  wa("late"),
  // On WhatsApp the way to pay is the card's button (the parent's own Parent Link). {how_to_pay} stays for SMS:
  // each parent's Parent Link, a payment link, or "Please pay at the school office." (src/lib/fees/reminder-pay.ts).
  wa("fee-due"),
  { key: "fee-due", name: "Fee reminder (SMS)", category: "fees", channel: "sms", texts: {
    en: "Dear Parent, fee of {due_amount} for {student_name} is due on {due_date}. {how_to_pay} - {school_name}",
  } },
  // The receipt PDF is the card's header and "Open receipt" its button (./card.ts).
  wa("fee-paid"),
  { key: "fee-paid", name: "Fee received (SMS)", category: "fees", channel: "sms", texts: {
    en: "Received {paid_amount} for {student_name} on {payment_date}. Receipt {receipt_number}. Thank you. - {school_name}",
  } },
  // {parent_link} is each parent's own Parent Link, or "Ask the school office for your Parent Link." (src/lib/parent-link/blank.ts).
  wa("exam-reminder"),
  wa("result"),
  { key: "result", name: "Results published (SMS)", category: "exam", channel: "sms", texts: {
    en: "Results of {exam_name} for {student_name} are ready. See your Parent Link: {parent_link} - {school_name}",
  } },
  wa("ptm"),
  wa("bus-pickup"),
  wa("bus-drop"),
  wa("bus-arriving"),
  { key: "homework-set", name: "Homework set", category: "homework", channel: "app", subject: "New homework", texts: {
    en: "New homework for {class}: {message}",
  } },
  // Parents have no app: the "Homework set" rule reaches them on WhatsApp (17 Done when 10).
  wa("homework-set"),
  wa("homework-pending"),
  wa("birthday-student"),
  wa("birthday-staff"),
  { key: "salary-slip", name: "Salary slip ready", category: "staff", channel: "app", subject: "Salary slip ready", texts: {
    en: "Dear {staff_name}, your salary slip is ready. Open it in My salary slips.",
  } },
  wa("salary-slip"),
  wa("admission-welcome"),
  wa("parent-link"),
  { key: "parent-link", name: "Parent Link (SMS)", category: "parent-link", channel: "sms", texts: {
    en: "Dear Parent, your Parent Link from {school_name}: {link} Do not share it.",
  } },
  { key: "parent-link-code", name: "Parent Link code (SMS)", category: "parent-link", channel: "sms", texts: {
    en: "{code} is your one-time code for Parent Link of {school_name}. It works for 10 minutes. Do not share it.",
  } },
  // Code templates go to WhatsApp as Authentication, in Meta's own fixed words (providers/whatsapp.ts authTemplateComponents).
  { key: "parent-link-code", name: "Parent Link code", category: "parent-link", channel: "whatsapp", texts: {
    en: "Your one-time code for Parent Link of {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.",
  } },
  { key: "admission-consent-code", name: "Admission consent code (SMS)", category: "admission", channel: "sms", texts: {
    en: "{code} is your code to confirm consent for admission at {school_name}. It works for 10 minutes. Do not share it.",
  } },
  { key: "admission-consent-code", name: "Admission consent code", category: "admission", channel: "whatsapp", texts: {
    en: "Your one-time code to confirm consent for admission at {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.",
  } },
  wa("consent-request"),
  wa("query-number"),
  wa("query-rating"),
  wa("staff-invite"),
  { key: "staff-invite", name: "Staff invite (SMS)", category: "staff", channel: "sms", texts: {
    en: "Dear {staff_name}, set your School OS password for {school_name}: {link} Works once, for 7 days. Do not share it.",
  } },
  { key: "staff-invite", name: "Staff invite (email)", category: "staff", channel: "email", subject: "Your School OS invite from {school_name}", texts: {
    en: "Dear {staff_name},\n\n{school_name} has invited you to School OS. Open this link to choose your own password:\n\n{link}\n\nThe link works once, for 7 days. Please do not share it with anyone.",
  } },
  { key: "sign-in-code", name: "Sign-in code (SMS)", category: "staff", channel: "sms", texts: {
    en: "{code} is your School OS sign-in code for {school_name}. It works for 10 minutes. Do not share it.",
  } },
  wa("staff-message"),
  { key: "staff-message", name: "Message to staff (SMS)", category: "staff", channel: "sms", texts: {
    en: "Dear {staff_name}, {message} - {school_name}",
  } },
  wa("behaviour-note"),
  { key: "behaviour-note", name: "Behaviour note (SMS)", category: "general", channel: "sms", texts: {
    en: "Dear Parent, about {student_name} ({class}): {title} on {date}. Please contact the class teacher. - {school_name}",
  } },
  wa("notice"),
  { key: "notice", name: "New notice (SMS)", category: "general", channel: "sms", texts: {
    en: "{school_name}: New notice: {title}. See it on your Parent Link: {parent_link}",
  } },
  wa("general"),
  { key: "general", name: "General announcement (SMS)", category: "general", channel: "sms", texts: {
    en: "Dear Parent, {message} - {school_name}",
  } },
  // Front Office (src/lib/front-office/notify.ts): approved templates, because plain text reaches a visitor
  // only within 24 hours of their own message. The pickup code is a code template (Authentication).
  wa("appointment-confirmed"),
  wa("appointment-reminder"),
  wa("appointment-cancelled"),
  wa("visitor-pass"),
  wa("walk-in-number"),
  wa("gate-pass"),
  { key: "pickup-code", name: "Pickup code", category: "front-office", channel: "whatsapp", texts: {
    en: "Your one-time code to collect your child from {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.",
  } },
  wa("connection-test"),
];

/** Creates the ready templates a school does not have yet. Safe to run twice. */
export async function ensureReadyTemplates(tx: Tx, ctx: SchoolContext) {
  const have = await tx.template.findMany({ where: { schoolId: ctx.schoolId, key: { not: null } }, select: { key: true, channel: true } });
  const exists = new Set(have.map((t) => `${t.key}:${t.channel}`));
  for (const t of READY_TEMPLATES) {
    if (exists.has(`${t.key}:${t.channel}`)) continue;
    exists.add(`${t.key}:${t.channel}`);
    await tx.template.create({
      data: {
        schoolId: ctx.schoolId,
        name: t.name,
        category: t.category,
        channel: t.channel,
        key: t.key,
        createdById: ctx.userId,
        versions: {
          create: Object.entries(t.texts).map(([language, body]) => ({
            schoolId: ctx.schoolId,
            language,
            version: 1,
            subject: t.subject ?? null,
            body,
            variables: variablesIn(body),
            whatsappStatus: t.channel === "whatsapp" ? "NOT_SUBMITTED" : null,
            ...(t.channel === "whatsapp" && readyCard(t.key, language) ? { whatsappCard: readyCard(t.key, language) as Prisma.InputJsonValue } : {}),
            createdById: ctx.userId,
          })),
        },
      },
    });
  }
}

/** The school's template for a key and channel (e.g. "absence" on SMS), if it has one. */
export async function templateByKey(tx: Tx, ctx: SchoolContext, key: string, channel: Channel) {
  return tx.template.findFirst({ where: { schoolId: ctx.schoolId, key, channel, archivedAt: null }, orderBy: { createdAt: "asc" } });
}
