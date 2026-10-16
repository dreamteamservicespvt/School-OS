// Automatic message rules (11-communication.md §6): WHEN something happens
// THEN send a message. Each rule can be switched off, never sends the same
// event to the same person twice, and writes the automation log.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { channelSetups, onChannels, type Channel } from "./channels";
import { planMessage, recordSend, type SendInput, type SendResult } from "./send";
import { messageSettings, type BackupType } from "./settings";
import { ensureReadyTemplates, templateByKey } from "./templates";
import type { AudienceRule } from "./recipients";

export type RuleDef = {
  key: string;
  label: string;
  /** When it happens, in school words. */
  when: string;
  /** The module that tells Communication the event happened. */
  module: string;
  audience: "parents" | "staff";
  messageType: "general" | BackupType;
  defaultChannels: Channel[];
  defaultOn: boolean;
  /** Settings for timing shown on the rule, e.g. the time of day. */
  timingFields?: { key: string; label: string; kind: "time" | "days"; default: string }[];
};

// Transport rules (pickup, drop, arriving) belong to Transport Management and
// are shown only where Transport is switched on. Emergency and delay messages
// to a route are sent by a person after they confirm (12 §5), not by a rule.
export const RULES: RuleDef[] = [
  { key: "absence", label: "Absent today", when: "A student is marked absent", module: "Attendance Management", audience: "parents", messageType: "attendance", defaultChannels: ["whatsapp"], defaultOn: true },
  { key: "late", label: "Late arrival", when: "A student is marked late", module: "Attendance Management", audience: "parents", messageType: "attendance", defaultChannels: ["whatsapp"], defaultOn: false },
  { key: "fee-due", label: "Fee reminder", when: "A fee due date comes (on the reminder days set in Fee Management)", module: "Fee Management", audience: "parents", messageType: "fee", defaultChannels: ["whatsapp"], defaultOn: true },
  { key: "fee-paid", label: "Fee received", when: "A fee payment is received", module: "Fee Management", audience: "parents", messageType: "fee", defaultChannels: ["whatsapp"], defaultOn: true },
  { key: "exam-reminder", label: "Exam reminder", when: "A datesheet is published, and before exams", module: "Examination & Results", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: true,
    timingFields: [{ key: "daysBefore", label: "Days before the first exam", kind: "days", default: "3" }] },
  { key: "result", label: "Results", when: "Results are published", module: "Examination & Results", audience: "parents", messageType: "result", defaultChannels: ["whatsapp"], defaultOn: true },
  { key: "ptm", label: "PTM reminder", when: "A parent-teacher meeting is coming", module: "Events & Calendar", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: true,
    timingFields: [{ key: "daysBefore", label: "Days before the PTM", kind: "days", default: "1" }] },
  { key: "homework-set", label: "Homework set", when: "A teacher sets homework", module: "Homework & Learning", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: false },
  { key: "homework-pending", label: "Pending homework", when: "Homework is still not submitted after its due date", module: "Homework & Learning", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: false,
    timingFields: [{ key: "time", label: "Time of day", kind: "time", default: "17:00" }] },
  { key: "birthday-student", label: "Birthday wishes to students", when: "It is a student's birthday", module: "Communication", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: true,
    timingFields: [{ key: "time", label: "Time of day", kind: "time", default: "08:00" }] },
  { key: "birthday-staff", label: "Birthday wishes to staff", when: "It is a staff member's birthday", module: "Communication", audience: "staff", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: true,
    timingFields: [{ key: "time", label: "Time of day", kind: "time", default: "08:00" }] },
  { key: "salary-slip", label: "Salary slip ready", when: "Salary is approved and slips are made", module: "Salary Management", audience: "staff", messageType: "general", defaultChannels: ["app"], defaultOn: true },
  { key: "admission-welcome", label: "Admission welcome", when: "An admission is approved", module: "Admission Management", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: true },
  { key: "bus-pickup", label: "Picked up by the bus", when: "A student boards the school bus in the morning", module: "Transport Management", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: false },
  { key: "bus-drop", label: "Dropped by the bus", when: "A student reaches school, or gets off at the stop in the evening", module: "Transport Management", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: false },
  { key: "bus-arriving", label: "Bus arriving", when: "The bus is a few minutes from the student's stop (set in Transport Settings)", module: "Transport Management", audience: "parents", messageType: "general", defaultChannels: ["whatsapp"], defaultOn: false },
];

