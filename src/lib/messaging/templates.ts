// Message Templates (11-communication.md, Message Templates): blanks like
// {student_name}, a version for each save, one text per language, the DLT
// template ID for SMS (rule 34) and the WhatsApp approval status.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Channel } from "./channels";
import { appUrl } from "../parent-link/token";

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
] as const;

export const categoryLabel = (key: string) => TEMPLATE_CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** The blanks a person can insert, with an example used in previews. */
export const VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: "student_name", label: "Student name", sample: "Ravi Kumar" },
  { key: "class", label: "Class and section", sample: "Class 5 A" },
  { key: "admission_no", label: "Admission number", sample: "SPS/2024/00123" },
  { key: "guardian_name", label: "Parent name", sample: "Srinivas Kumar" },
  { key: "staff_name", label: "Staff name", sample: "Meena Iyer" },
  { key: "school_name", label: "School name", sample: "Sunrise Public School" },
  { key: "school_phone", label: "School phone", sample: "9876500001" },
  { key: "date", label: "Date", sample: "09-10-2026" },
  { key: "due_amount", label: "Due amount", sample: "₹12,500" },
  { key: "due_date", label: "Due date", sample: "15-10-2026" },
  { key: "receipt_number", label: "Receipt number", sample: "SPS/2026/00456" },
  { key: "paid_amount", label: "Paid amount", sample: "₹12,500" },
  { key: "payment_date", label: "Payment date", sample: "09-10-2026" },
  { key: "exam_name", label: "Exam name", sample: "Half Yearly Exam" },
  { key: "title", label: "Notice title", sample: "Diwali holidays" },
  { key: "ticket_number", label: "Ticket number", sample: "Q-00012" },
  { key: "code", label: "One-time code", sample: "482913" },
  { key: "link", label: "Link", sample: "https://app.schoolos.in/p/…" },
  { key: "message", label: "Message text", sample: "School will close at 12:30 PM today." },
];

export const VARIABLE_KEYS = new Set(VARIABLES.map((v) => v.key));
export const sampleValues = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));

const BLANK = /\{([a-z_]+)\}/g;

