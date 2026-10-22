// Consent from paper forms (gap list G42; DPDP Act 2023, D8a; workflow 15).
// A school arriving on School OS already holds consent forms its parents
// signed on paper: data consent, photo consent, APAAR consent. The office
// records them here, one row per child, parent and consent, from a file on
// the one import engine, or class by class on Settings, Data Backup &
// Security, Consent ("paper forms received"). Each becomes a Consent Record
// marked "paper-form", with the date on the form, the text version and who
// recorded it. A "no" on the form is kept as a refusal.
//
// Nothing already on record is ever replaced: a parent who has given consent
// (in Parent Link, on the application form or on paper) keeps that record,
// and a newer answer (a withdrawal, say) is never overwritten by an older
// form. Withdrawal stays possible as before. Undo archives what an import
// made. Imported by src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, runImport, type ImportKind, type RowChoice } from "../importer";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { campusLimitOf } from "../staff/campus-logins";
import { parseDateText } from "../staff/import";
import { todayIn } from "../staff/dates";
import { OPEN_LINK } from "./guardian-access";
import { consentHowWords } from "./labels";

export const PAPER_CONSENTS = "consent-paper-forms";

/** The consent purposes a paper form can carry (Settings, Data Backup & Security, Consent), with the words offices write for them. */
const TYPE_WORDS: Record<string, string[]> = {
  "data-processing": ["data", "data consent", "data processing", "dpdp", "dpdp act", "use of data", "use of the child's data", "data use"],
  photo: ["photo", "photos", "photo consent", "photograph", "photographs", "gallery"],
  apaar: ["apaar", "apaar id", "apaar consent", "apaar id consent"],
  "message-opt-in": ["message", "messages", "message opt-in", "messages opt-in", "whatsapp", "sms", "whatsapp and sms"],
};
const YES = ["yes", "y", "given", "agreed", "agree", "signed", "consent given", "accepted", "ok"];
const NO = ["no", "n", "refused", "not given", "declined", "did not agree", "refuse", "denied"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
const shown = (d: Date) => formatDate(d, "UTC");

export type PaperConsent = {
  studentId: string;
  studentName: string;
  guardianId: string;
  guardianName: string;
  consentType: string;
  consentTextId: string;
  textVersion: number;
  refused: boolean;
  formDate: Date;
};

/** The consent type a cell names, from the school's own consent types; null when none matches. */
export function consentTypeOf(raw: string, types: { consentType: string; title: string }[]): string | null {
  const v = norm(raw);
  if (!v) return null;
  for (const t of types) {
    if (norm(t.consentType) === v || norm(t.title) === v) return t.consentType;
    if ((TYPE_WORDS[t.consentType] ?? []).includes(v)) return t.consentType;
    if (t.consentType.startsWith("custom-") && norm(t.consentType.slice(7)) === v) return t.consentType;
  }
  // Ready purposes the school has no text for yet are still known, so the row can say what is missing.
  for (const [key, words] of Object.entries(TYPE_WORDS)) if (words.includes(v) || norm(key) === v) return key;
  return null;
}

/** Given or refused, from the answer cell; null when it says neither. */
export function answerOf(raw: string): "given" | "refused" | null {
  const v = norm(raw);
  if (YES.includes(v)) return "given";
  if (NO.includes(v)) return "refused";
  return null;
}

const TYPE_NAME: Record<string, string> = { "data-processing": "data consent", photo: "photo consent", apaar: "APAAR consent", "message-opt-in": "messages opt-in" };
const typeName = (key: string, title?: string) => TYPE_NAME[key] ?? title ?? key.replace(/^custom-/, "").replace(/-/g, " ");

/**
 * Why this answer cannot be recorded, or null when it can: nothing already
 * on record is replaced. A standing consent stays; a newer answer on record
 * (a withdrawal, a later form) is never overwritten by an older paper form.
 */
export async function paperConflict(tx: Tx, ctx: SchoolContext, c: { studentId: string; studentName: string; guardianId: string; guardianName: string; consentType: string; refused: boolean; formDate: Date }) {
  const latest = await tx.consentRecord.findFirst({
    where: { schoolId: ctx.schoolId, guardianId: c.guardianId, studentId: c.studentId, consentType: c.consentType, archivedAt: null },
    orderBy: [{ givenAt: "desc" }],
  });
  if (!latest) return null;
  const what = typeName(c.consentType);
  if (!latest.withdrawnAt) {
    return c.refused
      ? `${c.guardianName} has already given ${what} for ${c.studentName} (${shown(latest.givenAt)}, ${consentHowWords(latest.how).toLowerCase()}). A paper form does not take it back: if the parent wants to withdraw, record the withdrawal on the parent's page.`
      : `${c.guardianName} has already given ${what} for ${c.studentName} (${shown(latest.givenAt)}, ${consentHowWords(latest.how).toLowerCase()}). Nothing to record.`;
  }
  const answeredOn = latest.refused ? latest.givenAt : latest.withdrawnAt;
  if (answeredOn.getTime() > c.formDate.getTime()) {
    const what2 = latest.refused ? `refused on a paper form dated ${shown(latest.givenAt)}` : `withdrawn on ${shown(latest.withdrawnAt)}`;
    return `A newer answer from ${c.guardianName} is on record (${what2}). A form dated ${shown(c.formDate)} cannot replace it.`;
  }
  if (latest.refused && c.refused && latest.givenAt.getTime() === c.formDate.getTime()) return `This refusal is already recorded for ${c.studentName}.`;
  return null;
}

/** Saves one paper answer as a Consent Record marked "paper-form", with who recorded it. */
export async function savePaperConsent(tx: Tx, ctx: SchoolContext, v: PaperConsent) {
  // Checked again on saving: another import or Parent Link may have answered since the check.
  const why = await paperConflict(tx, ctx, v);
  if (why) throw new RowProblem(why);
  const row = await tx.consentRecord.create({
    data: {
      schoolId: ctx.schoolId, guardianId: v.guardianId, studentId: v.studentId, consentType: v.consentType,
      consentTextId: v.consentTextId, textVersion: v.textVersion, givenAt: v.formDate, how: "paper-form",
      refused: v.refused, ...(v.refused ? { withdrawnAt: v.formDate, withdrawnHow: "refused on a paper form" } : {}),
      createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: v.refused ? "consent-refused-on-paper" : "consent-recorded-from-paper",
    recordType: "Consent Record", recordId: row.id,
    after: { student: v.studentName, guardian: v.guardianName, type: v.consentType, version: v.textVersion, answer: v.refused ? "Refused" : "Given", dateOnForm: shown(v.formDate), how: "Recorded from a paper form" },
  });
  return row;
}

/** Undo: the records are kept, archived, and withdrawn so they never count as standing consent. */
export async function undoPaperConsents(tx: Tx, ctx: SchoolContext, ids: string[]) {
  const now = new Date();
  await tx.consentRecord.updateMany({ where: { id: { in: ids }, how: "paper-form", withdrawnAt: null }, data: { withdrawnAt: now, withdrawnHow: "import undone" } });
  const { count } = await tx.consentRecord.updateMany({ where: { id: { in: ids }, how: "paper-form", archivedAt: null }, data: { archivedAt: now } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Consent Record", recordId: null, after: { reason: "Import undone", records: count, how: "Recorded from a paper form" } });
}

type Text = { id: string; consentType: string; title: string; version: number; isCurrent: boolean };

async function textsOf(tx: Tx, ctx: SchoolContext): Promise<Text[]> {
  return tx.consentText.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, consentType: true, title: true, version: true, isCurrent: true }, orderBy: [{ consentType: "asc" }, { version: "desc" }] });
}

/** The text the form carried: the version written on the row, else the current one. */
function textFor(texts: Text[], consentType: string, version: number | null) {
  const mine = texts.filter((t) => t.consentType === consentType);
  return version === null ? mine.find((t) => t.isCurrent) ?? null : mine.find((t) => t.version === version) ?? null;
}

function makeKind(): ImportKind<PaperConsent> {
  // Looked up once for each check of a file.
  const memo = new WeakMap<Set<string>, { texts: Promise<Text[]>; today: Promise<Date>; limit: Promise<string | null> }>();
  const lookups = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let m = memo.get(seen);
    if (!m) {
      m = {
        texts: textsOf(tx, ctx),
        today: tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } }).then((s) => todayIn(s?.timeZone)),
        limit: campusLimitOf(tx, ctx),
      };
      memo.set(seen, m);
    }
    return m;
  };
  return {
    key: PAPER_CONSENTS,
    label: "Consent from paper forms",
    columns: [
      { key: "admissionNo", label: "Admission number", required: true, example: "SPS/2021/0451", aliases: ["admission no", "adm no", "admn no", "sr no", "student id"] },
      { key: "parent", label: "Parent", example: "Srinivas Kumar", help: "The parent who signed: their name, mobile number, or Father or Mother. Leave empty when the child has one parent on record.", aliases: ["parent name", "guardian", "guardian name", "signed by", "father or mother", "parent phone", "parent mobile"] },
      { key: "consent", label: "Consent", required: true, example: "Data consent", help: "Which consent the form is for: Data consent, Photo consent, APAAR consent, Messages, or the name of your school's own consent. One row for each consent.", aliases: ["consent type", "type", "purpose", "form"] },
      { key: "answer", label: "Answer", required: true, example: "Given", help: "Given (the parent agreed) or Refused (the parent said no).", aliases: ["given", "consent given", "status", "agreed", "yes or no"] },
      { key: "formDate", label: "Date on the form", required: true, example: "12-06-2026", help: "The date the parent signed, DD-MM-YYYY.", aliases: ["date", "signed on", "form date", "date signed", "consent date"] },
      { key: "version", label: "Version on the form", example: "1", help: "The version of the consent text printed on the form. Leave empty for the current version.", aliases: ["version", "text version"] },
    ],
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen, place) {
      const problems: string[] = [];
      const l = lookups(tx, ctx, seen);
      const [texts, today, limit] = await Promise.all([l.texts, l.today, l.limit]);
      const no = (row.admissionNo ?? "").trim();
      // One campus: a student of another campus reads as "no student", as on the other student imports.
      const student = no ? await tx.student.findFirst({ where: { admissionNo: { equals: no, mode: "insensitive" }, archivedAt: null, ...(limit ? { campusId: limit } : {}) }, select: { id: true, fullName: true } }) : null;
      if (no && !student) problems.push(`No student with admission number "${no}".`);

      const typeKey = consentTypeOf(row.consent ?? "", texts);
      if ((row.consent ?? "").trim() && !typeKey) problems.push(`"${row.consent}" is not one of your consents. Write Data consent, Photo consent, APAAR consent, Messages, or your own consent's name.`);
      const answer = answerOf(row.answer ?? "");
      if ((row.answer ?? "").trim() && !answer) problems.push(`Answer must be Given or Refused, not "${row.answer}".`);
      const formDate = (row.formDate ?? "").trim() ? parseDateText(row.formDate) : null;
      if ((row.formDate ?? "").trim() && !formDate) problems.push("Date on the form must be a date like 12-06-2026.");
      if (formDate && formDate.getTime() > today.getTime()) problems.push(`Date on the form (${shown(formDate)}) cannot be after today.`);
      const rawVersion = (row.version ?? "").trim().replace(/^v(ersion)?\s*/i, "");
      const version = rawVersion ? (/^\d{1,3}$/.test(rawVersion) ? Number(rawVersion) : NaN) : null;
      if (Number.isNaN(version)) problems.push(`Version on the form must be a number like 1, not "${row.version}".`);
      let text: Text | null = null;
      if (typeKey && !Number.isNaN(version)) {
        text = textFor(texts, typeKey, version);
        if (!text) {
          const has = texts.some((t) => t.consentType === typeKey);
          problems.push(has ? `There is no version ${version} of the ${typeName(typeKey)} text. Leave the version empty for the current one.` : `There is no ${typeName(typeKey)} text yet. Add it in Settings, Data Backup & Security, Consent, then bring this row in.`);
        }
      }
      if (!student) return { ok: false, problems };

      // The parent who signed: one of the child's parents on record, never one with a custody restriction for this child.
      const links = await tx.studentGuardian.findMany({ where: { studentId: student.id, archivedAt: null, guardian: { archivedAt: null } }, include: { guardian: { select: { id: true, name: true, phone: true, relationship: true } } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
      const open = links.filter((x) => x.restriction === null);
      const who = (row.parent ?? "").trim();
      let guardian: { id: string; name: string } | null = null;
      let choices: RowChoice[] | undefined;
      const picked = place?.decision?.startsWith("guardian:") ? place.decision.slice(9) : null;
      const matches = (x: (typeof links)[number]) => {
        if (!who) return false;
        if (digits(who).length === 10) return digits(x.guardian.phone ?? "") === digits(who);
        const w = norm(who);
        return norm(x.guardian.name) === w || norm(x.relationship ?? "") === w || norm(x.guardian.relationship ?? "") === w;
      };
      if (picked && open.some((x) => x.guardianId === picked)) guardian = open.map((x) => x.guardian).find((g) => g.id === picked)!;
      else if (who) {
        const found = links.filter(matches);
        if (found.length === 1 && found[0].restriction !== null) problems.push(`${found[0].guardian.name} has a custody restriction for ${student.fullName}, so their consent cannot be recorded for this child.`);
        else if (found.length === 1) guardian = found[0].guardian;
        else if (found.length > 1) {
          problems.push(`More than one parent of ${student.fullName} matches "${who}". Choose who signed.`);
          choices = open.filter(matches).map((x) => ({ value: `guardian:${x.guardianId}`, label: `${x.guardian.name} (${x.relationship ?? x.guardian.relationship ?? "Parent"})` }));
        } else problems.push(`No parent of ${student.fullName} matches "${who}". Write the parent's name or mobile as on record, or Father or Mother.`);
      } else if (open.length === 1) guardian = open[0].guardian;
      else if (open.length === 0) problems.push(`${student.fullName} has no parent on record who can give consent. Add the parent in Student Management first.`);
      else {
        problems.push(`${student.fullName} has ${open.length} parents on record. Choose who signed, or write their name in the Parent column.`);
        choices = open.map((x) => ({ value: `guardian:${x.guardianId}`, label: `${x.guardian.name} (${x.relationship ?? x.guardian.relationship ?? "Parent"})` }));
      }

      if (guardian && typeKey) {
        const key = `${student.id}:${guardian.id}:${typeKey}`;
        if (seen.has(key)) problems.push(`${student.fullName}'s ${typeName(typeKey)} from ${guardian.name} is twice in the file. Keep one row.`);
        seen.add(key);
      }
      if (problems.length || !guardian || !typeKey || !answer || !formDate || !text) return { ok: false, problems, ...(choices?.length ? { choices } : {}) };
      const value: PaperConsent = { studentId: student.id, studentName: student.fullName, guardianId: guardian.id, guardianName: guardian.name, consentType: typeKey, consentTextId: text.id, textVersion: text.version, refused: answer === "refused", formDate };
      const clash = await paperConflict(tx, ctx, value);
      if (clash) return { ok: false, problems: [clash] };
      return { ok: true, value };
    },
    async save(tx, ctx, v) {
      const row = await savePaperConsent(tx, ctx, v);
      return { id: row.id, created: true };
    },
    undo: undoPaperConsents,
  };
}

defineImport(makeKind());

// ── Class by class: "paper forms received" (Settings, Data Backup & Security, Consent) ──

/** A section's students for marking paper forms: each with the parent who would be recorded and whether an answer is already on record. */
export async function paperFormSheet(tx: Tx, ctx: SchoolContext, input: { sectionId: string; consentType: string; campusId?: string | null }) {
  const enrolments = await tx.enrolment.findMany({
    where: { sectionId: input.sectionId, archivedAt: null, status: "STUDYING", student: { archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}) } },
    include: { student: { select: { id: true, fullName: true, admissionNo: true } } },
    orderBy: [{ rollNo: "asc" }, { student: { fullName: "asc" } }],
  });
  const ids = enrolments.map((e) => e.studentId);
  const links = await tx.studentGuardian.findMany({ where: { studentId: { in: ids }, ...OPEN_LINK, guardian: { archivedAt: null } }, include: { guardian: { select: { id: true, name: true } } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  const records = await tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, studentId: { in: ids }, consentType: input.consentType, archivedAt: null }, orderBy: { givenAt: "desc" } });
  return enrolments.map((e) => {
    const parent = links.find((l) => l.studentId === e.studentId)?.guardian ?? null;
    const mine = parent ? records.filter((r) => r.guardianId === parent.id) : [];
    const latest = mine[0] ?? null;
    const state = !latest ? "none" : !latest.withdrawnAt ? "given" : latest.refused ? "refused" : "withdrawn";
    return { studentId: e.studentId, name: e.student.fullName, admissionNo: e.student.admissionNo, rollNo: e.rollNo, parent, state, how: latest?.how ?? null, on: latest?.givenAt ?? null };
  });
}

