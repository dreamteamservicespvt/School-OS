// Getting a school's WhatsApp templates approved (Message Templates). WhatsApp
// (Meta) lets a school start a chat with a parent only from an approved
// template, and refuses words that end with a blank. Schools made before the
// ready texts were reworded can still hold the old words (they were "approved"
// in test mode when prisma/schema/migrations/*_whatsapp_ready_texts ran, and
// went back to Not submitted once a real WhatsApp account was connected), so:
// - "Make ready for WhatsApp" gives a template still in School OS's old words
//   today's ready words, as a new version (the old one stays on record);
// - a text the school wrote or changed is never replaced: it is listed with
//   what to change, for the person to edit;
// - every ready text not yet sent can be sent for approval in one go.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { languageLabel, READY_TEMPLATES, variablesIn, whatsappProblems } from "../messaging/templates";
import { PAST_READY_WHATSAPP } from "../messaging/ready-history";

/** Statuses a text can still be (re)worded and sent from: WhatsApp has not approved it and is not looking at it. */
const OPEN = new Set(["NOT_SUBMITTED", "REJECTED"]);
const statusOf = (v: { whatsappStatus: string | null }) => v.whatsappStatus ?? "NOT_SUBMITTED";

/** Today's ready WhatsApp words for a key and language, if School OS has them. */
export function readyWhatsappWords(key: string | null, language: string): string | null {
  if (!key) return null;
  return READY_TEMPLATES.find((t) => t.key === key && t.channel === "whatsapp")?.texts[language] ?? null;
}

/**
 * The new words for a WhatsApp text that is still exactly as School OS once
 * wrote it, or null: a text the school changed, or one already in today's words.
 */
export function newReadyWords(key: string | null, language: string, body: string): string | null {
  const now = readyWhatsappWords(key, language);
  if (!now) return null;
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text === now) return null;
  return (PAST_READY_WHATSAPP[`${key}|${language}`] ?? []).includes(text) ? now : null;
}

export type ReadyRow = { templateId: string; name: string; language: string; languageLabel: string };
export type WhatsappReadiness = {
  /** Templates still in School OS's old words, which "Make ready for WhatsApp" rewords. */
  fixable: (ReadyRow & { versionId: string })[];
  /** Texts WhatsApp would take, never sent yet: "Send N templates to WhatsApp for approval". */
  toSend: (ReadyRow & { versionId: string })[];
  /** Texts the school wrote or changed that WhatsApp would refuse, or that WhatsApp rejected: the person edits them. */
  toEdit: (ReadyRow & { problems: string[] })[];
  pending: number;
  approved: number;
};

/** Where each WhatsApp template in use stands on the way to approval. */
export async function whatsappReadiness(tx: Tx, ctx: SchoolContext): Promise<WhatsappReadiness> {
  const rows = await tx.template.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, channel: "whatsapp" },
    select: { id: true, name: true, key: true, versions: { where: { isCurrent: true }, select: { id: true, language: true, body: true, whatsappStatus: true, whatsappNote: true }, orderBy: { language: "asc" } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const out: WhatsappReadiness = { fixable: [], toSend: [], toEdit: [], pending: 0, approved: 0 };
  for (const t of rows) {
    for (const v of t.versions) {
      const status = statusOf(v);
      const row = { templateId: t.id, name: t.name, language: v.language, languageLabel: languageLabel(v.language) };
      if (status === "APPROVED") { out.approved++; continue; }
      if (!OPEN.has(status)) { out.pending++; continue; }
      if (newReadyWords(t.key, v.language, v.body)) { out.fixable.push({ ...row, versionId: v.id }); continue; }
      const problems = whatsappProblems(v.body);
      if (status === "REJECTED") out.toEdit.push({ ...row, problems: [v.whatsappNote ? `WhatsApp rejected this text: “${v.whatsappNote}”` : "WhatsApp rejected this text.", ...problems] });
      else if (problems.length) out.toEdit.push({ ...row, problems });
      else out.toSend.push({ ...row, versionId: v.id });
    }
  }
  return out;
}

/**
 * Gives one template (or, with no id, every template) still in School OS's old
 * words today's ready words: a new version for each such language, never sent
 * to WhatsApp yet; the old version stays for messages already sent. A text the
 * school changed, or one WhatsApp approved or is checking, is left alone.
 */
export async function makeReadyForWhatsapp(tx: Tx, ctx: SchoolContext, templateId: string | null) {
  const rows = await tx.template.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, channel: "whatsapp", key: { not: null }, ...(templateId ? { id: templateId } : {}) },
    select: { id: true, name: true, key: true, versions: { where: { isCurrent: true }, select: { id: true, language: true, body: true, subject: true, whatsappStatus: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const done: { templateId: string; name: string; languages: string[] }[] = [];
  for (const t of rows) {
    const languages: string[] = [];
    for (const v of t.versions) {
      if (!OPEN.has(statusOf(v))) continue;
      const words = newReadyWords(t.key, v.language, v.body);
      if (!words) continue;
      // Retire this exact version only if it is still current (two people clicking at once make one new version).
      const retired = await tx.templateVersion.updateMany({ where: { id: v.id, schoolId: ctx.schoolId, isCurrent: true }, data: { isCurrent: false } });
      if (!retired.count) continue;
      const last = await tx.templateVersion.findFirst({ where: { templateId: t.id, language: v.language }, orderBy: { version: "desc" }, select: { version: true } });
      await tx.templateVersion.create({
        data: {
          schoolId: ctx.schoolId, templateId: t.id, language: v.language, version: (last?.version ?? 0) + 1,
          subject: v.subject, body: words, variables: variablesIn(words), whatsappStatus: "NOT_SUBMITTED", createdById: ctx.userId,
        },
      });
      languages.push(v.language);
    }
    if (!languages.length) continue;
    await writeAudit(tx, ctx, {
      action: "changed", recordType: "Template", recordId: t.id,
      actorNote: `Template "${t.name}" made ready for WhatsApp; new version for ${languages.join(", ")}`,
      after: { languages, words: "School OS ready words" },
    });
    done.push({ templateId: t.id, name: t.name, languages });
  }
  return done;
}