export const ruleDef = (key: string) => RULES.find((r) => r.key === key);

export type RuleState = RuleDef & { isOn: boolean; channels: Channel[]; templateIds: Partial<Record<Channel, string>>; sendTo: "primary" | "all"; timing: Record<string, string> };

/** Each rule with the school's choices, or its defaults. */
export async function ruleStates(tx: Tx, ctx: SchoolContext): Promise<RuleState[]> {
  const rows = await tx.automaticMessageRule.findMany({ where: { schoolId: ctx.schoolId } });
  const templates = await tx.template.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, key: { in: RULES.map((r) => r.key) } }, select: { id: true, key: true, channel: true }, orderBy: { createdAt: "asc" } });
  return RULES.map((def) => {
    const row = rows.find((r) => r.key === def.key);
    const channels = (row?.channels.length ? row.channels : def.defaultChannels) as Channel[];
    const templateIds: Partial<Record<Channel, string>> = {};
    for (const t of templates) if (t.key === def.key && !templateIds[t.channel as Channel]) templateIds[t.channel as Channel] = t.id;
    const timing = Object.fromEntries((def.timingFields ?? []).map((t) => [t.key, t.default]));
    Object.assign(timing, (row?.timing ?? {}) as Record<string, string>);
    return { ...def, isOn: row ? row.isOn : def.defaultOn, channels, templateIds, sendTo: row?.sendTo === "all" ? "all" : "primary", timing };
  });
}

export type AutomaticInput = {
  rule: string;
  /** One event, e.g. { key: "attendance:2026-10-09:<student id>", label: "Absent on 09-10-2026" }. */
  event: { key: string; label: string };
  /** Who: usually the guardians of some students (guardiansOf), or staffIds. */
  to: AudienceRule;
  values?: Record<string, string>;
  perStudent?: Record<string, Record<string, string>>;
  source?: { type: string; id: string } | null;
};

export type AutomaticResult = { status: "sent"; result: SendResult; duplicates: number } | { status: "off" | "nobody" | "duplicate" | "no-channel"; duplicates: number };

/**
 * Sends one automatic message, if its rule is on. People already sent this
 * event by this rule are left out (no duplicates), opted-out parents are
 * skipped, and every person gets a line in the automation log.
 */
