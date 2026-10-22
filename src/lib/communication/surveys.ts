// Surveys (11-communication.md; an optional page switched on per school): short questions for
// parents or staff. Each person gets their own link by message and answers once. The secret in
// the link is never stored: it is worked out from the invite's id with the server key, and only
// its hash is kept, like the Parent Link. Anonymous surveys keep no link from an answer to a person.
import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatNumber, nextNumber } from "../sequences";
import { channelSetups, type Channel } from "../messaging/channels";
import { MessagingProblem, sendMessage } from "../messaging/send";
import { resolveAudience, SYSTEM_SCOPE, type AudienceRule } from "../messaging/recipients";
import { hashToken, surveyPlaceholderFor, surveyTokenFor } from "../parent-link/token";
import { formatDate } from "../format";
import type { ListParams } from "../list";
import { inPeriod, PERIOD_FILTERS } from "./period";

export class SurveyProblem extends Error {}

export const SURVEY_FILTERS = ["status", ...PERIOD_FILTERS] as const;
export const QUESTION_KINDS = [
  { key: "rating", label: "Rating 1–5" },
  { key: "choice", label: "Choice" },
  { key: "text", label: "Text" },
  { key: "date", label: "Date" },
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number]["key"];
export const MAX_QUESTIONS = 20;
export const MAX_OPTIONS = 8;

export type QuestionInput = { kind: QuestionKind; text: string; options: string[]; required: boolean };
export type SurveyInput = { title: string; audience: string; anonymous: boolean; closesOn: string | null; questions: QuestionInput[] };

/** Ready examples to start from (the design's "Start from an example"). */
export const SURVEY_EXAMPLES: { key: string; title: string; sub: string; audience: string; anonymous: boolean; questions: QuestionInput[] }[] = [
  {
    key: "parents", title: "Parent satisfaction", sub: "5 questions · ratings and one comment", audience: "parents", anonymous: true,
    questions: [
      { kind: "rating", text: "How happy are you with your child’s progress this term?", options: [], required: true },
      { kind: "rating", text: "How easy is it to reach the school when you need to?", options: [], required: true },
      { kind: "choice", text: "How do you mostly hear from the school?", options: ["WhatsApp", "Parent Link", "Phone call", "Visit"], required: true },
      { kind: "rating", text: "How safe do you feel your child is at school?", options: [], required: true },
      { kind: "text", text: "One thing we should do better", options: [], required: false },
    ],
  },
  {
    key: "staff", title: "Staff feedback", sub: "3 questions · anonymous", audience: "staff", anonymous: true,
    questions: [
      { kind: "rating", text: "How supported do you feel by the school leadership?", options: [], required: true },
      { kind: "rating", text: "Is your teaching load fair?", options: [], required: true },
      { kind: "text", text: "What would make your work easier?", options: [], required: false },
    ],
  },
  {
    key: "event", title: "Event feedback", sub: "3 questions · after an event", audience: "parents", anonymous: false,
    questions: [
      { kind: "rating", text: "How did you like the event?", options: [], required: true },
      { kind: "choice", text: "Which part did your child enjoy most?", options: ["Performances", "Games", "Food stalls", "Exhibition"], required: false },
      { kind: "text", text: "Any suggestions for next time?", options: [], required: false },
    ],
  },
];

// ── Audience ─────────────────────────────────────────────────────────────

/** A group for one campus ends in "@<campus id>" (chosen by a person limited to one campus). */
const ONE_CAMPUS = /@([0-9a-f-]{36})$/;
const splitCampus = (value: string) => {
  const m = ONE_CAMPUS.exec(value);
  return { base: m ? value.slice(0, -m[0].length) : value, campusId: m ? m[1] : null };
};

/** "parents", "class:<id>" or "staff", each maybe "@<campus id>" → who gets the survey. */
export function audienceRule(value: string): AudienceRule | null {
  const { base, campusId } = splitCampus(value);
  const campus = campusId ? { campusIds: [campusId] } : {};
  if (base === "parents") return { kinds: ["parents"], ...campus };
  if (base === "staff") return { kinds: ["staff"], ...campus };
  const m = /^class:([0-9a-f-]{36})$/.exec(base);
  return m ? { kinds: ["parents"], classIds: [m[1]], ...campus } : null;
}

