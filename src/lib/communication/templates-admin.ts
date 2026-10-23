// Message Templates page (11-communication.md, Message Templates): the list,
// saving (each save makes a new version per language; sent messages keep the
// version they used), and WhatsApp approval through the connected provider.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import type { ListParams } from "../list";
import { CHANNELS, channelSecrets, channelSetups, type Channel } from "../messaging/channels";
import { checkDltId, LANGUAGES, TEMPLATE_CATEGORIES, unknownVariables, variablesIn } from "../messaging/templates";
import { RULES } from "../messaging/automatic";
import { listWhatsappTemplates, submitWhatsappTemplate, whatsappTemplateStatus } from "../messaging/providers/whatsapp";

export class TemplateProblem extends Error {}

export const TEMPLATE_FILTERS = ["channel", "category", "language", "status"] as const;

export const WHATSAPP_STATUS_LABEL: Record<string, string> = { NOT_SUBMITTED: "Not submitted", PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

export function templateWhere(ctx: SchoolContext, params: ListParams): Prisma.TemplateWhereInput {
  const f = params.filters;
  const and: Prisma.TemplateWhereInput[] = [{ schoolId: ctx.schoolId }, params.archived ? { archivedAt: { not: null } } : { archivedAt: null }];
  if (params.q) and.push({ OR: [{ name: { contains: params.q, mode: "insensitive" } }, { versions: { some: { isCurrent: true, body: { contains: params.q, mode: "insensitive" } } } }] });
  if (f.channel && (CHANNELS as readonly string[]).includes(f.channel)) and.push({ channel: f.channel });
  if (f.category) and.push({ category: f.category });
  if (f.language) and.push({ versions: { some: { isCurrent: true, language: f.language } } });
  if (f.status === "dlt-missing") and.push({ channel: "sms", versions: { some: { isCurrent: true, dltTemplateId: null } } });
  else if (f.status && WHATSAPP_STATUS_LABEL[f.status]) and.push({ channel: "whatsapp", versions: { some: { isCurrent: true, whatsappStatus: f.status } } });
  return { AND: and };
}

/** "Used by": the automatic rules that send with a template (found by its key and channel). */
export function usedBy(t: { key: string | null; channel: string }, firstIds: Map<string, string>, id: string) {
  if (!t.key) return [];
  if (firstIds.get(`${t.key}:${t.channel}`) !== id) return [];
  const rules = RULES.filter((r) => r.key === t.key).map((r) => r.label);
  return rules.length ? rules : SYSTEM_USES[t.key] ? [SYSTEM_USES[t.key]] : [];
}

/** Templates the system sends itself, outside the automatic rules. */
const SYSTEM_USES: Record<string, string> = {
  "parent-link": "Parent Link (sending links)",
  "parent-link-code": "Parent Link (one-time codes)",
  "consent-request": "Consent requests",
  "query-number": "Feedback & Queries (ticket number)",
  "query-rating": "Feedback & Queries (rating request)",
  notice: "Notice Board",
};

/** The first template of each key and channel, which automatic rules use. */
export async function ruleTemplateIds(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.template.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, key: { not: null } }, select: { id: true, key: true, channel: true }, orderBy: { createdAt: "asc" } });
  const map = new Map<string, string>();
  for (const r of rows) if (!map.has(`${r.key}:${r.channel}`)) map.set(`${r.key}:${r.channel}`, r.id);
  return map;
}

export type TemplateText = { language: string; subject: string | null; body: string; dltTemplateId: string | null };
export type TemplateInput = { name: string; category: string; channel: Channel; texts: TemplateText[] };

/** Checks a template form; returns errors by field name (texts by "body:<language>"). */
export function checkTemplate(input: TemplateInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.name.length < 3) e.name = "Give the template a name of at least 3 characters.";
  else if (input.name.length > 80) e.name = "The name can be at most 80 characters.";
  if (!TEMPLATE_CATEGORIES.some((c) => c.key === input.category)) e.category = "Choose a category.";
  if (!CHANNELS.includes(input.channel)) e.channel = "Choose a channel.";
  if (!input.texts.length) e.texts = "Add the text in at least one language.";
  const seen = new Set<string>();
  for (const t of input.texts) {
    if (!LANGUAGES.some((l) => l.code === t.language)) { e[`body:${t.language}`] = "Choose a language from the list."; continue; }
    if (seen.has(t.language)) e[`body:${t.language}`] = "This language is added twice.";
    seen.add(t.language);
    if (!t.body.trim()) e[`body:${t.language}`] = "Write the message text.";
    else if (t.body.length > 1000) e[`body:${t.language}`] = "The text can be at most 1000 characters.";
    else {
      const bad = unknownVariables(t.body);
      if (bad.length) e[`body:${t.language}`] = `Unknown blank${bad.length > 1 ? "s" : ""} ${bad.map((b) => `{${b}}`).join(", ")}. Insert blanks from the list.`;
    }
    if (input.channel === "email" && !t.subject?.trim()) e[`subject:${t.language}`] = "Email templates need a subject.";
    if (t.subject && t.subject.length > 150) e[`subject:${t.language}`] = "The subject can be at most 150 characters.";
    const dlt = checkDltId(t.dltTemplateId ?? "");
    if (input.channel === "sms" && dlt) e[`dlt:${t.language}`] = dlt;
  }
  return e;
}

