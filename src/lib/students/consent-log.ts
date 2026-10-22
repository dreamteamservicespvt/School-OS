// The consent log view (20-settings.md, Data Backup & Security, Consent;
// 11-communication.md §8): for each consent type and class, how many
// students' consent is given, waiting, refused, withdrawn or not asked yet,
// and how many of the given ones were recorded from paper forms (gap list
// G42). A student counts as given while any parent on record (not one with a
// custody restriction) has a standing consent: a guardian's consent for a
// minor, as APAAR asks. Read-only.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYearIds } from "../academic/years";
import { OPEN_LINK } from "./guardian-access";

export type ConsentCounts = { total: number; given: number; fromPaper: number; waiting: number; refused: number; withdrawn: number; notAsked: number };
export type ConsentLogType = { consentType: string; title: string; version: number; totals: ConsentCounts; classes: (ConsentCounts & { classId: string; className: string })[] };

const zero = (): ConsentCounts => ({ total: 0, given: 0, fromPaper: 0, waiting: 0, refused: 0, withdrawn: 0, notAsked: 0 });

/** One student's state for one consent type, from their parents' latest records and the open requests. */
type State = "given-paper" | "given" | "waiting" | "refused" | "withdrawn" | "not-asked";

export async function consentLog(tx: Tx, ctx: SchoolContext, opts: { campusId?: string | null } = {}): Promise<ConsentLogType[]> {
  const texts = await tx.consentText.findMany({ where: { schoolId: ctx.schoolId, isCurrent: true }, orderBy: [{ consentType: "asc" }, { version: "desc" }] });
  if (!texts.length) return [];
  const yearIds = await currentYearIds(tx, ctx);
  const enrolments = await tx.enrolment.findMany({
    where: { academicYearId: { in: yearIds }, archivedAt: null, status: "STUDYING", student: { archivedAt: null, ...(opts.campusId ? { campusId: opts.campusId } : {}) } },
    select: { studentId: true, classId: true },
  });
  const ids = enrolments.map((e) => e.studentId);
  const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(enrolments.map((e) => e.classId))] } }, select: { id: true, name: true, sortOrder: true } });
  const links = ids.length ? await tx.studentGuardian.findMany({ where: { studentId: { in: ids }, ...OPEN_LINK, guardian: { archivedAt: null } }, select: { studentId: true, guardianId: true } }) : [];
  const records = ids.length ? await tx.consentRecord.findMany({ where: { schoolId: ctx.schoolId, studentId: { in: ids }, archivedAt: null }, orderBy: { givenAt: "desc" } }) : [];
  const today = new Date(new Date().toISOString().slice(0, 10));
  const requests = await tx.consentRequest.findMany({ where: { schoolId: ctx.schoolId, replyBy: { gte: today } }, select: { consentType: true, guardianIds: true } });

  const parentsOf = new Map<string, string[]>();
  for (const l of links) parentsOf.set(l.studentId, [...(parentsOf.get(l.studentId) ?? []), l.guardianId]);
  const asked = new Map<string, Set<string>>();
  for (const r of requests) {
    const s = asked.get(r.consentType) ?? new Set<string>();
    r.guardianIds.forEach((g) => s.add(g));
    asked.set(r.consentType, s);
  }
  const latest = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    const k = `${r.studentId}:${r.guardianId}:${r.consentType}`;
    if (!latest.has(k)) latest.set(k, r);
  }

  const seenType = new Set<string>();
  const out: ConsentLogType[] = [];
  for (const t of texts) {
    if (seenType.has(t.consentType)) continue;
    seenType.add(t.consentType);
    const byClass = new Map<string, ConsentCounts>();
    const totals = zero();
    for (const e of enrolments) {
      const parents = parentsOf.get(e.studentId) ?? [];
      const mine = parents.map((g) => latest.get(`${e.studentId}:${g}:${t.consentType}`)).filter((r) => r !== undefined);
      const standing = mine.find((r) => !r.withdrawnAt);
      let state: State;
      if (standing) state = standing.how === "paper-form" ? "given-paper" : "given";
      else if (parents.some((g) => asked.get(t.consentType)?.has(g))) state = "waiting";
      else if (mine.some((r) => !r.refused && r.withdrawnHow !== "replaced by a newer version")) state = "withdrawn";
      else if (mine.some((r) => r.refused)) state = "refused";
      else state = "not-asked";
      const c = byClass.get(e.classId) ?? zero();
      for (const x of [c, totals]) {
        x.total++;
        if (state === "given" || state === "given-paper") x.given++;
        if (state === "given-paper") x.fromPaper++;
        if (state === "waiting") x.waiting++;
        if (state === "refused") x.refused++;
        if (state === "withdrawn") x.withdrawn++;
        if (state === "not-asked") x.notAsked++;
      }
      byClass.set(e.classId, c);
    }
    out.push({
      consentType: t.consentType, title: t.title, version: t.version, totals,
      classes: classes
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .filter((c) => byClass.has(c.id))
        .map((c) => ({ classId: c.id, className: c.name, ...byClass.get(c.id)! })),
    });
  }
  return out;
}