/** The campus a survey is for: its "@campus", else its class's campus; null for the whole school. */
export async function surveyCampus(tx: Tx, value: string): Promise<string | null> {
  const { base, campusId } = splitCampus(value);
  if (campusId) return campusId;
  const m = /^class:([0-9a-f-]{36})$/.exec(base);
  return m ? (await tx.schoolClass.findFirst({ where: { id: m[1] }, select: { campusId: true } }))?.campusId ?? null : null;
}

/**
 * May a person limited to one campus see and work on this survey? Only a
 * survey for their campus: one for the whole school reaches, and shows the
 * answers of, other campuses' parents and staff. Always true for the whole school.
 */
export async function surveyOnCampus(tx: Tx, survey: { audienceValue: string }, campusId: string | null | undefined) {
  return !campusId || (await surveyCampus(tx, survey.audienceValue)) === campusId;
}

/** The group a person limited to one campus chose, kept to their campus; another campus's group is refused. */
export async function campusAudience(tx: Tx, value: string, campusId: string | null | undefined): Promise<string> {
  if (!campusId) return value;
  const { base, campusId: chosen } = splitCampus(value);
  if (chosen && chosen !== campusId) throw new SurveyProblem("Choose who gets the survey.");
  if (base.startsWith("class:") && (await surveyCampus(tx, base)) !== campusId) throw new SurveyProblem("Choose who gets the survey.");
  return `${base}@${campusId}`;
}

/** The groups to choose from: only the person's campus's when they are limited to one. */
export async function audienceOptions(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  const classes = await tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, ...(campusId ? { campusId } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const campus = campusId ? (await tx.campus.findFirst({ where: { id: campusId, schoolId: ctx.schoolId }, select: { name: true } }))?.name ?? "your campus" : null;
  const at = campusId ? `@${campusId}` : "";
  return [
    { value: `parents${at}`, label: campus ? `All parents of ${campus}` : "All parents" },
    ...classes.map((c) => ({ value: `class:${c.id}${at}`, label: `Parents of ${c.name}` })),
    { value: `staff${at}`, label: campus ? `All staff of ${campus}` : "All staff" },
  ];
}

async function invitees(tx: Tx, ctx: SchoolContext, value: string) {
  const rule = audienceRule(value);
  if (!rule) throw new SurveyProblem("Choose who gets the survey.");
  const people = await resolveAudience(tx, ctx, rule, SYSTEM_SCOPE);
  return people.filter((c) => (c.type === "guardian" || c.type === "staff") && !c.optedOut);
}

export async function audienceCount(tx: Tx, ctx: SchoolContext, value: string) {
  return (await invitees(tx, ctx, value)).length;
}

// ── Saving ───────────────────────────────────────────────────────────────

function clean(input: SurveyInput, today: Date) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3) throw new SurveyProblem("Give the survey a title.");
  if (title.length > 120) throw new SurveyProblem("Keep the title under 120 characters.");
  if (!audienceRule(input.audience)) throw new SurveyProblem("Choose who gets the survey.");
  const qs = input.questions.map((q) => ({ ...q, text: q.text.trim(), options: q.options.map((o) => o.trim()).filter(Boolean).slice(0, MAX_OPTIONS) }));
  if (!qs.length) throw new SurveyProblem("Add at least one question.");
  if (qs.length > MAX_QUESTIONS) throw new SurveyProblem(`A survey can have at most ${MAX_QUESTIONS} questions.`);
  qs.forEach((q, i) => {
    if (!QUESTION_KINDS.some((k) => k.key === q.kind)) throw new SurveyProblem(`Question ${i + 1}: choose its type.`);
    if (q.text.length < 3) throw new SurveyProblem(`Question ${i + 1}: write the question.`);
    if (q.text.length > 300) throw new SurveyProblem(`Question ${i + 1}: keep it under 300 characters.`);
    if (q.kind === "choice" && q.options.length < 2) throw new SurveyProblem(`Question ${i + 1}: give at least two choices.`);
  });
  let closesOn: Date | null = null;
  if (input.closesOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.closesOn)) throw new SurveyProblem("Pick the closing date.");
    closesOn = new Date(`${input.closesOn}T00:00:00Z`);
    if (closesOn < today) throw new SurveyProblem("The closing date cannot be in the past.");
  }
  return { title, closesOn, questions: qs };
}

