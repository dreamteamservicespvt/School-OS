// A parent the person may open: linked to at least one of their students
// (everyone, for people who see all students of the whole school). And Parent
// 360, everything the parent page shows, read once within what the person may see.
import "server-only";

import type { Tx } from "@/lib/db";
import { currentEnrolments } from "@/lib/academic/years";
import { abilities, studentScope, type Who } from "@/lib/students/access";
import { consentRows } from "@/lib/students/consent";
import { parentLinkStatus } from "@/lib/students/guardians";
// Communication's Parent Link provider (registerParentLink), so the status is there even when only this file is loaded.
import "@/lib/students/provider-modules";
import { listFacts, type ListFacts } from "@/lib/students/hooks";
import { seesStudentFees } from "@/lib/fees/access";
import { recentPayments } from "@/lib/fees/student-facts";
import { sectionNames } from "../_lib/queries";

export async function visibleGuardianFor(tx: Tx, who: Who, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const all = abilities(who).reach === "all" && !who.campusId;
  const scope = await studentScope(tx, who);
  return tx.guardian.findFirst({ where: { id, ...(all ? {} : { students: { some: { archivedAt: null, student: scope } } }) } });
}

/**
 * Parent 360 (03 §2, Parents & Guardians): the children, each with their
 * class this year, attendance and fees, the fees due and latest payments for
 * all children, consents, documents and Parent Link. Someone who sees only
 * their own students (a teacher) sees only those children here, as on the
 * Student Profile, where teachers see no brothers and sisters. Fees only for
 * people allowed to see them.
 */
export async function loadParent360(tx: Tx, who: Who, id: string, o: { yearId: string | null; seeDocuments: boolean; parentLink: boolean }) {
  const g = await visibleGuardianFor(tx, who, id);
  if (!g) return null;
  // A "One campus" login sees only that campus's children, even with whole-school reach.
  const all = abilities(who).reach === "all" && !who.campusId;
  const scope = all ? {} : await studentScope(tx, who);
  const links = await tx.studentGuardian.findMany({
    where: { guardianId: id, archivedAt: null, ...(all ? {} : { student: scope }) },
    orderBy: { createdAt: "asc" },
    include: { student: true },
  });
  const kidIds = links.map((l) => l.studentId);
  // Each child's class this year (MONEY-01): the enrolment in the active year, else the newest.
  const enrolments = await currentEnrolments(tx, kidIds);
  const names = await sectionNames(tx, [...enrolments.values()].map((e) => e.sectionId));
  // Facts for each child's own year: children on two campuses can be in two years.
  const byYear = new Map<string, string[]>();
  for (const sid of kidIds) {
    const y = enrolments.get(sid)?.academicYearId ?? o.yearId;
    if (y) byYear.set(y, [...(byYear.get(y) ?? []), sid]);
  }
  const facts = new Map<string, ListFacts>();
  let shows = (await listFacts(tx, who, [], null)).shows;
  for (const [yearId, ids] of byYear) {
    const part = await listFacts(tx, who, ids, yearId);
    shows = part.shows;
    for (const [sid, f] of part.facts) facts.set(sid, f);
  }
  const seeFees = seesStudentFees(who);
  const [consentList, docs, link, merged, payments] = await Promise.all([
    consentRows(tx, who.ctx, { guardianIds: [id] }),
    o.seeDocuments ? tx.studentDocument.findMany({ where: { guardianId: id, archivedAt: null, ...(all ? {} : { studentId: { in: kidIds } }) }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    o.parentLink ? parentLinkStatus(tx, who.ctx, [id]).then((m) => m.get(id) ?? null) : Promise.resolve(null),
    g.archivedAt ? tx.guardianMerge.findFirst({ where: { mergedId: id } }) : Promise.resolve(null),
    seeFees ? recentPayments(tx, who, kidIds) : Promise.resolve([]),
  ]);
  const consents = consentList
    .filter((c) => all || kidIds.includes(c.studentId))
    .sort((a, b) => a.studentId.localeCompare(b.studentId) || a.consentType.localeCompare(b.consentType));
  const texts = await tx.consentText.findMany({ where: { id: { in: consents.map((c) => c.consentTextId).filter((x): x is string => Boolean(x)) } } });
  const kids = links.map((l) => {
    const e = enrolments.get(l.studentId) ?? null;
    return { ...l, enrolment: e, section: e ? names.get(e.sectionId) ?? null : null, fact: facts.get(l.studentId) };
  });
  return { g, kids, consents, texts, docs, link, merged, payments, shows: { ...shows, fees: shows.fees && seeFees } };
}

export type Parent360 = NonNullable<Awaited<ReturnType<typeof loadParent360>>>;