export async function sendAutomatic(tx: Tx, ctx: SchoolContext, input: AutomaticInput): Promise<AutomaticResult> {
  const def = ruleDef(input.rule);
  if (!def) throw new Error(`Unknown automatic message rule: ${input.rule}`);
  await ensureReadyTemplates(tx, ctx);
  const state = (await ruleStates(tx, ctx)).find((r) => r.key === def.key)!;
  if (!state.isOn) return { status: "off", duplicates: 0 };

  const on = await onChannels(tx, ctx);
  // Use the rule's channels that are on; fall back to WhatsApp, then SMS. Parents have no
  // app, so a parents' rule saved with "app" (Homework set used to be) falls back too.
  let channels = state.channels.filter((c) => on.has(c) && (c !== "sms" || state.templateIds.sms) && !(c === "app" && def.audience === "parents"));
  if (channels.length === 0 && def.audience === "parents") {
    const setups = await channelSetups(tx, ctx);
    channels = setups.whatsapp.isOn ? ["whatsapp"] : setups.sms.isOn && state.templateIds.sms ? ["sms"] : [];
  }
  if (channels.length === 0 && def.audience === "staff") channels = ["app"];
  if (channels.length === 0) return { status: "no-channel", duplicates: 0 };

  const templates: Partial<Record<Channel, string>> = {};
  for (const c of channels) {
    const id = state.templateIds[c] ?? (await templateByKey(tx, ctx, def.key, c))?.id;
    if (id) templates[c] = id;
  }
  channels = channels.filter((c) => templates[c]);
  if (channels.length === 0) return { status: "no-channel", duplicates: 0 };

  const done = new Set(
    (await tx.automationLog.findMany({ where: { schoolId: ctx.schoolId, ruleKey: def.key, eventKey: input.event.key, outcome: { in: ["sent", "no-credits"] } }, select: { recipientKey: true } })).map((r) => r.recipientKey),
  );
  const settings = await messageSettings(tx, ctx);
  const backupOn = def.messageType !== "general" && settings.smsBackup[def.messageType as BackupType]?.on;
  const send: SendInput = {
    to: { ...input.to, allGuardians: input.to.allGuardians ?? state.sendTo === "all" },
    channels,
    templates,
    values: input.values,
    perStudent: input.perStudent,
    messageType: def.messageType,
    smsBackup: Boolean(backupOn),
    ruleKey: def.key,
    trigger: input.event.label,
    source: input.source ?? null,
    onNoCredits: "fail",
    exclude: (key) => done.has(key) || [...done].some((d) => d.startsWith(`${key}:`)),
  };
  const plan = await planMessage(tx, ctx, send);
  const duplicates = done.size;
  if (plan.problems.length) {
    // A broken setup must be visible, not silent: logged for each person.
    await logLines(tx, ctx, def.key, input.event, plan.rows.map((r) => ({ key: r.rowKey, name: r.candidate.name })), "skipped", plan.problems[0], null);
    return { status: "no-channel", duplicates };
  }
  for (const s of plan.skipped) {
    if (s.reason === "Opted out of messages") {
      await logLines(tx, ctx, def.key, input.event, (s.keys ?? []).map((key, i) => ({ key, name: s.names[i] ?? "Parent" })), "opted-out", "Opted out of messages", null);
    }
  }
  if (plan.rows.length === 0) return { status: duplicates ? "duplicate" : "nobody", duplicates };
  const result = await recordSend(tx, ctx, send, plan);
  const people = new Map<string, string>();
  for (const r of plan.rows) people.set(r.rowKey, r.candidate.name);
  await logLines(tx, ctx, def.key, input.event, [...people].map(([key, name]) => ({ key, name })), plan.creditProblem ? "no-credits" : "sent", plan.creditProblem, result.messageId);
  return { status: "sent", result, duplicates };
}

async function logLines(tx: Tx, ctx: SchoolContext, ruleKey: string, event: { key: string; label: string }, people: { key: string; name: string }[], outcome: string, note: string | null, messageId: string | null) {
  if (!people.length) return;
  if (outcome === "sent" || outcome === "no-credits") {
    // A person skipped earlier (opted out at the time) now gets it: the line moves to sent.
    for (const p of people) {
      await tx.automationLog.upsert({
        where: { schoolId_ruleKey_eventKey_recipientKey: { schoolId: ctx.schoolId, ruleKey, eventKey: event.key, recipientKey: p.key } },
        create: { schoolId: ctx.schoolId, ruleKey, eventKey: event.key, eventLabel: event.label, recipientKey: p.key, recipientName: p.name, outcome, note, messageId },
        update: { outcome, note, messageId },
      });
    }
    return;
  }
  await tx.automationLog.createMany({
    data: people.map((p) => ({ schoolId: ctx.schoolId, ruleKey, eventKey: event.key, eventLabel: event.label, recipientKey: p.key, recipientName: p.name, outcome, note, messageId })),
    skipDuplicates: true,
  });
}