/** Saves a new draft, or changes a draft. Sent surveys cannot be changed (answers would no longer match). */
export async function saveSurvey(tx: Tx, ctx: SchoolContext, id: string | null, input: SurveyInput, labels: Map<string, string>, today: Date) {
  const c = clean(input, today);
  const audienceLabel = labels.get(input.audience) ?? "Selected people";
  const data = { title: c.title, audienceKind: splitCampus(input.audience).base === "staff" ? "staff" : "parents", audienceValue: input.audience, audienceLabel, anonymous: input.anonymous, closesOn: c.closesOn };
  let survey;
  if (id) {
    const old = await tx.survey.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null } });
    if (!old) throw new SurveyProblem("This survey was not found.");
    if (old.status !== "DRAFT") throw new SurveyProblem("A sent survey cannot be changed. Make a new one instead.");
    survey = await tx.survey.update({ where: { id }, data });
    // Draft questions are replaced: they have no answers yet. Old ones move out of the survey by sort order.
    await tx.surveyQuestion.updateMany({ where: { surveyId: id, schoolId: ctx.schoolId, sortOrder: { gte: 0 } }, data: { sortOrder: { decrement: 1000 } } });
    await writeAudit(tx, ctx, { action: "edited", recordType: "Survey", recordId: id, before: { title: old.title }, after: { title: c.title, questions: c.questions.length } });
  } else {
    const number = formatNumber("SV-", await nextNumber(tx, ctx, "survey"), 3);
    survey = await tx.survey.create({ data: { ...data, schoolId: ctx.schoolId, number, createdById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "created", recordType: "Survey", recordId: survey.id, after: { number, title: c.title, questions: c.questions.length } });
  }
  await tx.surveyQuestion.createMany({ data: c.questions.map((q, i) => ({ schoolId: ctx.schoolId, surveyId: survey.id, sortOrder: i + 1, kind: q.kind, text: q.text, options: q.kind === "choice" ? q.options : [], required: q.required })) });
  return survey;
}

/** The survey's current questions (drafts keep replaced ones below zero). */
export const questionsWhere = (ctx: SchoolContext, surveyId: string) => ({ schoolId: ctx.schoolId, surveyId, sortOrder: { gt: 0 } });

async function channelsFor(tx: Tx, ctx: SchoolContext): Promise<Channel[]> {
  const setups = await channelSetups(tx, ctx);
  const ch: Channel[] = [];
  if (setups.whatsapp.isOn) ch.push("whatsapp");
  if (setups.email.isOn) ch.push("email");
  // Not the in-app channel: its notification would show the link's stand-in, not the link.
  if (!ch.length) throw new SurveyProblem("Switch on WhatsApp or email in Settings, SMS, WhatsApp & Email to send survey links.");
  return ch;
}

function linkText(title: string, closes: Date | null, tz: string, reminder: boolean) {
  const by = closes ? ` by ${formatDate(closes, tz)}` : "";
  return reminder
    ? `A reminder from {school_name}: please answer "${title}"${by}. It takes two minutes: {link}`
    : `{school_name} would like your view. Please answer "${title}"${by}. It takes two minutes: {link}`;
}

async function sendTo(tx: Tx, ctx: SchoolContext, survey: { id: string; title: string; closesOn: Date | null; audienceKind: string; audienceLabel: string }, invites: { id: string; personType: string; personId: string }[], tz: string, reminder: boolean) {
  const channels = await channelsFor(tx, ctx);
  const guardians = invites.filter((i) => i.personType === "guardian").map((i) => i.personId);
  const staff = invites.filter((i) => i.personType === "staff").map((i) => i.personId);
  try {
    return await sendMessage(tx, ctx, {
      to: { guardianIds: guardians, staffIds: staff },
      channels,
      text: linkText(survey.title, survey.closesOn, tz, reminder),
      title: survey.title,
      perPerson: Object.fromEntries(invites.map((i) => [i.personId, { link: surveyPlaceholderFor(ctx.schoolId, i.id) }])),
      trigger: reminder ? "Survey reminder" : "Survey sent",
      source: { type: "Survey", id: survey.id },
      audienceLabel: reminder ? `${survey.audienceLabel}, not answered` : survey.audienceLabel,
    });
  } catch (e) {
    if (e instanceof MessagingProblem) throw new SurveyProblem(e.message);
    throw e;
  }
}

