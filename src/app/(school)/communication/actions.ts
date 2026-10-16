"use server";

// Send Message: check (count, cost, preview), then send or schedule.
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { writeAudit } from "@/lib/audit";
import { commAction } from "@/lib/communication/access";
import { previewOf, readAudienceForm, readSendForm, type SendPreview } from "@/lib/communication/send-form";
import { planMessage, recordSend, MessagingProblem, skippedWords, type SendInput } from "@/lib/messaging/send";
import { describeAudience } from "@/lib/messaging/recipients";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPES, FileProblem, saveFile } from "@/lib/files";
import { isChannel } from "@/lib/messaging/channels";
import { BACKUP_TYPES, type BackupType } from "@/lib/messaging/settings";

export type SendState = { ok: boolean; message?: string; errors?: Record<string, string>; preview?: SendPreview } | null;

export async function checkOrSend(_prev: SendState, form: FormData): Promise<SendState> {
  const access = await commAction("create");
  const { current, scope } = access;
  const read = readSendForm(form, current.school.timeZone);
  if (!read.ok) return { ok: false, message: Object.keys(read.errors).length === 1 ? Object.values(read.errors)[0] : `Please fix ${Object.keys(read.errors).length} things before checking.`, errors: read.errors };
  const input = { ...read.input, scope };
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
      return { preview, sent };
    });
    if (!("sent" in result) || !result.sent) {
      if ("changed" in result && result.changed) return { ok: false, message: "The recipients or cost changed since you checked. Check the new numbers, then send.", preview: result.preview };
      return { ok: true, preview: result.preview };
    }
    const s = result.sent;
    const skipped = skippedWords(s.skipped);
    await flash({
      message: s.scheduled
        ? `Scheduled for ${formatDateTime(input.scheduledAt!, current.school.timeZone)} to ${s.people} ${s.people === 1 ? "person" : "people"}. You can cancel it until then.`
        : `Sending to ${s.people} ${s.people === 1 ? "person" : "people"}.${skipped ? ` ${skipped}` : ""}`,
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
  const to = readAudienceForm(form);
  const read = readSendForm(form, current.school.timeZone);
  if (!to) return { preview: null, errors: read.ok ? {} : read.errors };
  const channels = form.getAll("channels").map(String).filter(isChannel);
  const templates = Object.fromEntries(channels.map((ch) => [ch, /^[0-9a-f-]{36}$/.test(String(form.get(`template_${ch}`) ?? "")) ? String(form.get(`template_${ch}`)) : null]));
  const typeRaw = String(form.get("messageType") ?? "general");
  const messageType: BackupType | "general" = (BACKUP_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as BackupType) : "general";
  const input: SendInput = read.ok
    ? { ...read.input, scope }
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

/** Save the chosen recipients as a group (inferred). */
export async function saveGroup(_prev: SendState, form: FormData): Promise<SendState> {
  const { current } = await commAction("create");
  const name = String(form.get("groupName") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Give the group a name of 2 to 60 characters.", errors: { groupName: "Give the group a name of 2 to 60 characters." } };
  const rule = readAudienceForm(form);
  if (!rule) return { ok: false, message: "Choose who is in the group first." };
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
    const year = await tx.academicYear.findFirst({ where: { schoolId: current.ctx.schoolId, status: "ACTIVE" }, select: { id: true } });
    const inScope = (sectionId: string | null | undefined) => scope.sectionIds === "all" || (sectionId ? scope.sectionIds.includes(sectionId) : false);
    const students = await tx.student.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] }, OR: [{ fullName: { contains: term, mode: "insensitive" } }, { admissionNo: { contains: term, mode: "insensitive" } }] },
      take: 8, select: { id: true, fullName: true, admissionNo: true },
    });
    const enrol = year ? await tx.enrolment.findMany({ where: { academicYearId: year.id, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, sectionId: true } }) : [];
    const guardians = await tx.guardian.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null, OR: [{ name: { contains: term, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] },
      take: 8, select: { id: true, name: true, phone: true, relationship: true, students: { where: { archivedAt: null }, select: { studentId: true, student: { select: { fullName: true } } } } },
    });
    const genrol = year ? await tx.enrolment.findMany({ where: { academicYearId: year.id, studentId: { in: guardians.flatMap((g) => g.students.map((s) => s.studentId)) } }, select: { studentId: true, sectionId: true } }) : [];
    const staff = scope.staff ? await tx.staff.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, fullName: { contains: term, mode: "insensitive" } }, take: 6, select: { id: true, fullName: true, designation: true } }) : [];
    return [
      ...guardians
        .filter((g) => scope.sectionIds === "all" || g.students.some((s) => inScope(genrol.find((e) => e.studentId === s.studentId)?.sectionId)))
        .map((g) => ({ type: "guardian" as const, id: g.id, name: g.name, detail: `${g.relationship}${g.students.length ? ` of ${g.students.map((s) => s.student.fullName.split(" ")[0]).join(", ")}` : ""} · ••${g.phone.slice(-4)}` })),
      ...students.filter((s) => inScope(enrol.find((e) => e.studentId === s.id)?.sectionId)).map((s) => ({ type: "student" as const, id: s.id, name: s.fullName, detail: `Student · ${s.admissionNo}` })),
      ...staff.map((s) => ({ type: "staff" as const, id: s.id, name: s.fullName, detail: s.designation })),
    ];
  });
}
