"use server";

// Message Settings (11-communication.md §6). Each part saves on its own, with
// a line in the audit log showing before and after. Principal and School
// Admin only.
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { commAction } from "@/lib/communication/access";
import { CHANNELS, type Channel } from "@/lib/messaging/channels";
import { ruleDef } from "@/lib/messaging/automatic";
import { BACKUP_TYPES, QUERY_TYPES, updateSettings, type MessageSettingsValue } from "@/lib/messaging/settings";
import { OPT_OUT_WAYS, setOptOut } from "@/lib/messaging/optout";
import { MessagingProblem } from "@/lib/messaging/send";
import { sectionSwitches } from "@/lib/parent-link/section-list";

const uuid = /^[0-9a-f-]{36}$/;
const PATH = "/communication/settings";
class SettingsProblem extends Error {}

async function run<T>(what: string, fn: (tx: Tx, ctx: SchoolContext) => Promise<T>): Promise<string | void> {
  try {
    const access = await commAction("edit");
    if (!access.full) return "Only the Principal and School Admin can change Message Settings.";
    await withSchool(access.current.ctx, (tx) => fn(tx, access.current.ctx));
  } catch (e) {
    if (e instanceof SettingsProblem || e instanceof MessagingProblem) return e.message;
    throw e;
  }
  await flash({ message: `${what} saved.`, tone: "success" });
  revalidatePath(PATH);
}

async function saveSettings(tx: Tx, ctx: SchoolContext, part: string, change: (s: MessageSettingsValue) => MessageSettingsValue) {
  const { before, after } = await updateSettings(tx, ctx, change);
  const key = part as keyof MessageSettingsValue;
  await writeAudit(tx, ctx, { action: "changed", recordType: "Message Settings", recordId: ctx.schoolId, before: { [key]: before[key] } as Prisma.InputJsonValue, after: { [key]: after[key] } as Prisma.InputJsonValue });
}

const int = (v: unknown, min: number, max: number, words: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new SettingsProblem(words);
  return n;
};

// ── Automatic messages ────────────────────────────────────────────────────

export async function saveRuleAction(input: { key: string; isOn: boolean; channels: string[]; sendTo: string; timing: Record<string, string> }): Promise<string | void> {
  const def = ruleDef(String(input?.key ?? ""));
  if (!def) return "This automatic message was not found.";
  const channels = [...new Set((input.channels ?? []).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c)))];
  if (input.isOn && !channels.length) return "Choose at least one channel, or switch the message off.";
  const timing: Record<string, string> = {};
  for (const f of def.timingFields ?? []) {
    const v = String(input.timing?.[f.key] ?? f.default);
    if (f.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return `${f.label}: choose a time.`;
    if (f.kind === "days" && !(/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 30)) return `${f.label}: a number of days from 0 to 30.`;
    timing[f.key] = v;
  }
  const sendTo = input.sendTo === "all" ? "all" : "primary";
  return run(`"${def.label}"`, async (tx, ctx) => {
    const before = await tx.automaticMessageRule.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key: def.key } } });
    const data = { isOn: Boolean(input.isOn), channels, sendTo: def.audience === "staff" ? "primary" : sendTo, timing, updatedById: ctx.userId };
    await tx.automaticMessageRule.upsert({ where: { schoolId_key: { schoolId: ctx.schoolId, key: def.key } }, create: { schoolId: ctx.schoolId, key: def.key, ...data }, update: data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Automatic Message Rule", recordId: null, before: before ? { key: def.key, isOn: before.isOn, channels: before.channels, sendTo: before.sendTo, timing: before.timing as Prisma.InputJsonValue } : { key: def.key, isOn: def.defaultOn }, after: { key: def.key, ...data } });
  });
}

// ── Message delivery: retries, SMS backup, notice approval ────────────────

