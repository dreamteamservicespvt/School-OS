// The student timeline (03 §2): everything that happened to the student,
// newest first. Built from the records themselves, so it can never disagree.
import "server-only";

import type { Tx } from "../db";
import { STATUS_LABEL, CERTIFICATE_LABEL, LEAVING_TYPE_LABEL, BEHAVIOUR_KIND_LABEL, type StudentStatusKey, type BehaviourKind } from "./labels";

export type TimelineItem = { at: Date; title: string; detail?: string; kind: "admission" | "status" | "class" | "behaviour" | "certificate" | "leaving" | "document" | "card" };

export async function studentTimeline(tx: Tx, studentId: string, opts: { behaviour: boolean; documents: boolean }): Promise<TimelineItem[]> {
  const [student, statuses, enrolments, moves, incidents, certs, leaving, docs, cards] = await Promise.all([
    tx.student.findUniqueOrThrow({ where: { id: studentId } }),
    tx.studentStatusChange.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    tx.enrolment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    tx.sectionChange.findMany({ where: { studentId, undoneAt: null }, orderBy: { createdAt: "desc" } }),
    opts.behaviour ? tx.behaviourIncidentStudent.findMany({ where: { studentId, incident: { archivedAt: null } }, include: { incident: true } }) : Promise.resolve([]),
    tx.certificate.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    tx.leavingRequest.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    opts.documents ? tx.studentDocument.findMany({ where: { studentId, archivedAt: null } }) : Promise.resolve([]),
    tx.idCardPrint.findMany({ where: { studentId } }),
  ]);
  const sectionIds = [...new Set([...enrolments.map((e) => e.sectionId), ...moves.flatMap((m) => [m.fromSectionId, m.toSectionId])])];
  const sections = await tx.section.findMany({ where: { id: { in: sectionIds } }, include: { schoolClass: true, academicYear: true } });
  const sec = (id: string) => sections.find((s) => s.id === id);
  const label = (id: string) => { const s = sec(id); return s ? `${s.schoolClass.name} ${s.name}` : "a section"; };

  const items: TimelineItem[] = [];
  for (const s of statuses) {
    if (s.fromStatus === "NEW") items.push({ at: s.createdAt, kind: "admission", title: s.reason === "Imported" ? "Imported into School OS" : "Admitted", detail: `Admission number ${student.admissionNo}` });
    else items.push({ at: s.createdAt, kind: "status", title: `Status: ${STATUS_LABEL[s.fromStatus as StudentStatusKey] ?? s.fromStatus} to ${STATUS_LABEL[s.toStatus as StudentStatusKey] ?? s.toStatus}`, detail: s.reason });
  }
  for (const e of enrolments) {
    const s = sec(e.sectionId);
    items.push({ at: e.createdAt, kind: "class", title: `${e.archivedAt ? "Class removed (undone)" : "In"} ${label(e.sectionId)}${s ? `, ${s.academicYear.name}` : ""}`, detail: e.rollNo ? `Roll number ${e.rollNo}` : undefined });
  }
  for (const m of moves) items.push({ at: m.createdAt, kind: "class", title: `Moved from ${label(m.fromSectionId)} to ${label(m.toSectionId)}`, detail: m.reason ?? undefined });
  for (const i of incidents) items.push({ at: i.incident.createdAt, kind: "behaviour", title: `${BEHAVIOUR_KIND_LABEL[i.incident.kind as BehaviourKind] ?? i.incident.kind}: ${i.incident.description.slice(0, 80)}`, detail: i.incident.actionTaken ?? undefined });
  for (const c of certs) items.push({ at: c.issuedAt ?? c.createdAt, kind: "certificate", title: `${CERTIFICATE_LABEL[c.type]}${c.isDuplicate ? " (duplicate)" : ""}: ${c.status.toLowerCase()}`, detail: c.number ?? undefined });
  for (const l of leaving) items.push({ at: l.createdAt, kind: "leaving", title: `${LEAVING_TYPE_LABEL[l.type]} started`, detail: `${l.reason}${l.status === "CANCELLED" ? " (cancelled)" : ""}` });
  for (const d of docs) items.push({ at: d.createdAt, kind: "document", title: `Document added: ${d.kind}` });
  for (const c of cards) items.push({ at: c.createdAt, kind: "card", title: c.isReplacement ? "ID card reprinted" : "ID card printed", detail: c.reason ?? undefined });
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
