"use server";

// Send Message: check (count, cost, preview), then send or schedule.
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { findStudents } from "@/lib/students/find";
import { flash } from "@/lib/flash";
import { writeAudit } from "@/lib/audit";
import { commAction } from "@/lib/communication/access";
import { previewOf, readAudienceForm, readSendForm, type SendPreview } from "@/lib/communication/send-form";
import { planMessage, recordSend, MessagingProblem, skippedWords, testModeWords, type SendInput } from "@/lib/messaging/send";
import { describeAudience } from "@/lib/messaging/recipients";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPES, FileProblem, saveFile } from "@/lib/files";
import { isChannel } from "@/lib/messaging/channels";
import { BACKUP_TYPES, type BackupType } from "@/lib/messaging/settings";
import type { AudienceRule, Scope } from "@/lib/messaging/recipients";
import { yearsFor } from "@/lib/academic/years";
import { aiReady, AI_REASON_WORDS } from "@/lib/ai";
import { aiOffReason } from "@/lib/settings/switch-rules";
import { readTranslations, translationKey, type TranslationLanguage } from "@/lib/messaging/translation";
import { translateTyped } from "@/lib/communication/translate";
import type { Current } from "@/lib/current";

/**
 * The translations the sender confirmed (G40), only while the school's translation switch allows them:
 * with AI or the switch off, everyone gets the text as typed, whatever the form says.
 */
function confirmedTranslations(current: Current, form: FormData, english: { text?: string | null; title?: string | null }) {
  if (!aiReady(current, "ai-translation")) return { ok: true as const, translations: null };
  return readTranslations(form, english);
}

/** A sender limited to one campus reaches that campus only, whatever the form says (also kept on the message and the group). */
const onCampus = (to: AudienceRule, scope: Scope): AudienceRule => (scope.campusId ? { ...to, campusIds: [scope.campusId] } : to);

export type SendState = { ok: boolean; message?: string; errors?: Record<string, string>; preview?: SendPreview } | null;