export async function saveDeliveryAction(input: { retryLimit: number; backup: Record<string, { on: boolean; waitMinutes: number }>; noticeApproval: string }): Promise<string | void> {
  try {
    const retry = int(input.retryLimit, 1, 5, "The retry limit can be from 1 to 5.");
    const backup = Object.fromEntries(BACKUP_TYPES.map((t) => [t, { on: Boolean(input.backup?.[t]?.on), waitMinutes: int(input.backup?.[t]?.waitMinutes ?? 120, 15, 1440, "The wait before an SMS backup can be from 15 minutes to 24 hours.") }]));
    const approval = input.noticeApproval === "all" || input.noticeApproval === "none" ? input.noticeApproval : "parents";
    return run("Delivery settings", async (tx, ctx) => {
      await saveSettings(tx, ctx, "retryLimit", (s) => ({ ...s, retryLimit: retry }));
      await saveSettings(tx, ctx, "smsBackup", (s) => ({ ...s, smsBackup: backup as MessageSettingsValue["smsBackup"] }));
      await saveSettings(tx, ctx, "noticeApproval", (s) => ({ ...s, noticeApproval: approval }));
    });
  } catch (e) {
    if (e instanceof SettingsProblem) return e.message;
    throw e;
  }
}

// ── Queries: reply time limits, escalation, rating ────────────────────────

export async function saveQueryRulesAction(input: { on: boolean; hours: Record<string, number>; escalateToId: string; rating: boolean }): Promise<string | void> {
  try {
    const hours = Object.fromEntries(QUERY_TYPES.map((t) => [t, int(input.hours?.[t], 1, 24 * 30, "Each reply time limit is a number of hours from 1 to 720.")]));
    const esc = input.escalateToId && uuid.test(input.escalateToId) ? input.escalateToId : null;
    if (input.on && !esc) return "Choose who overdue queries are escalated to.";
    return run("Query rules", async (tx, ctx) => {
      if (esc && !(await tx.userLogin.findFirst({ where: { id: esc } }))) throw new SettingsProblem("Choose a staff member with a login.");
      await saveSettings(tx, ctx, "queryTargets", (s) => ({ ...s, queryTargets: { on: Boolean(input.on), hours: hours as MessageSettingsValue["queryTargets"]["hours"], escalateToId: esc } }));
      await saveSettings(tx, ctx, "queryRating", (s) => ({ ...s, queryRating: Boolean(input.rating) }));
    });
  } catch (e) {
    if (e instanceof SettingsProblem) return e.message;
    throw e;
  }
}

function readOwner(v: string) {
  const [kind, id] = v.split(":");
  if (kind === "user" && uuid.test(id ?? "")) return { defaultOwnerId: id, defaultDepartmentId: null };
  if (kind === "dept" && uuid.test(id ?? "")) return { defaultOwnerId: null, defaultDepartmentId: id };
  return { defaultOwnerId: null, defaultDepartmentId: null };
}