const SAME = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") === (b ?? "");

/**
 * Saves a template. Each language whose text, subject or DLT ID changed gets a
 * new version; the old one stays for messages already sent. Approved WhatsApp
 * text is locked. An SMS template with no DLT ID is saved but cannot be used.
 */
export async function saveTemplate(tx: Tx, ctx: SchoolContext, id: string | null, input: TemplateInput) {
  const errors = checkTemplate(input);
  if (Object.keys(errors).length) throw new TemplateProblem(Object.values(errors)[0]);
  let templateId = id;
  const changed: string[] = [];
  if (id) {
    const t = await tx.template.findFirst({ where: { id, schoolId: ctx.schoolId, archivedAt: null } });
    if (!t) throw new TemplateProblem("This template was not found. It may have been archived.");
    if (t.channel !== input.channel) throw new TemplateProblem("The channel of a saved template cannot change. Make a new template for the other channel.");
    await tx.template.update({ where: { id }, data: { name: input.name, category: input.category } });
    const current = await tx.templateVersion.findMany({ where: { schoolId: ctx.schoolId, templateId: id, isCurrent: true } });
    for (const text of input.texts) {
      const now = current.find((v) => v.language === text.language);
      if (now && now.body === text.body && SAME(now.subject, text.subject) && SAME(now.dltTemplateId, text.dltTemplateId)) continue;
      if (now && now.whatsappStatus === "APPROVED" && (now.body !== text.body || !SAME(now.subject, text.subject))) {
        throw new TemplateProblem(`The ${LANGUAGES.find((l) => l.code === text.language)?.label ?? text.language} text is approved by WhatsApp and locked. Make a new template to change the wording.`);
      }
      const last = await tx.templateVersion.findFirst({ where: { templateId: id, language: text.language }, orderBy: { version: "desc" }, select: { version: true } });
      if (now) await tx.templateVersion.update({ where: { id: now.id }, data: { isCurrent: false } });
      const keepWhatsapp = now && now.body === text.body && SAME(now.subject, text.subject);
      await tx.templateVersion.create({
        data: {
          schoolId: ctx.schoolId, templateId: id, language: text.language, version: (last?.version ?? 0) + 1,
          subject: text.subject, body: text.body, variables: variablesIn(text.body),
          dltTemplateId: input.channel === "sms" ? text.dltTemplateId : null,
          whatsappName: keepWhatsapp ? now.whatsappName : null,
          whatsappStatus: input.channel === "whatsapp" ? (keepWhatsapp ? now.whatsappStatus : "NOT_SUBMITTED") : null,
          whatsappNote: keepWhatsapp ? now.whatsappNote : null,
          createdById: ctx.userId,
        },
      });
      changed.push(text.language);
    }
    await writeAudit(tx, ctx, { action: "changed", recordType: "Template", recordId: id, actorNote: `Template "${input.name}" saved${changed.length ? `; new version for ${changed.join(", ")}` : ""}`, before: { name: t.name, category: t.category }, after: { name: input.name, category: input.category, languages: changed } });
  } else {
    const t = await tx.template.create({
      data: {
        schoolId: ctx.schoolId, name: input.name, category: input.category, channel: input.channel, createdById: ctx.userId,
        versions: { create: input.texts.map((text) => ({
          schoolId: ctx.schoolId, language: text.language, version: 1, subject: text.subject, body: text.body, variables: variablesIn(text.body),
          dltTemplateId: input.channel === "sms" ? text.dltTemplateId : null,
          whatsappStatus: input.channel === "whatsapp" ? "NOT_SUBMITTED" : null, createdById: ctx.userId,
        })) },
      },
    });
    templateId = t.id;
    changed.push(...input.texts.map((x) => x.language));
    await writeAudit(tx, ctx, { action: "created", recordType: "Template", recordId: t.id, actorNote: `Template "${input.name}" added (${input.channel})`, after: { name: input.name, category: input.category, channel: input.channel, languages: changed } });
  }
  return { id: templateId!, changed };
}

/** Archives a template. Automatic rules then fall back to another template with the same key, or skip. */
export async function archiveTemplate(tx: Tx, ctx: SchoolContext, id: string, archive: boolean) {
  const t = await tx.template.findFirst({ where: { id, schoolId: ctx.schoolId } });
  if (!t) throw new TemplateProblem("This template was not found.");
  await tx.template.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
  await writeAudit(tx, ctx, { action: archive ? "archived" : "restored", recordType: "Template", recordId: id, actorNote: `Template "${t.name}" ${archive ? "archived" : "restored"}` });
  return t;
}

/** WhatsApp names: lower case letters, numbers and underscores. */
export function whatsappNameFor(name: string, id: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "template";
  return `${base}_${id.replace(/-/g, "").slice(0, 6)}`;
}

