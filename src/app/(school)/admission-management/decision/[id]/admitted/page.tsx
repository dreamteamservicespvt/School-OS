import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ChevronRight, GraduationCap, IdCard, IndianRupee, MessageCircle, ShieldCheck, Smartphone, Users, type LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { UNDO_ADMISSION_MS, type Conversion } from "@/lib/admission/convert";
import { feePlanApplies } from "@/lib/students/hooks";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { UndoAdmission } from "../../decision-forms";

export const metadata: Metadata = { title: "Admission confirmed" };

export default async function AdmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, tz } = await workPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const app = await tx.application.findFirst({ where: { id, archivedAt: null } });
    if (!app) return null;
    if (!app.studentId) return { admitted: false as const };
    const c = (app.conversion ?? null) as unknown as Conversion | null;
    const [student, section, guardians, links, consents] = await Promise.all([
      tx.student.findUnique({ where: { id: app.studentId }, select: { id: true, fullName: true, admissionNo: true } }),
      c ? tx.section.findUnique({ where: { id: c.sectionId }, select: { name: true, schoolClass: { select: { name: true } } } }) : null,
      c ? tx.guardian.findMany({ where: { id: { in: [...c.newGuardianIds, ...c.linkedGuardianIds] } }, select: { id: true, name: true, relationship: true, phone: true } }) : [],
      c?.parentLinkIds?.length ? tx.parentLink.findMany({ where: { id: { in: c.parentLinkIds } }, select: { id: true, guardianId: true, status: true, lastSentAt: true } }) : [],
      c?.consentRecordIds?.length ? tx.consentRecord.count({ where: { id: { in: c.consentRecordIds }, withdrawnAt: null } }) : 0,
    ]);
    return { admitted: true as const, app, c, student, section, guardians, links, consents };
  });
  if (!data) notFound();
  if (!data.admitted) redirect(`${BASE}/applications/${id}`);
  const { app, c, student, section } = data;
  const undoUntil = app.admittedAt ? app.admittedAt.getTime() + UNDO_ADMISSION_MS : 0;
  // Server render time decides whether the undo button shows; the action checks again.
  // eslint-disable-next-line react-hooks/purity
  const canUndo = viewer.change === "all" && undoUntil > Date.now();
  const admNo = student?.admissionNo ?? c?.admissionNo ?? "";
  const place = section ? `${section.schoolClass.name} ${section.name}` : "";
  const welcome = c?.welcome === "queued" || c?.welcome === "sent" ? "“Admission confirmed” message, with the admission number" : c?.welcome ? `Not sent (${c.welcome}). Send it from Communication.` : "Not sent. Check the “admission-welcome” rule in Communication.";
  const parents = data.guardians.map((g) => `${g.name}${c?.linkedGuardianIds.includes(g.id) ? " (already a parent here)" : ""}`).join(" and ");

  const sentLinks = data.links.filter((l) => l.lastSentAt).length;
  const rows: [LucideIcon, string, string, string | null][] = [
    [GraduationCap, "Student record", `${admNo}${place ? ` · ${place}` : ""}${c?.rollNo ? ` · roll ${c.rollNo}` : ""}`, `/student-management/students/${app.studentId}`],
    [Users, "Parents linked", parents || "No parent records made", data.guardians[0] ? `/student-management/guardians/${data.guardians[0].id}` : null],
    [ShieldCheck, "Consent moved", data.consents > 0 ? `${data.consents} consent ${data.consents === 1 ? "record" : "records"} moved to the parents` : "No consent records were moved", "/student-management/guardians/consent"],
    // A link is made even when it cannot go (no WhatsApp or SMS): say so, never "sent" (QA PEOPLE-22).
    [Smartphone, !data.links.length ? "Parent Link not made" : sentLinks ? "Parent Link on its way" : "Parent Link made, not sent",
      !data.links.length ? "Parent Link is off for this school, or the parent has no mobile number"
        : sentLinks ? `${sentLinks} ${sentLinks === 1 ? "link" : "links"}, so the parent can see fees, pay and download receipts${sentLinks < data.links.length ? `. ${data.links.length - sentLinks} not sent` : ""}`
          : `${data.links.length} ${data.links.length === 1 ? "link" : "links"} made, but no WhatsApp or SMS is set up to send them. The School Admin sends them from Communication, Parent Link, once messages are set up.`,
      null],
    [IndianRupee, "Fee plan", feePlanApplies() ? "Set up from the class fee structure for the year" : "Set up in Fee Management once its fee structures are ready", null],
    [IdCard, "ID card queued", "Certificates & ID Cards · next batch", `/student-management/certificates/id-cards/print?ids=${app.studentId}`],
    [MessageCircle, "Welcome message", welcome, null],
  ];

  return (
    <div className="max-w-[640px] mx-auto w-full">
      <Card className="p-5 md:p-7 flex flex-col items-center text-center">
        <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center shadow-pop"><Check size={34} strokeWidth={3} aria-hidden="true" /></span>
        <h1 className="font-display text-[24px] font-semibold mt-4">{student?.fullName ?? app.fullName} is now a student</h1>
        <p className="text-ink3 text-[14px] mt-1">Admission number <b className="font-mono text-ink text-[13.5px]">{admNo}</b>{place ? ` · ${place}` : ""}{c?.rollNo ? ` · roll ${c.rollNo}` : ""}</p>
        <p className="text-ink3 text-[12.5px] mt-0.5">Confirmed {app.admittedAt ? formatDateTime(app.admittedAt, tz) : ""} from application {app.applicationNo}</p>
        <ul className="w-full mt-5 text-left rounded-2xl border border-line divide-y divide-line/70">
          {rows.map(([Ic, t, s, href]) => {
            const inner = (
              <>
                <span className="w-9 h-9 rounded-xl bg-ok/10 text-ok grid place-items-center shrink-0"><Ic size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block">{t}</b><span className="text-[12.5px] text-ink3 block">{s}</span></span>
                {href && <ChevronRight size={17} className="text-ink3 shrink-0" aria-hidden="true" />}
              </>
            );
            return (
              <li key={t}>
                {href ? <Link href={href} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">{inner}</Link> : <div className="w-full flex items-center gap-3 px-4 py-3">{inner}</div>}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 w-full mt-4 flex-wrap">
          <ButtonLink href={`${BASE}/decision?tab=approved`} variant="primary" className="flex-1">Done</ButtonLink>
          {canUndo && <UndoAdmission id={id} />}
        </div>
        {canUndo
          ? <p className="mt-3 text-[12.5px] text-ink3">Undo works until {formatDateTime(new Date(undoUntil), tz)}, if nothing else has happened to the student.</p>
          : app.admittedAt && <p className="mt-3 text-[12.5px] text-ink3">Admitted on {formatDate(app.admittedAt, tz)}. To reverse it now, record the student leaving in Student Management.</p>}
      </Card>
    </div>
  );
}