export async function saveTopicAction(input: { id: string | null; name: string; owner: string }): Promise<string | void> {
  const name = String(input?.name ?? "").trim();
  if (name.length < 2 || name.length > 40) return "A topic name has 2 to 40 characters.";
  const owner = readOwner(String(input.owner ?? ""));
  return run(`Topic "${name}"`, async (tx, ctx) => {
    const clash = await tx.queryTopic.findFirst({ where: { schoolId: ctx.schoolId, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
    if (clash) throw new SettingsProblem(clash.archivedAt ? `"${name}" is an archived topic. Restore it instead.` : `There is already a topic "${name}".`);
    if (input.id) {
      if (!uuid.test(input.id)) throw new SettingsProblem("This topic was not found.");
      const before = await tx.queryTopic.findFirst({ where: { id: input.id, schoolId: ctx.schoolId } });
      if (!before) throw new SettingsProblem("This topic was not found.");
      await tx.queryTopic.update({ where: { id: before.id }, data: { name, ...owner } });
      await writeAudit(tx, ctx, { action: "changed", recordType: "Query Topic", recordId: before.id, before: { name: before.name, owner: before.defaultOwnerId, department: before.defaultDepartmentId }, after: { name, owner: owner.defaultOwnerId, department: owner.defaultDepartmentId } });
    } else {
      const last = await tx.queryTopic.findFirst({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const t = await tx.queryTopic.create({ data: { schoolId: ctx.schoolId, name, sortOrder: (last?.sortOrder ?? 0) + 1, ...owner } });
      await writeAudit(tx, ctx, { action: "created", recordType: "Query Topic", recordId: t.id, after: { name } });
    }
  });
}

export async function archiveTopicAction(id: string, archive: boolean): Promise<string | void> {
  if (!uuid.test(id)) return "This topic was not found.";
  return run(archive ? "Topic archived and" : "Topic restored and", async (tx, ctx) => {
    const t = await tx.queryTopic.findFirst({ where: { id, schoolId: ctx.schoolId } });
    if (!t) throw new SettingsProblem("This topic was not found.");
    await tx.queryTopic.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
    await writeAudit(tx, ctx, { action: archive ? "archived" : "restored", recordType: "Query Topic", recordId: id, after: { name: t.name } });
  });
}

// ── Consent and opt-out ───────────────────────────────────────────────────

export async function optOutAction(input: { guardianId: string; optOut: boolean; how: string; note: string }): Promise<string | void> {
  if (!uuid.test(String(input?.guardianId ?? ""))) return "Choose a parent.";
  if (!(OPT_OUT_WAYS as readonly string[]).includes(input.how)) return "Choose how the parent told the school.";
  const note = String(input.note ?? "").trim();
  if (input.how === "Other" && note.length < 5) return "Write how the parent told the school, in at least 5 characters.";
  if (note.length > 300) return "The note can be at most 300 characters.";
  return run(input.optOut ? "Opt-out" : "Opt-in", (tx, ctx) => setOptOut(tx, ctx, input.guardianId, Boolean(input.optOut), input.how, note || null));
}

export async function findGuardians(q: string): Promise<{ id: string; name: string; detail: string; optedOut: boolean }[]> {
  const access = await commAction("edit");
  if (!access.full) return [];
  const text = String(q ?? "").trim().slice(0, 60);
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  return withSchool(access.current.ctx, async (tx) => {
    const rows = await tx.guardian.findMany({
      where: { schoolId: access.current.ctx.schoolId, archivedAt: null, OR: [{ name: { contains: text, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] },
      select: { id: true, name: true, phone: true, optedOut: true, relationship: true }, take: 10, orderBy: { name: "asc" },
    });
    return rows.map((g) => ({ id: g.id, name: g.name, detail: `${g.relationship} · ••${g.phone.slice(-4)}`, optedOut: g.optedOut }));
  });
}

// ── Saved groups ──────────────────────────────────────────────────────────

export async function archiveGroupAction(id: string): Promise<string | void> {
  if (!uuid.test(id)) return "This group was not found.";
  return run("Group archived and", async (tx, ctx) => {
    const g = await tx.recipientGroup.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null } });
    if (!g) throw new SettingsProblem("This group was not found.");
    // The name is freed for a new group by adding the date; the record itself is kept.
    await tx.recipientGroup.update({ where: { id }, data: { archivedAt: new Date(), name: `${g.name} (archived ${new Date().toISOString().slice(0, 10)} ${id.slice(0, 4)})` } });
    await writeAudit(tx, ctx, { action: "archived", recordType: "Recipient Group", recordId: id, before: { name: g.name } });
  });
}

// ── Parent Link ───────────────────────────────────────────────────────────

export async function saveParentLinkAction(input: { on: boolean; shows: Record<string, boolean>; autoSendOnAdmission: boolean; codeMinutes: number; deviceDays: number }): Promise<string | void> {
  try {
    const codeMinutes = int(input.codeMinutes, 5, 30, "The one-time code can be valid for 5 to 30 minutes.");
    const deviceDays = int(input.deviceDays, 7, 365, "A verified phone can stay verified for 7 to 365 days.");
    const keys = new Set(sectionSwitches().map((s) => s.key));
    const shows = Object.fromEntries(Object.entries(input.shows ?? {}).filter(([k]) => keys.has(k)).map(([k, v]) => [k, Boolean(v)]));
    return run("Parent Link settings", (tx, ctx) => saveSettings(tx, ctx, "parentLink", (s) => ({ ...s, parentLink: { on: Boolean(input.on), shows: { ...s.parentLink.shows, ...shows }, autoSendOnAdmission: Boolean(input.autoSendOnAdmission), codeMinutes, deviceDays } })));
  } catch (e) {
    if (e instanceof SettingsProblem) return e.message;
    throw e;
  }
}