/** The blanks used in a text, in the order they first appear (this order is used for WhatsApp's {{1}}, {{2}}...). */
export function variablesIn(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(BLANK)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Blanks that are not on the list, so the person can fix a typing mistake. */
export function unknownVariables(text: string): string[] {
  return variablesIn(text).filter((v) => !VARIABLE_KEYS.has(v));
}

export type Rendered = { ok: true; text: string } | { ok: false; missing: string[] };

/** Fills the blanks. A blank with no value is reported, never sent empty (Template check). */
export function render(text: string, values: Record<string, string | null | undefined>): Rendered {
  const missing = variablesIn(text).filter((k) => values[k] === undefined || values[k] === null || String(values[k]).trim() === "");
  if (missing.length) return { ok: false, missing };
  return { ok: true, text: text.replace(BLANK, (_, k: string) => String(values[k])) };
}

export const variableLabel = (key: string) => VARIABLES.find((v) => v.key === key)?.label.toLowerCase() ?? key.replace(/_/g, " ");

/** "no due amount" — the reason a recipient is skipped. */
export function missingWords(missing: string[]) {
  return `no ${missing.map(variableLabel).join(" or ")}`;
}

/** SMS parts: 160 characters (153 per part when longer), or 70 (67) with Indian scripts. */
export function smsParts(raw: string): number {
  // A Parent Link placeholder is counted as the real link it becomes.
  const text = raw.replace(/⟦parent-link:[^⟧]+⟧/g, `${appUrl()}/p/${"x".repeat(43)}`).replace(/⟦invite:[^⟧]+⟧/g, `${appUrl()}/invite/${"x".repeat(43)}`);
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
};

/** The current version of a template in each language. */
export async function currentVersions(tx: Tx, ctx: SchoolContext, templateId: string): Promise<UsableVersion[]> {
  return tx.templateVersion.findMany({
    where: { schoolId: ctx.schoolId, templateId, isCurrent: true },
    select: { id: true, templateId: true, language: true, body: true, subject: true, variables: true, dltTemplateId: true, whatsappName: true, whatsappStatus: true },
    orderBy: { language: "asc" },
  });
}

/** The version for a language: that language, else the school's main language, else English, else any. */
export function versionFor(versions: UsableVersion[], language: string, schoolLanguage: string): UsableVersion | null {
  return versions.find((v) => v.language === language) ?? versions.find((v) => v.language === schoolLanguage) ?? versions.find((v) => v.language === "en") ?? versions[0] ?? null;
}

/** Why a version cannot be used on its channel, or null when it can. */
export function unusableReason(channel: Channel, v: Pick<UsableVersion, "dltTemplateId" | "whatsappStatus">): string | null {
  if (channel === "sms" && !v.dltTemplateId) return "This SMS template has no DLT template ID. Add it in Message Templates.";
  return null;
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

/**
 * Ready templates every school starts with, so automatic messages work from
 * the first day. SMS ones still need the school's own DLT template IDs.
 */
export const READY_TEMPLATES: ReadyTemplate[] = [
  { key: "absence", name: "Absent today", category: "attendance", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {student_name} ({class}) is absent from school today, {date}. If this is not expected, please call the school on {school_phone}. - {school_name}",
    hi: "प्रिय {guardian_name}, {student_name} ({class}) आज {date} को स्कूल में अनुपस्थित है। कृपया {school_phone} पर स्कूल से संपर्क करें। - {school_name}",
    te: "ప్రియమైన {guardian_name}, {student_name} ({class}) ఈరోజు {date} పాఠశాలకు హాజరు కాలేదు. దయచేసి {school_phone} కు కాల్ చేయండి. - {school_name}",
  } },
  { key: "absence", name: "Absent today (SMS)", category: "attendance", channel: "sms", texts: {
    en: "Dear Parent, {student_name} of {class} is absent today {date}. Please contact the school. - {school_name}",
  } },
  { key: "late", name: "Arrived late", category: "attendance", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {student_name} ({class}) reached school late today, {date}. - {school_name}",
  } },
  { key: "fee-due", name: "Fee reminder", category: "fees", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. You can pay on your Parent Link. Please ignore if already paid. - {school_name}",
    te: "ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. మీ Parent Link లో చెల్లించవచ్చు. - {school_name}",
  } },
  { key: "fee-due", name: "Fee reminder (SMS)", category: "fees", channel: "sms", texts: {
    en: "Dear Parent, fee of {due_amount} for {student_name} is due on {due_date}. Please ignore if paid. - {school_name}",
  } },
  { key: "fee-paid", name: "Fee received", category: "fees", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, we have received {paid_amount} for {student_name} on {payment_date}. Receipt number {receipt_number}. Thank you. - {school_name}",
  } },
  { key: "fee-paid", name: "Fee received (SMS)", category: "fees", channel: "sms", texts: {
    en: "Received {paid_amount} for {student_name} on {payment_date}. Receipt {receipt_number}. Thank you. - {school_name}",
  } },
  { key: "exam-reminder", name: "Exam reminder", category: "exam", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {exam_name} for {student_name} ({class}) starts on {date}. The datesheet is on your Parent Link. - {school_name}",
  } },
  { key: "result", name: "Results published", category: "exam", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, the results of {exam_name} for {student_name} are ready. See the report card on your Parent Link. - {school_name}",
  } },
  { key: "result", name: "Results published (SMS)", category: "exam", channel: "sms", texts: {
    en: "Results of {exam_name} for {student_name} are ready. See your Parent Link. - {school_name}",
  } },
  { key: "ptm", name: "PTM reminder", category: "events", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, the parent-teacher meeting for {class} is on {date}. Please attend. - {school_name}",
  } },
  { key: "bus-pickup", name: "Picked up by the bus", category: "transport", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {message} - {school_name}",
  } },
  { key: "bus-drop", name: "Dropped by the bus", category: "transport", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {message} - {school_name}",
  } },
  { key: "bus-arriving", name: "Bus arriving", category: "transport", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {message} - {school_name}",
  } },
  { key: "homework-set", name: "Homework set", category: "homework", channel: "app", subject: "New homework", texts: {
    en: "New homework for {class}: {message}",
  } },
  // Parents have no app: the "Homework set" rule reaches them on WhatsApp (17 Done when 10).
  { key: "homework-set", name: "Homework set", category: "homework", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, new homework for {class}: {message} - {school_name}",
  } },
  { key: "homework-pending", name: "Homework pending", category: "homework", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {student_name} has not yet submitted homework due on {date}. - {school_name}",
  } },
  { key: "birthday-student", name: "Birthday wishes (student)", category: "general", channel: "whatsapp", texts: {
    en: "Happy birthday, {student_name}! Everyone at {school_name} wishes you a wonderful year ahead.",
    te: "పుట్టినరోజు శుభాకాంక్షలు, {student_name}! {school_name} తరఫున మీకు శుభాకాంక్షలు.",
  } },
  { key: "birthday-staff", name: "Birthday wishes (staff)", category: "staff", channel: "whatsapp", texts: {
    en: "Happy birthday, {staff_name}! Thank you for all you do for {school_name}. Have a lovely day.",
  } },
  { key: "salary-slip", name: "Salary slip ready", category: "staff", channel: "app", subject: "Salary slip ready", texts: {
    en: "Dear {staff_name}, your salary slip is ready. Open it in My profile.",
  } },
  { key: "admission-welcome", name: "Admission welcome", category: "admission", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, welcome to {school_name}! {student_name} is admitted to {class} with admission number {admission_no}.",
  } },
  { key: "parent-link", name: "Parent Link", category: "parent-link", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, this is your personal Parent Link from {school_name}. See fees, attendance and notices for your children: {link} Please do not share it.",
    te: "ప్రియమైన {guardian_name}, ఇది {school_name} నుండి మీ వ్యక్తిగత Parent Link: {link} దయచేసి ఎవరితోనూ పంచుకోవద్దు.",
    hi: "प्रिय {guardian_name}, यह {school_name} से आपका निजी Parent Link है: {link} कृपया इसे किसी के साथ साझा न करें।",
  } },
  { key: "parent-link", name: "Parent Link (SMS)", category: "parent-link", channel: "sms", texts: {
    en: "Dear Parent, your Parent Link from {school_name}: {link} Do not share it.",
  } },
  { key: "parent-link-code", name: "Parent Link code (SMS)", category: "parent-link", channel: "sms", texts: {
    en: "{code} is your one-time code for Parent Link of {school_name}. It works for 10 minutes. Do not share it.",
  } },
  { key: "parent-link-code", name: "Parent Link code", category: "parent-link", channel: "whatsapp", texts: {
    en: "{code} is your one-time code for Parent Link of {school_name}. It works for 10 minutes. Do not share it with anyone.",
  } },
  { key: "consent-request", name: "Consent request", category: "parent-link", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {school_name} asks for your consent: {title}. Please open your Parent Link to read it and agree. - {school_name}",
  } },
  { key: "query-number", name: "Query received", category: "queries", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, we have noted your {message}. Your ticket number is {ticket_number}. We will get back to you soon. - {school_name}",
  } },
  { key: "query-rating", name: "Query rating request", category: "queries", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, your ticket {ticket_number} is closed. How happy are you with our help? Reply with a number from 1 (not happy) to 5 (very happy). - {school_name}",
  } },
  { key: "staff-invite", name: "Staff invite", category: "staff", channel: "whatsapp", texts: {
    en: "Dear {staff_name}, you are invited to School OS at {school_name}. Open this link to choose your password: {link} It works once, for 7 days. Please do not share it.",
  } },
  { key: "staff-invite", name: "Staff invite (SMS)", category: "staff", channel: "sms", texts: {
    en: "Dear {staff_name}, set your School OS password for {school_name}: {link} Works once, for 7 days. Do not share it.",
  } },
  { key: "staff-invite", name: "Staff invite (email)", category: "staff", channel: "email", subject: "Your School OS invite from {school_name}", texts: {
    en: "Dear {staff_name},\n\n{school_name} has invited you to School OS. Open this link to choose your own password:\n\n{link}\n\nThe link works once, for 7 days. Please do not share it with anyone.",
  } },
  { key: "sign-in-code", name: "Sign-in code (SMS)", category: "staff", channel: "sms", texts: {
    en: "{code} is your School OS sign-in code for {school_name}. It works for 10 minutes. Do not share it.",
  } },
  { key: "staff-message", name: "Message to staff", category: "staff", channel: "whatsapp", texts: {
    en: "Dear {staff_name}, {message} - {school_name}",
  } },
  { key: "staff-message", name: "Message to staff (SMS)", category: "staff", channel: "sms", texts: {
    en: "Dear {staff_name}, {message} - {school_name}",
  } },
  { key: "behaviour-note", name: "Behaviour note", category: "general", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, this is to let you know about {student_name} ({class}): {title} on {date}. Please contact the class teacher if you would like to know more. - {school_name}",
  } },
  { key: "behaviour-note", name: "Behaviour note (SMS)", category: "general", channel: "sms", texts: {
    en: "Dear Parent, about {student_name} ({class}): {title} on {date}. Please contact the class teacher. - {school_name}",
  } },
  { key: "notice", name: "New notice", category: "general", channel: "whatsapp", texts: {
    en: "{school_name}: {title}. {message}",
  } },
  { key: "notice", name: "New notice (SMS)", category: "general", channel: "sms", texts: {
    en: "{school_name}: New notice: {title}. Please see your Parent Link.",
  } },
  { key: "general", name: "General announcement", category: "general", channel: "whatsapp", texts: {
    en: "Dear {guardian_name}, {message} - {school_name}",
  } },
  { key: "general", name: "General announcement (SMS)", category: "general", channel: "sms", texts: {
    en: "Dear Parent, {message} - {school_name}",
  } },
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