/**
 * Marks the chosen students' paper forms received, for one consent: each is
 * recorded for the child's first parent on record (the primary contact), as
 * given on the date of the forms. Brought in as one import, so Import history
 * shows it and Undo takes it back. Students with an answer already on record
 * are left as they are, with the reason.
 */
export async function markPaperFormsReceived(tx: Tx, ctx: SchoolContext, input: { sectionId: string; sectionLabel: string; consentType: string; formDate: Date; studentIds: string[]; campusId?: string | null }) {
  if (!input.studentIds.length) throw new RowProblem("Tick the students whose signed forms you have.");
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  if (input.formDate.getTime() > todayIn(s?.timeZone).getTime()) throw new RowProblem("The date on the forms cannot be after today.");
  const text = await tx.consentText.findFirst({ where: { schoolId: ctx.schoolId, consentType: input.consentType, isCurrent: true }, orderBy: { version: "desc" } });
  if (!text) throw new RowProblem(`There is no ${typeName(input.consentType)} text yet. Add it on this page first.`);
  const sheet = await paperFormSheet(tx, ctx, input);
  const kind = importKind();
  const good: { line: number; value: PaperConsent; row: Record<string, string> }[] = [];
  const bad: { line: number; row: Record<string, string>; problems: string[] }[] = [];
  let line = 1;
  for (const id of input.studentIds) {
    line++;
    const st = sheet.find((x) => x.studentId === id);
    const row = { admissionNo: st?.admissionNo ?? "", parent: st?.parent?.name ?? "", consent: text.title, answer: "Given", formDate: shown(input.formDate), version: String(text.version) };
    if (!st) { bad.push({ line, row, problems: ["This student is not in the class chosen."] }); continue; }
    if (!st.parent) { bad.push({ line, row, problems: [`${st.name} has no parent on record who can give consent.`] }); continue; }
    const value: PaperConsent = { studentId: st.studentId, studentName: st.name, guardianId: st.parent.id, guardianName: st.parent.name, consentType: input.consentType, consentTextId: text.id, textVersion: text.version, refused: false, formDate: input.formDate };
    const clash = await paperConflict(tx, ctx, value);
    if (clash) bad.push({ line, row, problems: [clash] });
    else good.push({ line, value, row });
  }
  const batch = await runImport(tx, ctx, kind, `${text.title}, ${input.sectionLabel}: paper forms received`, { good, bad, left: [] });
  return { batchId: batch.id, recorded: batch.added, skipped: batch.skipped, reasons: (batch.errorReport as { problems: string[] }[]).map((b) => b.problems.join(" ")) };
}

let registered: ImportKind<PaperConsent> | null = null;
function importKind() {
  registered ??= makeKind();
  return registered;
}