export async function checkOrSend(_prev: SendState, form: FormData): Promise<SendState> {
  const access = await commAction("create");
  const { current, scope } = access;
  const read = readSendForm(form, current.school.timeZone);
  if (!read.ok) return { ok: false, message: Object.keys(read.errors).length === 1 ? Object.values(read.errors)[0] : `Please fix ${Object.keys(read.errors).length} things before checking.`, errors: read.errors };
  const tr = confirmedTranslations(current, form, read.input);
  if (!tr.ok) return { ok: false, message: tr.problem, errors: { translations: tr.problem } };
  const input = { ...read.input, to: onCampus(read.input.to, scope), scope, translations: tr.translations };
  if (input.emergency) {
    if (!access.canEmergency) return { ok: false, message: "Only the Principal and School Admin can send an emergency broadcast." };
    if (form.get("intent") === "send" && String(form.get("emergencyWord") ?? "").trim().toUpperCase() !== "EMERGENCY") {
      return { ok: false, message: "Type EMERGENCY to send to everyone chosen, including parents who opted out." };
    }
  }
  const intent = form.get("intent") === "send" ? "send" : "check";
  try {
    const result = await withSchool(current.ctx, async (tx) => {
      const plan = await planMessage(tx, current.ctx, input);
      const preview = previewOf(plan, input);
      if (intent === "check") return { preview };
      if (form.get("fingerprint") !== preview.fingerprint) return { preview, changed: true };
      // Attachment: email and WhatsApp only (11-communication.md, Send Message, Attachment).
      const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 1);
      const attachmentFileIds: string[] = [];
      if (files.length && input.channels !== "preferred" && input.channels.some((c) => c === "email" || c === "whatsapp")) {
        for (const f of files) attachmentFileIds.push((await saveFile(tx, current.ctx, { file: f, purpose: "message", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id);
      }
      const sent = await recordSend(tx, current.ctx, { ...input, attachmentFileIds, idempotencyKey: String(form.get("sendKey") ?? "") || null }, plan);
      return { preview, sent, plan };
    });
    if (!("sent" in result) || !result.sent) {
      if ("changed" in result && result.changed) return { ok: false, message: "The recipients or cost changed since you checked. Check the new numbers, then send.", preview: result.preview };
      return { ok: true, preview: result.preview };
    }
    const s = result.sent;
    const skipped = skippedWords(s.skipped);
    // Test mode sends nothing: the sender is told so, never that parents got it (COMM-04).
    const testMode = testModeWords(result.plan.testMode);
    const onlyTest = Boolean(testMode) && result.plan.rows.every((r) => result.plan.testMode.includes(r.channel));
    await flash({
      message: s.scheduled
        ? `Scheduled for ${formatDateTime(input.scheduledAt!, current.school.timeZone)} to ${s.people} ${s.people === 1 ? "person" : "people"}. You can cancel it until then.`
        : `${onlyTest ? "Recorded for" : "Sending to"} ${s.people} ${s.people === 1 ? "person" : "people"}.${skipped ? ` ${skipped}.` : ""}${testMode ? ` ${testMode}.` : ""}`,
      tone: "success",
      link: { href: `/communication/history/${s.messageId}`, label: "See delivery" },
    });
    redirect(`/communication/history/${s.messageId}`);
  } catch (e) {
    if (e instanceof MessagingProblem || e instanceof FileProblem) return { ok: false, message: e.message };
    throw e;
  }
}

export type LivePreview = { preview: SendPreview | null; errors: Record<string, string> };

/**
 * The "Check and send" card while the form is filled in: who, how many, the cost and a real preview,
 * worked out on the server from what is chosen so far. Nothing is sent or saved.
 */
export async function livePreview(form: FormData): Promise<LivePreview> {
  const access = await commAction("create");
  const { current, scope } = access;
  const chosen = readAudienceForm(form);
  const read = readSendForm(form, current.school.timeZone);
  if (!chosen) return { preview: null, errors: read.ok ? {} : read.errors };
  const to = onCampus(chosen, scope);
  const channels = form.getAll("channels").map(String).filter(isChannel);
  const templates = Object.fromEntries(channels.map((ch) => [ch, /^[0-9a-f-]{36}$/.test(String(form.get(`template_${ch}`) ?? "")) ? String(form.get(`template_${ch}`)) : null]));
  const typeRaw = String(form.get("messageType") ?? "general");
  const messageType: BackupType | "general" = (BACKUP_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as BackupType) : "general";
  const tr = read.ok ? confirmedTranslations(current, form, read.input) : null;
  if (tr && !tr.ok) return { preview: null, errors: { translations: tr.problem } };
  const input: SendInput = read.ok
    ? { ...read.input, to: onCampus(read.input.to, scope), scope, translations: tr?.ok ? tr.translations : null }
    : {
        to, channels, templates, scope, messageType,
        text: String(form.get("text") ?? "").trim() || null,
        title: String(form.get("title") ?? "").trim() || null,
        smsBackup: form.get("smsBackup") === "on" && messageType !== "general",
        backupTemplateId: /^[0-9a-f-]{36}$/.test(String(form.get("backupTemplateId") ?? "")) ? String(form.get("backupTemplateId")) : null,
        emergency: form.get("emergency") === "on" && access.canEmergency,
      };
  // Until the message is typed, a stand-in text lets the count and cost be worked out; the preview then shows no text.
  const TYPE_HERE = "\u2060";
  const stood = !read.ok && !input.text;
  if (stood) input.text = TYPE_HERE;
  if (!read.ok && !input.title) input.title = TYPE_HERE;
  try {
    const preview = await withSchool(current.ctx, async (tx) => previewOf(await planMessage(tx, current.ctx, input), input));
    for (const row of preview.samples) {
      if (row.title === TYPE_HERE) row.title = null;
      if (stood && row.text.includes(TYPE_HERE)) row.text = "";
    }
    return { preview, errors: read.ok ? {} : read.errors };
  } catch (e) {
    if (e instanceof MessagingProblem) return { preview: null, errors: { kinds: e.message } };
    throw e;
  }
}

export type TranslateState = {
  ok: boolean;
  message?: string;
  /** The English the versions were made from (translationKey), sent back with the confirmed versions. */
  from?: string;
  versions?: { language: TranslationLanguage; name: string; text: string; title: string | null; problem: string | null; messages: number }[];
};

/**
 * "Translate for parents" (G40): the typed text, translated once for each language the chosen parents
 * read on WhatsApp, email or the app. Nothing is sent or saved; the sender reads and edits each version.
 */
export async function translateForParents(form: FormData): Promise<TranslateState> {
  const { current, scope } = await commAction("create");
  if (!aiReady(current, "ai-translation")) {
    const off = aiOffReason(current, "ai-translation");
    return { ok: false, message: off ? AI_REASON_WORDS[off] : AI_REASON_WORDS["not-connected"] };
  }
  const read = readSendForm(form, current.school.timeZone);
  if (!read.ok) return { ok: false, message: Object.values(read.errors)[0] ?? "Fill in the message first." };
  const text = (read.input.text ?? "").trim();
  if (!text) return { ok: false, message: "Type the message first. Templates use their own language versions and are not translated." };
  const input: SendInput = { ...read.input, to: onCampus(read.input.to, scope), scope, translations: null };
  let languages: { language: TranslationLanguage; messages: number }[];
  try {
    const plan = await withSchool(current.ctx, (tx) => planMessage(tx, current.ctx, input));
    languages = (plan.languages ?? []).map((l) => ({ language: l.language, messages: l.messages }));
  } catch (e) {
    if (e instanceof MessagingProblem) return { ok: false, message: e.message };
    throw e;
  }
  if (!languages.length) return { ok: false, message: "Every parent chosen reads English, or gets this by SMS or a template, so there is nothing to translate." };
  const english = { text, title: read.input.title ?? null };
  const versions = await translateTyped(current.ctx, english, languages.map((l) => l.language));
  return {
    ok: versions.some((v) => !v.problem),
    message: versions.every((v) => v.problem) ? versions[0].problem! : undefined,
    from: translationKey(text, english.title),
    versions: versions.map((v) => ({ ...v, messages: languages.find((l) => l.language === v.language)?.messages ?? 0 })),
  };
}

/** Save the chosen recipients as a group (inferred). */
export async function saveGroup(_prev: SendState, form: FormData): Promise<SendState> {
  const { current, scope } = await commAction("create");
  const name = String(form.get("groupName") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Give the group a name of 2 to 60 characters.", errors: { groupName: "Give the group a name of 2 to 60 characters." } };
  const chosen = readAudienceForm(form);
  if (!chosen) return { ok: false, message: "Choose who is in the group first." };
  const rule = onCampus(chosen, scope);
  delete rule.groupId;
  const msg = await withSchool(current.ctx, async (tx) => {
    const dup = await tx.recipientGroup.findFirst({ where: { schoolId: current.ctx.schoolId, archivedAt: null, name: { equals: name, mode: "insensitive" } } });
    if (dup) return `A group called "${dup.name}" already exists. Choose another name.`;
    const g = await tx.recipientGroup.create({ data: { schoolId: current.ctx.schoolId, name, rule: rule as object, createdById: current.user.id } });
    await writeAudit(tx, current.ctx, { action: "created", recordType: "Recipient Group", recordId: g.id, after: { name, who: await describeAudience(tx, current.ctx, rule) } });
    return null;
  });
  if (msg) return { ok: false, message: msg, errors: { groupName: msg } };
  return { ok: true, message: `Saved the group "${name}". Choose it next time under "Saved group".` };
}

/** People search for "individuals": parents, students and staff within the sender's scope. */
export async function findPeople(q: string): Promise<{ type: "guardian" | "student" | "staff"; id: string; name: string; detail: string }[]> {
  const { current, scope } = await commAction("create");
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return withSchool(current.ctx, async (tx) => {
    const digits = term.replace(/\D/g, "");
    // This year of each campus (only the sender's campus when limited to one): a school with two campuses has two current years.
    const years = await yearsFor(tx, current.ctx, scope.campusId ?? null);
    const yearIds = years.map((y) => y.id);
    const campusOfYear = new Map(years.map((y) => [y.id, y.campusId]));
    const inScope = (e: { sectionId: string; academicYearId: string }) =>
      (!scope.campusId || campusOfYear.get(e.academicYearId) === scope.campusId) && (scope.sectionIds === "all" || scope.sectionIds.includes(e.sectionId));
    // The one student search, within the sender's sections and campus (parents are found just below).
    const sections = scope.sectionIds === "all" ? {} : yearIds.length ? { enrolments: { some: { academicYearId: { in: yearIds }, archivedAt: null, sectionId: { in: scope.sectionIds } } } } : { id: { in: [] } };
    const reach = scope.campusId ? { AND: [sections, { campusId: scope.campusId }] } : sections;
    const students = await findStudents(tx, term, { scope: reach, yearId: yearIds.length ? yearIds : null, campusId: scope.campusId ?? null, statuses: ["ACTIVE", "ADMITTED"], byParent: false, take: 8 });
    const guardians = await tx.guardian.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] },
      take: 8, select: { id: true, name: true, phone: true, relationship: true, students: { where: { archivedAt: null }, select: { studentId: true, student: { select: { fullName: true } } } } },
    });
    const genrol = yearIds.length ? await tx.enrolment.findMany({ where: { academicYearId: { in: yearIds }, archivedAt: null, studentId: { in: guardians.flatMap((g) => g.students.map((s) => s.studentId)) } }, select: { studentId: true, sectionId: true, academicYearId: true } }) : [];
    const staff = scope.staff ? await tx.staff.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, fullName: { contains: term, mode: "insensitive" }, ...(scope.campusId ? { campusId: scope.campusId } : {}) }, take: 6, select: { id: true, fullName: true, designation: true } }) : [];
    return [
      ...guardians
        .filter((g) => (scope.sectionIds === "all" && !scope.campusId) || g.students.some((s) => genrol.some((e) => e.studentId === s.studentId && inScope(e))))
        .map((g) => ({ type: "guardian" as const, id: g.id, name: g.name, detail: `${g.relationship}${g.students.length ? ` of ${g.students.map((s) => s.student.fullName.split(" ")[0]).join(", ")}` : ""} · ••${g.phone.slice(-4)}` })),
      ...students.map((s) => ({ type: "student" as const, id: s.id, name: s.name, detail: `Student · ${s.admissionNo}` })),
      ...staff.map((s) => ({ type: "staff" as const, id: s.id, name: s.fullName, detail: s.designation })),
    ];
  });
}