/**
 * One survey a person may work on, or refused as not found (campusId: a person
 * limited to one campus works on their campus's surveys only).
 */
export async function loadSurvey(tx: Tx, ctx: SchoolContext, id: string, campusId?: string | null) {
  const survey = await tx.survey.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null } });
  if (!survey || !(await surveyOnCampus(tx, survey, campusId))) return null;
  return survey;
}

/** Sends a draft: one invite per person, with their own link. */
export async function sendSurvey(tx: Tx, ctx: SchoolContext, id: string, tz: string, now = new Date(), campusId?: string | null) {
  const survey = await loadSurvey(tx, ctx, id, campusId);
  if (!survey) throw new SurveyProblem("This survey was not found.");
  if (survey.status !== "DRAFT") throw new SurveyProblem("This survey was already sent.");
  if (!(await tx.surveyQuestion.count({ where: questionsWhere(ctx, id) }))) throw new SurveyProblem("Add at least one question.");
  const closesOn = survey.closesOn ?? new Date(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now)}T00:00:00Z`).getTime() + 7 * 86400_000);
  const people = await invitees(tx, ctx, survey.audienceValue);
  if (!people.length) throw new SurveyProblem("Nobody in this group can get a message. Check their phone numbers, or choose another group.");
  const invites = [];
  for (const p of people) {
    const inviteId = crypto.randomUUID();
    invites.push(await tx.surveyInvite.create({ data: { id: inviteId, schoolId: ctx.schoolId, surveyId: id, tokenHash: hashToken(surveyTokenFor(inviteId)), personType: p.type, personId: p.id } }));
  }
  const updated = await tx.survey.update({ where: { id }, data: { status: "OPEN", sentAt: now, closesOn, invitedCount: invites.length } });
  const result = await sendTo(tx, ctx, updated, invites, tz, false);
  await tx.survey.update({ where: { id }, data: { messageId: result.messageId } });
  await writeAudit(tx, ctx, { action: "sent", recordType: "Survey", recordId: id, after: { invited: invites.length, message: result.messageId } });
  return { invited: invites.length, people: result.people };
}

/** Is the survey taking answers now? */
export function isOpen(s: { status: string; closesOn: Date | null }, tz: string, now = new Date()) {
  if (s.status !== "OPEN") return false;
  if (!s.closesOn) return true;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return s.closesOn.toISOString().slice(0, 10) >= today;
}
/** OPEN surveys past their closing date show as closed. */
export const shownStatus = (s: { status: string; closesOn: Date | null }, tz: string, now = new Date()) => (s.status === "OPEN" && !isOpen(s, tz, now) ? "CLOSED" : s.status);

export async function remindSurvey(tx: Tx, ctx: SchoolContext, id: string, tz: string, campusId?: string | null) {
  const survey = await loadSurvey(tx, ctx, id, campusId);
  if (!survey || !isOpen(survey, tz)) throw new SurveyProblem("Only an open survey can be reminded.");
  const waiting = await tx.surveyInvite.findMany({ where: { schoolId: ctx.schoolId, surveyId: id, answeredAt: null } });
  if (!waiting.length) throw new SurveyProblem("Everyone has answered.");
  await sendTo(tx, ctx, survey, waiting, tz, true);
  await writeAudit(tx, ctx, { action: "reminded", recordType: "Survey", recordId: id, after: { people: waiting.length } });
  return waiting.length;
}

export async function closeSurvey(tx: Tx, ctx: SchoolContext, id: string, campusId?: string | null) {
  const survey = await loadSurvey(tx, ctx, id, campusId);
  if (!survey) throw new SurveyProblem("This survey was not found.");
  if (survey.status !== "OPEN") throw new SurveyProblem(survey.status === "DRAFT" ? "A draft has not been sent." : "This survey is already closed.");
  await tx.survey.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Survey", recordId: id });
}

/** Drafts can be archived (removed from the list); sent surveys keep their answers. */
export async function archiveSurvey(tx: Tx, ctx: SchoolContext, id: string, campusId?: string | null) {
  const survey = await loadSurvey(tx, ctx, id, campusId);
  if (!survey) throw new SurveyProblem("This survey was not found.");
  if (survey.status === "OPEN" && (!survey.closesOn || survey.closesOn.getTime() >= Date.now() - 86400_000)) throw new SurveyProblem("Close the survey first.");
  await tx.survey.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Survey", recordId: id });
}

// ── The list ─────────────────────────────────────────────────────────────

/** For a person limited to one campus: their campus's surveys only (see surveyOnCampus). {} for the whole school. */
export async function surveyCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string | null | undefined): Promise<Prisma.SurveyWhereInput> {
  if (!campusId) return {};
  const rows = await tx.survey.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, audienceValue: true } });
  const ok: string[] = [];
  for (const r of rows) if (await surveyOnCampus(tx, r, campusId)) ok.push(r.id);
  return { id: { in: ok } };
}

export function surveyWhere(ctx: SchoolContext, p: ListParams, tz: string): Prisma.SurveyWhereInput {
  const and: Prisma.SurveyWhereInput[] = [{ schoolId: ctx.schoolId, archivedAt: null }];
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { number: { contains: p.q, mode: "insensitive" } }, { audienceLabel: { contains: p.q, mode: "insensitive" } }] });
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())}T00:00:00Z`);
  if (p.filters.status === "DRAFT") and.push({ status: "DRAFT" });
  else if (p.filters.status === "OPEN") and.push({ status: "OPEN", OR: [{ closesOn: null }, { closesOn: { gte: today } }] });
  else if (p.filters.status === "CLOSED") and.push({ OR: [{ status: "CLOSED" }, { status: "OPEN", closesOn: { lt: today } }] });
  // Drafts always show; sent surveys by the date they were sent (the design: "drafts always show").
  const when = inPeriod(p.filters, tz);
  if (when) and.push({ OR: [{ status: "DRAFT" }, { sentAt: when }] });
  return { AND: and };
}

