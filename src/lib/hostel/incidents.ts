// The hostel incident log (15 §2 Roll Call & Incidents): discipline, medical
// and maintenance, with the students involved, what happened and the action
// taken. A discipline incident can also go on the students' behaviour record
// (Student Management); the parents can be told (a switch on the form, and on
// in Hostel Settings).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatNumber, nextNumber } from "../sequences";
import { localOf } from "../front-office/time";
import { reportIncident } from "../students/behaviour";
import { activeBedOf, studentsInfo } from "./allocation";
import { messageParents } from "./messages";
import { HostelProblem } from "./problem";
import { hostelSettings } from "./settings";
import { INCIDENT_TYPE, type IncidentType } from "./words";

export type IncidentInput = {
  type: IncidentType;
  studentIds: string[];
  hostelId: string | null;
  place: string | null;
  description: string;
  at: Date;
  actionTaken: string | null;
  informParent: boolean;
  /** Discipline: the Student Management behaviour type to add it as (empty = not added). */
  behaviourTypeKey: string | null;
};

export async function recordIncident(tx: Tx, ctx: SchoolContext, input: IncidentInput, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void; mayAddBehaviour: boolean }) {
  const description = input.description.trim();
  if (description.length < 3) throw new HostelProblem("Write what happened, in a few words.", "description");
  if (description.length > 2000) throw new HostelProblem("What happened can be at most 2,000 characters.", "description");
  if (input.at.getTime() > opts.now.getTime() + 5 * 60_000) throw new HostelProblem("The date and time cannot be in the future.", "at");
  if (input.at.getTime() < opts.now.getTime() - 60 * 86_400_000) throw new HostelProblem("Incidents older than 60 days cannot be added here.", "at");
  const ids = [...new Set(input.studentIds)];
  if (input.type === "MAINTENANCE" && !input.place?.trim() && !ids.length) throw new HostelProblem("Say where: the room or place, such as Room B-12, ceiling fan.", "place");
  if (input.type !== "MAINTENANCE" && !ids.length) throw new HostelProblem("Choose the student or students.", "studentIds");
  if (ids.length > 20) throw new HostelProblem("At most 20 students on one incident.", "studentIds");

  let hostelId = input.hostelId;
  for (const id of ids) {
    const bed = await activeBedOf(tx, id);
    if (!bed) throw new HostelProblem("Choose students who live in the hostel.", "studentIds");
    opts.assertHostel(bed.hostel.id);
    hostelId = hostelId ?? bed.hostel.id;
  }
  if (!hostelId) throw new HostelProblem("Choose the hostel.", "hostelId");
  opts.assertHostel(hostelId);
  if (!(await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } }))) throw new HostelProblem("Choose the hostel.", "hostelId");

  const info = await studentsInfo(tx, ctx, ids);
  const yyyy = localOf(input.at, opts.tz).slice(0, 4);
  const incidentNo = formatNumber(`HI-${yyyy}-`, await nextNumber(tx, ctx, `hostel-incident-${yyyy}`), 4);
  const inc = await tx.hostelIncident.create({
    data: {
      schoolId: ctx.schoolId, incidentNo, hostelId, type: input.type, at: input.at, studentIds: ids, place: input.place?.trim() || null,
      description, actionTaken: input.actionTaken?.trim() || null, informParent: input.informParent && ids.length > 0, recordedById: ctx.userId,
    },
  });

  // Discipline → the students' behaviour record (Student Management).
  let behaviourId: string | null = null;
  if (input.type === "DISCIPLINE" && input.behaviourTypeKey && ids.length) {
    if (!opts.mayAddBehaviour) throw new HostelProblem("Your role cannot add to the behaviour record. Leave it off.", "behaviourTypeKey");
    const b = await reportIncident(tx, ctx, { studentIds: ids, typeKey: input.behaviourTypeKey, description: `Hostel incident ${incidentNo}: ${description}`, date: new Date(`${localOf(input.at, opts.tz).slice(0, 10)}T00:00:00Z`), actionTaken: input.actionTaken, informParent: false });
    behaviourId = b.id;
    await tx.hostelIncident.update({ where: { id: inc.id }, data: { behaviourIncidentId: behaviourId } });
  }

  // Tell the parents (when ticked, and on in Hostel Settings).
  let told = 0;
  const s = await hostelSettings(tx, ctx);
  if (inc.informParent && s.messageOnIncident) {
    for (const id of ids) {
      const st = info.get(id);
      if (!st) continue;
      const r = await messageParents(tx, ctx, st, `Hostel note about ${st.first}: ${INCIDENT_TYPE[input.type].label.toLowerCase()}. ${description}${inc.actionTaken ? ` Action taken: ${inc.actionTaken}` : ""} Please call the warden if you have questions.`, { trigger: "Hostel: incident", key: `incident:${inc.id}:${id}`, source: { type: "Hostel Incident", id: inc.id } });
      if (r.status === "sent") told++;
    }
    if (told) await tx.hostelIncident.update({ where: { id: inc.id }, data: { parentMessagedAt: opts.now } });
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Hostel Incident", recordId: inc.id, after: { incidentNo, type: INCIDENT_TYPE[input.type].label, students: ids.map((i) => info.get(i)?.name ?? i), place: inc.place, behaviour: Boolean(behaviourId), parentsTold: told } });
  return { incident: inc, behaviourId, told, names: ids.map((i) => info.get(i)?.first ?? "").filter(Boolean) };
}
