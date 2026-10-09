// School Profile (Settings): details, logo and brand colour, board and its
// defaults, language and region, board compliance details, and campuses.
// Each section saves on its own and every change is audited.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { IMAGE_TYPES, saveFile } from "../files";
import { SettingsProblem } from "./common";
import { BOARDS, LANGUAGES, TIME_ZONES, boardDefaults, readPreferences, type Preferences } from "./profile-rules";

export * from "./profile-rules";

async function school(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId } });
  if (!s) throw new SettingsProblem("Your school was not found.");
  return s;
}

function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = v ?? null;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

export type DetailsInput = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  affiliationNumber: string | null;
  gstin: string | null;
  brandColor: string | null;
};

export async function saveDetails(tx: Tx, ctx: SchoolContext, input: DetailsInput) {
  const s = await school(tx, ctx);
  const diff = changedFields(s as unknown as Record<string, unknown>, input);
  if (!diff) return false;
  await tx.school.update({ where: { id: s.id }, data: input });
  await writeAudit(tx, ctx, { action: "changed", recordType: "School", recordId: s.id, before: diff.before as Prisma.InputJsonValue, after: diff.after as Prisma.InputJsonValue });
  return true;
}

/** Uploads a new logo (PNG or JPG). The old file is kept. */
export async function saveLogo(tx: Tx, ctx: SchoolContext, file: File) {
  const s = await school(tx, ctx);
  const saved = await saveFile(tx, ctx, { file, purpose: "school-logo", allowed: IMAGE_TYPES.filter((t) => t !== "image/webp") });
  await tx.school.update({ where: { id: s.id }, data: { logoFileId: saved.id } });
  await writeAudit(tx, ctx, { action: "changed-logo", recordType: "School", recordId: s.id, before: { logoFileId: s.logoFileId }, after: { logoFileId: saved.id, fileName: saved.fileName } });
  return saved;
}

export async function removeLogo(tx: Tx, ctx: SchoolContext) {
  const s = await school(tx, ctx);
  if (!s.logoFileId) return false;
  await tx.school.update({ where: { id: s.id }, data: { logoFileId: null } });
  await writeAudit(tx, ctx, { action: "removed-logo", recordType: "School", recordId: s.id, before: { logoFileId: s.logoFileId }, after: { logoFileId: null } });
  return true;
}

