// Planning and recording a send: who gets what, on which channel, at what
// cost. Nothing here talks to a provider; the delivery job does (deliver.ts).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { enqueue } from "../jobs";
import { formatDate } from "../format";
import { CHANNEL_LABEL, onChannels, preferredChannel, type Channel } from "./channels";
import { creditBalances, creditProblem, creditsFor, PAID_CHANNELS, spendCredits } from "./credits";
import { describeAudience, resolveAudience, SYSTEM_SCOPE, type AudienceRule, type Candidate, type Scope } from "./recipients";
import { currentVersions, missingWords, render, unusableReason, type UsableVersion } from "./templates";
import { BACKUP_TYPES, type BackupType } from "./settings";

export const MAX_TEXT = 1000;
export const DELIVER_JOB = "messaging:deliver";

export class MessagingProblem extends Error {}

export type SendInput = {
  to: AudienceRule;
  /** One or more channels, or "preferred": WhatsApp if connected, else SMS. */
  channels: Channel[] | "preferred";
  /** A template per channel. Required for SMS (rule 34). */
  templates?: Partial<Record<Channel, string | null>>;
  /** Typed text, for channels with no template. It may use blanks such as {student_name}. */
  text?: string | null;
  /** Title for app notifications and email. */
  title?: string | null;
  /** Blanks for everyone. */
  values?: Record<string, string>;
  /** Blanks for one student's guardians (e.g. due amount). Brothers and sisters then get one message each. */
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
  /** Leave out these candidates (used to stop an automatic rule repeating itself). */
  exclude?: (candidateKey: string) => boolean;
  /** A single named person: a missing blank blocks the send instead of skipping them. */
  single?: boolean;
  resendOfId?: string | null;
};

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
};

export type SkipGroup = { reason: string; count: number; names: string[]; keys?: string[] };