// ── The person's side (no login) ─────────────────────────────────────────

export type InviteFound = { invite: { id: string; surveyId: string; personType: string; personId: string; answeredAt: Date | null } };

/** Finds an invite from its token, inside the school's walls. */
export async function findInvite(tx: Tx, ctx: SchoolContext, token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const invite = await tx.surveyInvite.findFirst({ where: { schoolId: ctx.schoolId, tokenHash: hashToken(token) } });
  if (!invite) return null;
  const expected = Buffer.from(surveyTokenFor(invite.id));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return invite;
}

export type Answers = Record<string, string>;

/** Checks and records one person's answers, once. */
export async function submitAnswers(tx: Tx, ctx: SchoolContext, token: string, raw: Answers, tz: string, now = new Date()) {
  const invite = await findInvite(tx, ctx, token);
  if (!invite) throw new SurveyProblem("This link does not work.");
  const survey = await tx.survey.findFirst({ where: { id: invite.surveyId, schoolId: ctx.schoolId, archivedAt: null } });
  if (!survey || !isOpen(survey, tz, now)) throw new SurveyProblem("This survey is closed.");
  if (invite.answeredAt) throw new SurveyProblem("You have already answered. Thank you.");
  const questions = await tx.surveyQuestion.findMany({ where: questionsWhere(ctx, survey.id), orderBy: { sortOrder: "asc" } });
  const answers: Answers = {};
  for (const q of questions) {
    const v = String(raw[q.id] ?? "").trim();
    if (!v) {
      if (q.required) throw new SurveyProblem(`Please answer: ${q.text}`);
      continue;
    }
    if (q.kind === "rating" && !/^[1-5]$/.test(v)) throw new SurveyProblem(`Choose 1 to 5 for: ${q.text}`);
    if (q.kind === "choice" && !q.options.includes(v)) throw new SurveyProblem(`Choose one of the answers for: ${q.text}`);
    if (q.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new SurveyProblem(`Pick a date for: ${q.text}`);
    answers[q.id] = v.slice(0, 1000);
  }
  // Only one answer per invite, even if two taps arrive together.
  const marked = await tx.surveyInvite.updateMany({ where: { id: invite.id, answeredAt: null }, data: { answeredAt: now } });
  if (!marked.count) throw new SurveyProblem("You have already answered. Thank you.");
  // Anonymous: no person, and only the day it came in, so it cannot be matched to the invite by time.
  const day = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now)}T00:00:00Z`);
  await tx.surveyResponse.create({
    data: survey.anonymous
      ? { schoolId: ctx.schoolId, surveyId: survey.id, answers, submittedAt: day }
      : { schoolId: ctx.schoolId, surveyId: survey.id, answers, personType: invite.personType, personId: invite.personId, submittedAt: now },
  });
  await writeAudit(tx, ctx, { action: "answered", recordType: "Survey", recordId: survey.id, after: survey.anonymous ? { anonymous: true } : { person: invite.personId } });
}

// ── Results ──────────────────────────────────────────────────────────────

export type QuestionResult =
  | { id: string; n: number; kind: "rating"; text: string; answered: number; average: number | null; counts: number[] }
  | { id: string; n: number; kind: "choice"; text: string; answered: number; counts: { option: string; count: number }[] }
  | { id: string; n: number; kind: "text" | "date"; text: string; answered: number; answers: { text: string; at: Date; who: string | null }[] };

export async function surveyResults(tx: Tx, ctx: SchoolContext, surveyId: string) {
  const [questions, responses] = await Promise.all([
    tx.surveyQuestion.findMany({ where: questionsWhere(ctx, surveyId), orderBy: { sortOrder: "asc" } }),
    tx.surveyResponse.findMany({ where: { schoolId: ctx.schoolId, surveyId }, orderBy: { submittedAt: "desc" }, take: 20000 }),
  ]);
  const guardianIds = responses.filter((r) => r.personType === "guardian" && r.personId).map((r) => r.personId!);
  const staffIds = responses.filter((r) => r.personType === "staff" && r.personId).map((r) => r.personId!);
  const [gs, ss] = await Promise.all([
    guardianIds.length ? tx.guardian.findMany({ where: { id: { in: guardianIds }, schoolId: ctx.schoolId }, select: { id: true, name: true } }) : [],
    staffIds.length ? tx.staff.findMany({ where: { id: { in: staffIds }, schoolId: ctx.schoolId }, select: { id: true, fullName: true } }) : [],
  ]);
  const names = new Map<string, string>([...gs.map((g) => [g.id, g.name] as const), ...ss.map((s) => [s.id, s.fullName] as const)]);
  const get = (r: (typeof responses)[number], q: string) => String((r.answers as Answers)[q] ?? "");
  const results: QuestionResult[] = questions.map((q, i) => {
    const given = responses.filter((r) => get(r, q.id));
    if (q.kind === "rating") {
      const counts = [1, 2, 3, 4, 5].map((k) => given.filter((r) => get(r, q.id) === String(k)).length);
      const total = counts.reduce((a, c, k) => a + c * (k + 1), 0);
      return { id: q.id, n: i + 1, kind: "rating", text: q.text, answered: given.length, average: given.length ? total / given.length : null, counts };
    }
    if (q.kind === "choice") return { id: q.id, n: i + 1, kind: "choice", text: q.text, answered: given.length, counts: q.options.map((o) => ({ option: o, count: given.filter((r) => get(r, q.id) === o).length })) };
    return { id: q.id, n: i + 1, kind: q.kind as "text" | "date", text: q.text, answered: given.length, answers: given.slice(0, 200).map((r) => ({ text: get(r, q.id), at: r.submittedAt, who: r.personId ? names.get(r.personId) ?? null : null })) };
  });
  return { questions, responses, results, names };
}