/** Chooses the board and fills its defaults (terms, grade scale, report card) for the modules to offer. */
export async function saveBoard(tx: Tx, ctx: SchoolContext, input: { board: string; secondBoard: string | null }) {
  if (!BOARDS.some((b) => b.value === input.board)) throw new SettingsProblem("Choose the board.", "board");
  if (input.secondBoard && (!BOARDS.some((b) => b.value === input.secondBoard) || input.secondBoard === input.board)) {
    throw new SettingsProblem("The second board must be a different board.", "secondBoard");
  }
  const s = await school(tx, ctx);
  const prefs = readPreferences(s.preferences);
  const next: Preferences = { ...prefs, secondBoard: input.secondBoard, boardDefaults: boardDefaults(input.board) };
  if (s.board === input.board && (prefs.secondBoard ?? null) === input.secondBoard) return false;
  await tx.school.update({ where: { id: s.id }, data: { board: input.board, preferences: next as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, {
    action: "changed-board",
    recordType: "School",
    recordId: s.id,
    before: { board: s.board, secondBoard: prefs.secondBoard ?? null },
    after: { board: input.board, secondBoard: input.secondBoard, defaults: next.boardDefaults as Prisma.InputJsonValue },
  });
  return true;
}

export async function saveRegion(tx: Tx, ctx: SchoolContext, input: { languages: string[]; defaultLanguage: string; timeZone: string }) {
  const languages = [...new Set(input.languages)].filter((l) => LANGUAGES.some((x) => x.value === l));
  if (languages.length === 0) throw new SettingsProblem("Choose at least one language.", "languages");
  if (!languages.includes(input.defaultLanguage)) throw new SettingsProblem("The default language must be one of the languages switched on.", "defaultLanguage");
  if (!TIME_ZONES.some((t) => t.value === input.timeZone)) throw new SettingsProblem("Choose the time zone.", "timeZone");
  const s = await school(tx, ctx);
  const diff = changedFields({ languages: s.languages, defaultLanguage: s.defaultLanguage, timeZone: s.timeZone }, { languages, defaultLanguage: input.defaultLanguage, timeZone: input.timeZone });
  if (!diff) return false;
  await tx.school.update({ where: { id: s.id }, data: { languages, defaultLanguage: input.defaultLanguage, timeZone: input.timeZone } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "School", recordId: s.id, before: diff.before as Prisma.InputJsonValue, after: diff.after as Prisma.InputJsonValue });
  return true;
}

export async function saveCompliance(tx: Tx, ctx: SchoolContext, input: Preferences["compliance"]) {
  const s = await school(tx, ctx);
  const prefs = readPreferences(s.preferences);
  const diff = changedFields((prefs.compliance ?? {}) as Record<string, unknown>, input ?? {});
  if (!diff) return false;
  await tx.school.update({ where: { id: s.id }, data: { preferences: { ...prefs, compliance: input } as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, { action: "changed-compliance", recordType: "School", recordId: s.id, before: diff.before as Prisma.InputJsonValue, after: diff.after as Prisma.InputJsonValue });
  return true;
}

// ---------------------------------------------------------------- Campuses

export type CampusInput = { name: string; address: string | null; phone: string | null; headName: string | null };

async function campusNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.campus.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw new SettingsProblem(`There is already a campus called ${clash.name}.`, "name");
}

export async function addCampus(tx: Tx, ctx: SchoolContext, input: CampusInput) {
  await campusNameFree(tx, input.name);
  const live = await tx.campus.count({ where: { archivedAt: null } });
  const c = await tx.campus.create({ data: { schoolId: ctx.schoolId, ...input, isMain: live === 0, createdById: ctx.userId, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Campus", recordId: c.id, after: input });
  return c;
}

export async function editCampus(tx: Tx, ctx: SchoolContext, id: string, input: CampusInput) {
  const c = await tx.campus.findUnique({ where: { id } });
  if (!c || c.archivedAt) throw new SettingsProblem("This campus was not found.");
  await campusNameFree(tx, input.name, id);
  const diff = changedFields(c as unknown as Record<string, unknown>, input);
  if (!diff) return false;
  await tx.campus.update({ where: { id }, data: { ...input, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Campus", recordId: id, before: diff.before as Prisma.InputJsonValue, after: diff.after as Prisma.InputJsonValue });
  return true;
}

export async function makeMainCampus(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.campus.findUnique({ where: { id } });
  if (!c || c.archivedAt) throw new SettingsProblem("This campus was not found.");
  if (c.isMain) return false;
  const old = await tx.campus.findFirst({ where: { isMain: true, archivedAt: null } });
  await tx.campus.updateMany({ where: { isMain: true }, data: { isMain: false } });
  await tx.campus.update({ where: { id }, data: { isMain: true, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "made-main-campus", recordType: "Campus", recordId: id, before: { main: old?.name ?? null }, after: { main: c.name } });
  return true;
}

/** Records that still sit in a campus; a campus with any of them cannot be archived. */
export async function campusInUse(tx: Tx, id: string) {
  const [students, staff, years, access] = await Promise.all([
    tx.student.count({ where: { campusId: id, archivedAt: null } }),
    tx.staff.count({ where: { campusId: id, archivedAt: null } }),
    tx.academicYear.count({ where: { campusId: id } }),
    tx.schoolAccess.count({ where: { campusId: id, archivedAt: null } }),
  ]);
  return { students, staff, years, access };
}

export async function archiveCampus(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.campus.findUnique({ where: { id } });
  if (!c || c.archivedAt) throw new SettingsProblem("This campus was not found.");
  if (c.isMain) throw new SettingsProblem(`${c.name} is the main campus. Make another campus the main one first.`);
  const use = await campusInUse(tx, id);
  const parts = [
    use.students && `${use.students} student${use.students === 1 ? "" : "s"}`,
    use.staff && `${use.staff} staff`,
    use.years && `${use.years} academic year${use.years === 1 ? "" : "s"}`,
    use.access && `${use.access} login${use.access === 1 ? "" : "s"} limited to it`,
  ].filter(Boolean);
  if (parts.length) throw new SettingsProblem(`${c.name} still has ${parts.join(", ")}. Move them to another campus first.`);
  await tx.campus.update({ where: { id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Campus", recordId: id, before: { name: c.name } });
  return c;
}

export async function restoreCampus(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.campus.findUnique({ where: { id } });
  if (!c || !c.archivedAt) throw new SettingsProblem("This campus is not archived.");
  await campusNameFree(tx, c.name, id);
  await tx.campus.update({ where: { id }, data: { archivedAt: null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Campus", recordId: id, after: { name: c.name } });
  return c;
}