export type Plan = {
  channels: Channel[];
  rows: PlannedRow[];
  people: number;
  skipped: SkipGroup[];
  cost: Partial<Record<Channel, number>>;
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

function addSkip(groups: Map<string, SkipGroup>, reason: string, name: string, key: string) {
  const g = groups.get(reason) ?? { reason, count: 0, names: [], keys: [] };
  g.count++;
  if (g.names.length < 50) g.names.push(name);
  g.keys!.push(key);
  groups.set(reason, g);
}

/** The values every message knows by itself: school, date, the person and their child. */
function baseValues(school: { name: string; phone: string | null; timeZone: string }, c: Candidate, studentIds: string[] | null): Record<string, string> {
  const students = studentIds ? c.students.filter((s) => studentIds.includes(s.id)) : c.students;
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const v: Record<string, string> = {
    school_name: school.name,
    date: formatDate(new Date(), school.timeZone),
  };
  if (school.phone) v.school_phone = school.phone;
  if (c.type === "guardian") v.guardian_name = c.name;
  if (c.type === "staff" || c.type === "login") v.staff_name = c.name;
  if (students.length) {
    v.student_name = join(students.map((s) => s.name));
    v.class = join([...new Set(students.map((s) => s.classLabel))]);
    v.admission_no = join(students.map((s) => s.admissionNo));
  }
  return v;
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

/**
 * Works out exactly who gets what: resolves the audience, applies opt-outs
 * and scope, picks each person's language version, fills the blanks, drops
 * duplicates and counts the credits. Used for the preview and for the send.
 */
export async function planMessage(tx: Tx, ctx: SchoolContext, input: SendInput): Promise<Plan> {
  const problems: string[] = [];
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, phone: true, timeZone: true, defaultLanguage: true, smsDltEntityId: true, smsSenderHeader: true } });
  const on = await onChannels(tx, ctx);
  const channels: Channel[] = input.channels === "preferred" ? [await preferredChannel(tx, ctx)] : [...new Set(input.channels)];
  if (channels.length === 0) problems.push("Choose at least one channel.");
  for (const ch of channels) {
    if (!on.has(ch)) problems.push(`${CHANNEL_LABEL[ch]} is switched off. Switch it on in Settings, SMS, WhatsApp & Email, or choose another channel.`);
  }
  if (channels.includes("sms") && (!school.smsDltEntityId || !school.smsSenderHeader)) {
    problems.push("Add your DLT entity ID and sender header in Settings, SMS, WhatsApp & Email before sending SMS.");
  }

  // Templates: one per channel; SMS only from a template with a DLT template ID (rule 34).
  const versionsByChannel = new Map<Channel, UsableVersion[]>();
  for (const ch of channels) {
    const templateId = input.templates?.[ch] ?? null;
    if (!templateId) {
      if (ch === "sms") problems.push("An SMS can only be sent from a template with a DLT template ID. Choose an SMS template, or send by WhatsApp.");
      continue;
    }
    const t = await tx.template.findFirst({ where: { id: templateId, schoolId: ctx.schoolId, archivedAt: null } });
    if (!t || t.channel !== ch) {
      problems.push(`The ${CHANNEL_LABEL[ch]} template was not found. Choose it again.`);
      continue;
    }
    let versions = await currentVersions(tx, ctx, t.id);
    if (ch === "sms") {
      versions = versions.filter((v) => !unusableReason("sms", v));
      if (versions.length === 0) problems.push(`"${t.name}" has no DLT template ID. Add it in Message Templates.`);
    }
    versionsByChannel.set(ch, versions);
  }
  const typed = (input.text ?? "").trim();
  if (typed.length > MAX_TEXT) problems.push(`The message has ${typed.length} characters. It can have at most ${MAX_TEXT}.`);
  for (const ch of channels) {
    if (!versionsByChannel.has(ch) && ch !== "sms" && !typed) problems.push(`Type the message, or choose a ${CHANNEL_LABEL[ch]} template.`);
  }
  if (channels.some((c) => c === "app" || c === "email") && !versionsByChannel.size && !(input.title ?? "").trim()) {
    problems.push("Give the message a title. App notifications and emails show it first.");
  }

  // SMS backup (fee, attendance and result messages only).
  let backupVersions: UsableVersion[] = [];
  let backupTemplateId: string | null = null;
  const backupWanted = Boolean(input.smsBackup && input.messageType && (BACKUP_TYPES as readonly string[]).includes(input.messageType) && channels.some((c) => c !== "sms"));
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
      else problems.push("SMS backup needs an SMS template with a DLT template ID for this message. Choose one, or untick SMS backup.");
    }
    if (!on.has("sms") && backupVersions.length) {
      if (input.ruleKey) backupTemplateId = null;
      else problems.push("SMS backup needs SMS to be switched on in Settings, SMS, WhatsApp & Email.");
    }
  }

  const scope = input.scope ?? SYSTEM_SCOPE;
  const candidates = await resolveAudience(tx, ctx, input.to, scope);
  const skipped = new Map<string, SkipGroup>();
  const rows: PlannedRow[] = [];
  const seenAddress = new Map<string, string>();
  const people = new Set<string>();

  for (const c of candidates) {
    if (input.exclude?.(c.key)) continue;
    if (!c.inScope) { addSkip(skipped, "Outside your classes", c.name, c.key); continue; }
    if (c.optedOut && !input.emergency) { addSkip(skipped, "Opted out of messages", c.name, c.key); continue; }
    // One message per student when each student has their own values (fee due, absent today).
    const split = c.type === "guardian" && input.perStudent ? c.students.filter((s) => input.perStudent![s.id]) : null;
    const units: (string | null)[] = split ? (split.length ? split.map((s) => s.id) : [null]) : [null];
    let personAdded = false;
    let personSkip: string | null = null;
    for (const studentId of units) {
      const values: Record<string, string> = {
        ...baseValues(school, c, studentId ? [studentId] : null),
        ...(input.values ?? {}),
        ...(studentId ? input.perStudent![studentId] : c.students.length === 1 && input.perStudent?.[c.students[0].id] ? input.perStudent[c.students[0].id] : {}),
        ...(input.perPerson?.[c.id] ?? {}),
      };
      for (const ch of channels) {
        const addr = addressFor(c, ch, on.has("whatsapp") || on.has("sms") || on.has("email"));
        if ("skip" in addr) { personSkip ??= addr.skip; continue; }
        const versions = versionsByChannel.get(ch);
        let version: UsableVersion | null = null;
        let body = typed;
        let title = (input.title ?? "").trim() || null;
        if (versions) {
          version = versions.find((v) => v.language === c.language) ?? versions.find((v) => v.language === school.defaultLanguage) ?? versions.find((v) => v.language === "en") ?? versions[0] ?? null;
          if (!version) continue;
          body = version.body;
          title = version.subject ?? title;
        } else if (ch === "sms") continue;
        if (!body) continue;
        const r = render(body, { ...values, message: values.message ?? typed });
        if (!r.ok) {
          if (input.single) throw new MessagingProblem(`${c.name} has ${missingWords(r.missing)}, so the message cannot be sent. Fix the record, or remove that blank.`);
          personSkip = `Has ${missingWords(r.missing)}`;
          continue;
        }
        const t = title ? render(title, values) : null;
        const dupKey = `${ch}:${addr.address.toLowerCase()}:${r.text}`;
        if (seenAddress.has(dupKey)) { personSkip ??= `Same ${ch === "email" ? "email" : ch === "app" ? "login" : "number"} as ${seenAddress.get(dupKey)}`; continue; }
        seenAddress.set(dupKey, c.name);
        rows.push({
          candidate: c,
          rowKey: studentId ? `${c.key}:${studentId}` : c.key,
          studentId: studentId ?? (c.students.length === 1 ? c.students[0].id : c.type === "student" ? c.id : null),
          channel: ch,
          address: addr.address,
          language: version?.language ?? c.language,
          version,
          title: t && t.ok ? t.text : title,
          text: r.text,
          values: { ...values, message: values.message ?? typed },
          credits: creditsFor(ch, r.text),
        });
        personAdded = true;
      }
    }
    if (personAdded) people.add(c.key);
    else addSkip(skipped, personSkip ?? "Nothing to send to this person", c.name, c.key);
  }

  const cost: Partial<Record<Channel, number>> = {};
  for (const r of rows) if (PAID_CHANNELS.has(r.channel)) cost[r.channel] = (cost[r.channel] ?? 0) + r.credits;

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
  const needs = { ...cost, sms: (cost.sms ?? 0) + backupCost };
  return {
    channels,
    rows,
    people: people.size,
    skipped: [...skipped.values()].sort((a, b) => b.count - a.count),
    cost,
    backupCost,
    balances,
    creditProblem: creditProblem(needs, balances),
    problems,
    audienceLabel: input.audienceLabel ?? (await describeAudience(tx, ctx, input.to)),
    backupTemplateId: backupVersions.length ? backupTemplateId : null,
  };
}