/**
 * Sends one language version for WhatsApp approval. In test mode it is
 * approved straight away, so the rest of the system can be tried out.
 */
export async function submitForApproval(tx: Tx, ctx: SchoolContext, versionId: string) {
  const v = await tx.templateVersion.findFirst({ where: { id: versionId, schoolId: ctx.schoolId, isCurrent: true }, include: { template: true } });
  if (!v || v.template.channel !== "whatsapp") throw new TemplateProblem("Only the current version of a WhatsApp template can be sent for approval.");
  if (v.whatsappStatus === "APPROVED" || v.whatsappStatus === "PENDING") throw new TemplateProblem(v.whatsappStatus === "APPROVED" ? "This text is already approved." : "This text is already waiting for WhatsApp's answer.");
  const setup = (await channelSetups(tx, ctx)).whatsapp;
  const name = whatsappNameFor(v.template.name, v.templateId);
  let status: string;
  let note: string | null = null;
  if (setup.provider === "sandbox") {
    status = "APPROVED";
    note = "Test mode: approved straight away.";
  } else {
    const r = await submitWhatsappTemplate({ config: setup.config, secrets: await channelSecrets(tx, ctx, "whatsapp") }, {
      name, language: v.language, category: "UTILITY", body: v.body,
    });
    if (!r.ok) throw new TemplateProblem(r.reason);
    status = r.status === "APPROVED" || r.status === "REJECTED" ? r.status : "PENDING";
  }
  await tx.templateVersion.update({ where: { id: v.id }, data: { whatsappName: name, whatsappStatus: status, whatsappNote: note } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Template", recordId: v.templateId, actorNote: `Template "${v.template.name}" (${v.language}) sent for WhatsApp approval: ${WHATSAPP_STATUS_LABEL[status]}` });
  return status;
}

/**
 * Makes every WhatsApp template's status match what the school's WhatsApp
 * Business account really has. Templates "approved" in test mode were never
 * sent to WhatsApp; once a real account is connected they would go out as
 * plain text, which WhatsApp refuses outside a parent's 24-hour reply window.
 * Here they go back to "Not submitted", so the screens say so and a person can
 * send them for approval. Pending ones become Approved or Rejected when
 * WhatsApp decides. Only reads from WhatsApp; never adds, changes or deletes a
 * template there. Does nothing in test mode or when WhatsApp cannot be read.
 */
export async function syncWhatsappApprovals(tx: Tx, ctx: SchoolContext): Promise<{ changed: number } | null> {
  const setup = (await channelSetups(tx, ctx)).whatsapp;
  if (setup.provider !== "meta-cloud") return null;
  const known = await listWhatsappTemplates({ config: setup.config, secrets: await channelSecrets(tx, ctx, "whatsapp") });
  if (!known) return null;
  const versions = await tx.templateVersion.findMany({
    where: { schoolId: ctx.schoolId, isCurrent: true, template: { channel: "whatsapp" } },
    select: { id: true, language: true, whatsappName: true, whatsappStatus: true, whatsappNote: true },
  });
  let changed = 0;
  for (const v of versions) {
    const real = v.whatsappName ? known.get(`${v.whatsappName}|${v.language}`) : undefined;
    const next = real
      ? { whatsappStatus: WHATSAPP_STATUS_LABEL[real.status] ? real.status : "PENDING", whatsappNote: real.note }
      : { whatsappStatus: "NOT_SUBMITTED", whatsappNote: v.whatsappStatus && v.whatsappStatus !== "NOT_SUBMITTED" ? "Not on this WhatsApp account yet. Send it for approval." : v.whatsappNote };
    if (next.whatsappStatus === v.whatsappStatus && next.whatsappNote === v.whatsappNote) continue;
    await tx.templateVersion.update({ where: { id: v.id }, data: next });
    changed++;
  }
  return { changed };
}

/** Asks WhatsApp for the status of every pending version of a template. */
export async function refreshApproval(tx: Tx, ctx: SchoolContext, templateId: string) {
  const setup = (await channelSetups(tx, ctx)).whatsapp;
  const pending = await tx.templateVersion.findMany({ where: { schoolId: ctx.schoolId, templateId, isCurrent: true, whatsappStatus: "PENDING" } });
  if (!pending.length) return 0;
  if (setup.provider === "sandbox") {
    for (const v of pending) await tx.templateVersion.update({ where: { id: v.id }, data: { whatsappStatus: "APPROVED", whatsappNote: "Test mode: approved straight away." } });
    return pending.length;
  }
  const p = { config: setup.config, secrets: await channelSecrets(tx, ctx, "whatsapp") };
  let n = 0;
  for (const v of pending) {
    if (!v.whatsappName) continue;
    const s = await whatsappTemplateStatus(p, v.whatsappName, v.language);
    if (!s || s.status === v.whatsappStatus) continue;
    const status = WHATSAPP_STATUS_LABEL[s.status] ? s.status : "PENDING";
    await tx.templateVersion.update({ where: { id: v.id }, data: { whatsappStatus: status, whatsappNote: s.note } });
    n++;
  }
  return n;
}