export type SendResult = { messageId: string; queued: number; people: number; skipped: SkipGroup[]; cost: Partial<Record<Channel, number>>; scheduled: boolean; repeated: boolean };

/**
 * Records one Message with a Message Recipient for each person and channel,
 * takes the credits, and queues delivery as a background job. Must be called
 * inside the caller's transaction (withSchool), so the message is saved
 * together with whatever caused it.
 */
export async function recordSend(tx: Tx, ctx: SchoolContext, input: SendInput, plan: Plan): Promise<SendResult> {
  if (input.idempotencyKey) {
    const existing = await tx.message.findUnique({ where: { schoolId_idempotencyKey: { schoolId: ctx.schoolId, idempotencyKey: input.idempotencyKey } }, include: { _count: { select: { recipients: true } } } });
    if (existing) return { messageId: existing.id, queued: existing._count.recipients, people: existing.recipientCount, skipped: existing.skipped as SkipGroup[], cost: {}, scheduled: existing.status === "SCHEDULED", repeated: true };
  }
  if (plan.problems.length) throw new MessagingProblem(plan.problems[0]);
  if (plan.rows.length === 0) {
    // "Parents have no app … (1).": the reason keeps its own words and capitals (WhatsApp, SMS);
    // a count in front read "1 parents have no app".
    const why = plan.skipped[0] ? ` ${plan.skipped.map((s) => `${s.reason} (${s.count})`).join(". ")}.` : "";
    throw new MessagingProblem(`Nobody would get this message.${why}`);
  }
  const short = plan.creditProblem;
  if (short && (input.onNoCredits ?? "block") === "block") throw new MessagingProblem(short);
  const failForCredits = Boolean(short);

  const now = new Date();
  const scheduled = Boolean(input.scheduledAt && input.scheduledAt.getTime() > now.getTime() + 30_000);
  const first = plan.rows[0];
  const message = await tx.message.create({
    data: {
      schoolId: ctx.schoolId,
      title: (input.title ?? "").trim() || first.title || null,
      body: (input.text ?? "").trim() || first.version?.body || first.text,
      channels: plan.channels,
      templateId: Object.values(input.templates ?? {}).find(Boolean) ?? null,
      audienceLabel: plan.audienceLabel.slice(0, 300),
      audience: input.to as Prisma.InputJsonValue,
      recipientCount: plan.people,
      skipped: plan.skipped.map(({ reason, count, names }) => ({ reason, count, names })) as unknown as Prisma.InputJsonValue,
      creditCost: Object.values(plan.cost).reduce((a, b) => a + (b ?? 0), 0),
      status: scheduled ? "SCHEDULED" : "QUEUED",
      isEmergency: Boolean(input.emergency),
      messageType: input.messageType ?? "general",
      smsBackup: Boolean(plan.backupTemplateId),
      backupTemplateId: plan.backupTemplateId,
      sentById: input.ruleKey ? null : ctx.userId,
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
  await tx.messageRecipient.createMany({
    data: plan.rows.map((r) => {
      const noCredits = failForCredits && PAID_CHANNELS.has(r.channel);
      return {
        schoolId: ctx.schoolId,
        messageId: message.id,
        recipientType: r.candidate.type,
        guardianId: r.candidate.type === "guardian" ? r.candidate.id : null,
        studentId: r.studentId,
        staffId: r.candidate.type === "staff" ? r.candidate.id : null,
        userLoginId: r.candidate.userLoginId,
        name: r.candidate.name,
        description: r.candidate.description || null,
        channel: r.channel,
        address: r.address,
        language: r.language,
        templateVersionId: r.version?.id ?? null,
        values: r.values,
        text: r.text,
        status: noCredits ? "FAILED" : "QUEUED",
        failReason: noCredits ? "Not enough credits when it was sent. Top up and retry." : null,
        failedAt: noCredits ? now : null,
        credits: noCredits ? 0 : r.credits,
        history: [{ at, status: noCredits ? "FAILED" : "QUEUED", note: noCredits ? "Not enough credits" : scheduled ? "Scheduled" : null }],
      };
    }),
  });
  if (!failForCredits) {
    for (const [ch, n] of Object.entries(plan.cost)) {
      await spendCredits(tx, ctx, ch as Channel, n ?? 0, `${message.title ?? message.audienceLabel}: ${plan.rows.filter((r) => r.channel === ch).length} ${CHANNEL_LABEL[ch as Channel]}`, message.id);
    }
  }
  await enqueue(tx, ctx, DELIVER_JOB, `deliver:${message.id}:0:0`, { messageId: message.id, round: "0", chunk: 0 }, scheduled ? input.scheduledAt! : now);
  await writeAudit(tx, ctx, {
    action: scheduled ? "scheduled-message" : input.emergency ? "sent-emergency-broadcast" : "sent-message",
    recordType: "Message",
    recordId: message.id,
    actorNote: input.ruleKey ? `Automatic rule: ${input.ruleKey}` : null,
    after: { to: plan.audienceLabel, people: plan.people, channels: plan.channels, credits: message.creditCost, scheduledAt: scheduled ? input.scheduledAt!.toISOString() : null },
  });
  return { messageId: message.id, queued: plan.rows.length, people: plan.people, skipped: plan.skipped, cost: plan.cost, scheduled, repeated: false };
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

/** Words for skipped people: "12 opted out of messages, 3 have no due amount". */
export function skippedWords(groups: SkipGroup[]) {
  return groups.map((g) => `${g.count} ${g.reason.charAt(0).toLowerCase()}${g.reason.slice(1)}`).join("; ");
}
