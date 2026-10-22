import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck, Ban, CircleCheck, CircleX, ClipboardCheck, Clock, FileCheck, FileText, FileWarning, FileX, FolderOpen, Gavel, IndianRupee,
  ListOrdered, MessageSquare, Pencil, School, Send, ShieldCheck, User, Users, type LucideIcon,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { decryptField, maskLast4 } from "@/lib/crypto";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { CLOSED_STAGES, movableTo, OPEN_STAGES, stageLabel } from "@/lib/admission/applications";
import { DOC_STATUS_LABEL, progressOf } from "@/lib/admission/documents";
import { CANCEL_REASONS, COUNTER_MODES, activeRazorpay, feeStatus, modeLabel } from "@/lib/admission/fee";
import { feePageAllowedFor } from "@/lib/fees/access";
import { admissionConsentTexts, DATA_CONSENT } from "@/lib/admission/consent";
import { outcomeLabel } from "@/lib/admission/tests";
import { blockers } from "@/lib/admission/convert";
import { admissionYear, classRule, docLabel, stageOn } from "@/lib/admission/settings";
import { applicationScope } from "@/lib/admission/access";
import { seatsFor } from "@/lib/admission/seats";
import { phoneWords } from "@/lib/admission/words";
import { loadCustomFields, visibleFields } from "@/lib/custom-fields";
import { CustomFieldValues } from "@/components/custom-fields";
import type { CustomValues } from "@/lib/custom-field-rules";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/chips";
import { Stats } from "@/components/ui/stats";
import { Avatar } from "@/components/ui/avatar";
import { Col, DL, Split, Timeline } from "@/components/ui/rows";
import { cx } from "@/components/ui/cx";
import { STAGE_TONE } from "@/lib/admission/tones";
import { BackLink } from "../../_components/pills";
import { AppActions, CancelPayment, ConsentButtons, ExceptionButton, RemindButton } from "./app-forms";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Application" };

const KIND_ICON: Record<string, { icon: LucideIcon; tone?: string }> = {
  created: { icon: FileText }, edited: { icon: Pencil }, reviewed: { icon: CircleCheck, tone: "brand" }, "sent-back": { icon: Send, tone: "warn" },
  stage: { icon: ListOrdered, tone: "brand" }, document: { icon: FileCheck, tone: "info" }, reminder: { icon: Send }, exception: { icon: FileWarning, tone: "warn" },
  consent: { icon: ShieldCheck, tone: "ok" }, fee: { icon: IndianRupee, tone: "ok" }, test: { icon: ClipboardCheck, tone: "brand" }, "test-score": { icon: ClipboardCheck, tone: "brand" },
  interview: { icon: Users, tone: "brand" }, "interview-outcome": { icon: Users, tone: "brand" }, decision: { icon: Gavel, tone: "warn" }, offer: { icon: Send, tone: "info" },
  "waiting-list": { icon: ListOrdered, tone: "warn" }, admitted: { icon: BadgeCheck, tone: "ok" }, "admission-undone": { icon: Ban, tone: "bad" }, withdrawn: { icon: Ban, tone: "neutral" },
};

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, settings, tz, year } = await fullPage();
  const data = await withSchool(current.ctx, async (tx) => {
    // Another campus's application is not found for a person limited to one campus.
    const app = await tx.application.findFirst({
      where: { id, archivedAt: null, ...applicationScope(viewer) },
      include: {
        documents: { orderBy: { docType: "asc" } }, payments: { orderBy: { createdAt: "desc" } }, activities: { orderBy: { at: "desc" }, take: 200 },
        tests: { where: { archivedAt: null }, include: { test: true } }, interviews: { orderBy: { startsAt: "desc" } },
      },
    });
    if (!app) return null;
    const [cls, year, rule, consents, texts, enquiry, sibling, student, seats, staff, users, fields, block, approval, online, admitting] = await Promise.all([
      tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } }),
      tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true, status: true } }),
      classRule(tx, app.classId),
      tx.admissionConsent.findMany({ where: { applicationId: app.id }, orderBy: { givenAt: "desc" } }),
      admissionConsentTexts(tx, current.school.name),
      app.enquiryId ? tx.enquiry.findUnique({ where: { id: app.enquiryId }, select: { id: true, enquiryNo: true, ownerStaffId: true } }) : null,
      app.siblingStudentId ? tx.student.findFirst({ where: { id: app.siblingStudentId, ...(viewer.campusId ? { campusId: viewer.campusId } : {}) }, select: { id: true, fullName: true, admissionNo: true } }) : null,
      app.studentId ? tx.student.findUnique({ where: { id: app.studentId }, select: { id: true, fullName: true, admissionNo: true } }) : null,
      seatsFor(tx, app.academicYearId, [app.classId]),
      tx.staff.findMany({ select: { id: true, fullName: true, userLoginId: true } }),
      tx.userLogin.findMany({ where: { id: { in: [...new Set(app.activities.map((a) => a.byId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } }),
      loadCustomFields(tx, "application"),
      app.stage === "APPROVED" ? blockers(tx, current.ctx, app) : Promise.resolve([] as string[]),
      app.approvalId ? tx.approval.findUnique({ where: { id: app.approvalId }, select: { id: true, status: true } }) : null,
      app.feeDuePaise ? activeRazorpay(tx).then(Boolean) : Promise.resolve(false),
      // The admission year of the application's own campus (each campus has its own years).
      admissionYear(tx, current.ctx, settings, app.campusId),
    ]);
    return { admitting, app, cls, year, rule, consents, texts, enquiry, sibling, student, seat: seats.get(app.classId), staff, users, fields: visibleFields(fields, current.roles), block, approval, online };
  });
  if (!data) {
    return (
      <>
        <BackLink href={`${BASE}/applications`} label="Applications" />
        <Card><div className="px-6 py-14 text-center"><h1 className="font-semibold"><Words k="Application not found" /></h1><p className="text-sm text-ink3 mt-1"><Words k="It may have been archived." /></p></div></Card>
      </>
    );
  }
  const { app } = data;
  const full = viewer.change === "all";
  const closed = CLOSED_STAGES.includes(app.stage);
  const p = progressOf(app.documents, data.rule.documents);
  const fee = feeStatus(app, app.payments);
  const who = (userId: string | null) => (userId ? data.users.find((u) => u.id === userId)?.displayName ?? data.staff.find((s) => s.userLoginId === userId)?.fullName ?? "Staff" : "Parent (online)");
  const staffName = (sid: string | null | undefined) => (sid ? data.staff.find((s) => s.id === sid)?.fullName ?? null : null);
  const moves = full && (OPEN_STAGES.includes(app.stage) || app.stage === "WAITING_LIST")
    ? movableTo(settings, app.stage).map((s) => ({ value: s, label: s === "DECISION" ? "Send for decision" : `Move to ${stageLabel(s)}` }))
    : [];
  const prefs = (app.preferences ?? {}) as { secondLanguage?: string | null; transportNeeded?: boolean; transportStop?: string | null; hostelNeeded?: boolean };
  let aadhaar: string | null = null;
  if (app.aadhaarEnc && viewer.restricted) {
    try { aadhaar = maskLast4(decryptField(app.aadhaarEnc)); } catch { aadhaar = "On file"; }
  }
  const campusYear = data.admitting ?? year;
  const yearLabel = data.year ? `${data.year.name}${data.year.status === "ACTIVE" && campusYear && campusYear.id !== app.academicYearId ? " mid-year" : ""}` : "";
  const owner = staffName(data.enquiry?.ownerStaffId);
  const parent = app.fatherName ?? app.motherName ?? app.guardianName ?? "Parent";
  const decisionStage = ["DECISION", "APPROVED", "WAITING_LIST"].includes(app.stage);
  const t = app.tests[0];
  const iv = app.interviews.find((i) => !i.cancelledAt);
  const testsOn = stageOn(settings, "test") || stageOn(settings, "interview");
  const dataConsent = data.consents.find((c) => c.consentType === DATA_CONSENT && !c.withdrawnAt && c.otpVerifiedAt);
  const seatsLeft = data.seat ? data.seat.free : null;

  const parents = [
    app.fatherName ? { name: app.fatherName, rel: "Father" } : null,
    app.motherName ? { name: app.motherName, rel: "Mother" } : null,
    app.guardianName ? { name: app.guardianName, rel: app.guardianRelation ?? "Guardian" } : null,
  ].filter((x): x is { name: string; rel: string } => Boolean(x));

  const timeline = app.activities.map((a) => {
    const k = KIND_ICON[a.kind] ?? { icon: Clock };
    return { what: a.text, when: `${formatDateTime(a.at, tz)} · ${who(a.byId)}`, icon: k.icon, tone: k.tone };
  });

  return (
    <>
      <BackLink href={`${BASE}/applications`} label="Applications" sub={app.applicationNo} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={app.fullName} size={60} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[23px] md:text-[26px] font-semibold tracking-tight leading-tight">{app.fullName}</h1>
                <Pill tone={STAGE_TONE[app.stage] ?? "neutral"} dot>{stageLabel(app.stage)}</Pill>
                {app.channel === "online" && <Pill tone="info"><Words k="Filled online" /></Pill>}
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{data.cls?.name ?? ""} · {yearLabel} · <span className="font-mono text-[12.5px]">{app.applicationNo}</span>{owner ? ` · Owner ${owner}` : ""}</p>
            </div>
          </div>
          {full && !closed && (
            <AppActions id={app.id} name={app.fullName} applicationNo={app.applicationNo} parent={parent} moves={decisionStage ? [] : moves}
              canReview={app.stage === "SUBMITTED" || app.stage === "SUBMITTED_ONLINE"}
              decisionHref={decisionStage ? (app.stage === "APPROVED" ? `${BASE}/decision/${app.id}/confirm` : `${BASE}/decision?focus=${app.id}`) : null}
              editHref={app.stage !== "APPROVED" ? `${BASE}/applications/${app.id}/edit` : null}
              fee={settings.applicationFeeOn && app.feeDuePaise ? { due: fee.key === "due" || fee.key === "waiting", amount: formatRupees(fee.duePaise - fee.paidPaise), online: data.online, phone: phoneWords(app.phone), modes: COUNTER_MODES.map((m) => ({ value: m.value, label: m.label })) } : null} />
          )}
        </Card>

        {app.stage === "ADMITTED" && (
          <Banner tone="ok" title={data.student ? `Admitted as ${data.student.admissionNo}.` : "Admitted."} action={data.student ? <ButtonLink size="sm" variant="secondary" href={`/student-management/${data.student.id}`}><Words k="Open student" /></ButtonLink> : undefined}>
            <Words k="The student record, parents and Parent Link were made" /> {app.decidedAt ? `on ${formatDate(app.decidedAt, tz)}` : "at admission"}.
          </Banner>
        )}
        {app.stage === "WITHDRAWN" && <Banner tone="info" title="Withdrawn.">{app.withdrawnReason ?? ""} <Words k="The application number is never reused." /></Banner>}
        {app.stage === "REJECTED" && <Banner tone="bad" title="Not approved.">{app.decisionRemarks ?? ""}</Banner>}
        {app.stage === "WAITING_LIST" && app.waitingRank !== null && <Banner tone="warn" title={`Waiting list number ${app.waitingRank}.`}><Words k="The family is offered a seat when one frees up, in this order." /></Banner>}
        {app.sentBackAt && !closed && <Banner tone="warn" title={`Sent back to the parent on ${formatDate(app.sentBackAt, tz)}.`}><Words k="Waiting for the missing details." /></Banner>}
        {app.stage === "APPROVED" && data.block.length > 0 && (
          <Banner tone="warn" title="Before the admission can be confirmed:">{data.block.join(" ")}</Banner>
        )}
        {full && !closed && !dataConsent && (
          <Banner tone="warn" icon={ShieldCheck} title="Data consent is not given yet." action={<ConsentButtons id={app.id} phone={`+91 ${phoneWords(app.phone)}`} texts={data.texts} parent={parent} />}>
            <Words k="It is needed before the admission. The guardian confirms with a one-time code." />
          </Banner>
        )}

        <Stats items={[
          { label: "Papers verified", value: p.required ? `${p.requiredVerified} of ${p.required}` : "None needed", tone: p.required === 0 || p.requiredVerified >= p.required ? "ok" : "warn", icon: FolderOpen, href: full ? `${BASE}/documents?id=${app.id}` : undefined },
          {
            label: iv && !t ? "Interview" : "Entrance test",
            value: t ? (t.absent ? "Absent" : t.marks !== null ? `${Number(t.marks)} / ${t.test.maxMarks}` : "Booked") : iv ? (iv.outcome ? outcomeLabel(iv.outcome) : "Booked") : testsOn ? "Not booked" : "Not needed",
            sub: t ? formatDate(t.test.startsAt, tz) : iv ? formatDate(iv.startsAt, tz) : undefined, icon: ClipboardCheck,
          },
          {
            label: "Application fee", value: fee.key === "paid" ? "Paid" : fee.key === "due" ? "Not paid" : fee.key === "waiting" ? "Waiting" : "Not needed",
            tone: fee.key === "due" ? "bad" : fee.key === "paid" ? "ok" : fee.key === "waiting" ? "warn" : undefined, sub: app.feeDuePaise ? formatRupees(app.feeDuePaise) : yearLabel, icon: IndianRupee,
          },
          { label: "Seats left", value: seatsLeft ?? "None", sub: `${data.cls?.name ?? ""} · ${data.year?.name ?? ""}`, tone: seatsLeft === 0 || seatsLeft === null ? "bad" : undefined, icon: School },
        ]} />

        <Split>
          <Col>
            <Card>
              <CardHeader title="Child" icon={User} />
              <DL rows={[
                ["Full name", app.fullName],
                ["Date of birth", formatDate(app.dateOfBirth, "UTC")],
                ["Gender", app.gender === "Female" ? "Girl" : app.gender === "Male" ? "Boy" : app.gender],
                ["Class applied for", `${data.cls?.name ?? ""} · ${yearLabel}`],
                ["Home address", app.address],
                ["Sibling in this school", data.sibling ? `${data.sibling.fullName} (${data.sibling.admissionNo})` : "None found from the phone number"],
                ...(viewer.restricted ? [["Aadhaar (student)", aadhaar ? <span key="x" className="tnum">{aadhaar} <span className="text-[12px] text-ink3"><Words k="· restricted" /></span></span> : "Not given"] as [string, React.ReactNode]] : []),
                ...(app.category ? [["Category", app.category] as [string, React.ReactNode]] : []),
                ...(app.religion ? [["Religion", app.religion] as [string, React.ReactNode]] : []),
                ...(app.motherTongue ? [["Mother tongue", app.motherTongue] as [string, React.ReactNode]] : []),
              ]} />
              {data.fields.length > 0 && <div className="px-5 pb-5"><CustomFieldValues fields={data.fields} values={(app.customFields ?? {}) as CustomValues} /></div>}
            </Card>
            <Card>
              <CardHeader title="Parents" description="Parent Link starts only after admission" icon={Users} />
              <div className="grid sm:grid-cols-2 gap-3 px-5 pb-5">
                {parents.map((pr, i) => (
                  <div key={pr.rel} className="rounded-xl border border-line p-3.5 flex items-start gap-3">
                    <Avatar name={pr.name} size={40} />
                    <div className="min-w-0">
                      <p className="font-semibold text-[14.5px] leading-tight">{pr.name}</p>
                      <p className="text-[12.5px] text-ink3">{pr.rel}{i === 0 && app.occupation ? ` · ${app.occupation}` : ""}</p>
                      {i === 0 ? <a href={`tel:+91${app.phone}`} className="block text-[14px] tnum mt-1.5 hover:underline">+91 {phoneWords(app.phone)}</a>
                        : app.altPhone && i === 1 ? <a href={`tel:+91${app.altPhone}`} className="block text-[14px] tnum mt-1.5 hover:underline">+91 {phoneWords(app.altPhone)}</a>
                          : <p className="text-[12.5px] text-ink3 mt-1.5"><Words k="No phone given" /></p>}
                    </div>
                  </div>
                ))}
              </div>
              {app.email && <p className="px-5 pb-5 -mt-2 text-[13.5px] text-ink2 break-all"><Words k="Email:" /> {app.email}</p>}
            </Card>
            <Card>
              <CardHeader title="Previous school and preferences" icon={School} />
              <DL rows={[
                ["Previous school", app.previousSchool ?? "First school"],
                ["Last class", app.previousClass ?? "None"],
                ["Marks or %", app.previousMarks ?? "None"],
                ["Second language", prefs.secondLanguage ?? "Not given"],
                // Transport and Hostel are optional modules: shown when on, or when a preference was saved.
                ...(current.modulesOn.has("transport-management") || prefs.transportNeeded ? [["Transport", prefs.transportNeeded ? `Needed${prefs.transportStop ? ` · ${prefs.transportStop}` : ""}` : "Not needed"] as [string, React.ReactNode]] : []),
                ...(current.modulesOn.has("hostel-management") || prefs.hostelNeeded ? [["Hostel", prefs.hostelNeeded ? "Needed" : "Not needed"] as [string, React.ReactNode]] : []),
                ...(app.reviewNote ? [["Review note", app.reviewNote] as [string, React.ReactNode]] : []),
              ]} />
            </Card>
            <Card>
              <CardHeader title="Documents" description={`${p.requiredVerified} of ${p.required} verified · list for ${data.cls?.name ?? "the class"}`} icon={FolderOpen}
                action={full && !closed ? <ButtonLink size="sm" variant="soft" href={`${BASE}/documents?id=${app.id}`}><Words k="Open" /></ButtonLink> : undefined} />
              <ul className="px-3 pb-3">
                {data.rule.documents.map((d) => {
                  const doc = app.documents.find((x) => x.docType === d.type);
                  const st = doc?.status ?? "NOT_RECEIVED";
                  const tone = st === "VERIFIED" ? "ok" : st === "REJECTED" ? "bad" : st === "RECEIVED" ? "info" : "warn";
                  const Ic = st === "VERIFIED" ? FileCheck : st === "REJECTED" ? FileX : st === "RECEIVED" ? FileText : FileWarning;
                  return (
                    <li key={d.type} className="flex items-center gap-3 px-2 py-2.5 rounded-xl">
                      <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", st === "VERIFIED" ? "bg-ok/10 text-ok" : st === "REJECTED" ? "bg-bad/10 text-bad" : st === "NOT_RECEIVED" ? "bg-warn/12 text-warn" : "bg-sunken text-ink2")}><Ic size={19} aria-hidden="true" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px] truncate">{docLabel(d.type)}{!d.required && <span className="font-normal text-ink3"> <Words k="· optional" /></span>}</p>
                        {doc?.rejectReason && <p className="text-[12.5px] text-bad truncate">{doc.rejectReason}</p>}
                        {doc?.fileId && <a href={`${BASE}/files/${doc.fileId}`} target="_blank" rel="noopener" className="text-[12.5px] text-brand hover:underline"><Words k="View file" /></a>}
                      </div>
                      <Pill tone={tone}>{DOC_STATUS_LABEL[st]}</Pill>
                    </li>
                  );
                })}
                {data.rule.documents.length === 0 && <li className="px-2 py-3 text-[13.5px] text-ink3"><Words k="No papers are needed for this class." /></li>}
              </ul>
              {full && !closed && (p.missing.length > 0 || (viewer.overCapacity && !p.complete && !app.papersException)) && (
                <div className="px-5 pb-4 flex flex-wrap gap-2">
                  {p.missing.length > 0 && <RemindButton id={app.id} />}
                  {viewer.overCapacity && !p.complete && !app.papersException && <ExceptionButton id={app.id} />}
                </div>
              )}
              {app.papersException && <p className="px-5 pb-4 text-[13px] text-warn"><Words k="May be admitted with papers pending:" /> {app.papersException}</p>}
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Fees" description="Receipts are made only after the payment is confirmed" icon={IndianRupee} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <div className="rounded-xl border border-line p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[14px]"><Words k="Application fee" />{app.feeDuePaise ? <span className="text-ink3 font-normal"> · {formatRupees(app.feeDuePaise)}</span> : null}</p>
                    <Pill tone={fee.key === "paid" ? "ok" : fee.key === "due" ? "bad" : fee.key === "waiting" ? "warn" : "neutral"}>{fee.key === "paid" ? "Paid" : fee.key === "due" ? "Not paid" : fee.key === "waiting" ? "Waiting" : "Not needed"}</Pill>
                  </div>
                  <p className="text-[12.5px] text-ink3 mt-1">{!app.feeDuePaise ? "No application fee for this class." : fee.key === "waiting" ? "Waiting for payment confirmation from Razorpay." : `Paid ${formatRupees(fee.paidPaise)} of ${formatRupees(fee.duePaise)}.`}</p>
                  {app.feeDuePaise && feePageAllowedFor(current, "collect") ? <Link href={`/fee-management/collect/application/${app.id}`} className="mt-1.5 inline-flex text-[13px] font-semibold text-brand hover:underline"><Words k="Open in Fee Management, Collect Fee" /></Link> : null}
                  {app.payments.length > 0 && (
                    <ul className="mt-2.5 flex flex-col divide-y divide-line/70">
                      {app.payments.map((pay) => (
                        <li key={pay.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]">
                          <span className="min-w-0">
                            <span className={cx("font-semibold tnum", pay.cancelledAt && "line-through text-ink3")}>{formatRupees(pay.amountPaise)}</span> · {modeLabel(pay.mode)}{pay.reference ? ` (${pay.reference})` : ""}
                            <span className="block text-[12px] text-ink3">
                              {pay.status === "CONFIRMED" ? (pay.cancelledAt ? `Cancelled: ${pay.cancelReason ?? ""}` : `Receipt ${pay.receiptNo}`) : pay.status === "PENDING" ? "Waiting for payment confirmation" : `Failed${pay.failedReason ? `: ${pay.failedReason}` : ""}`} · {formatDateTime(pay.confirmedAt ?? pay.createdAt, tz)}
                            </span>
                          </span>
                          <span className="flex gap-1 shrink-0">
                            {pay.status === "CONFIRMED" && !pay.cancelledAt && <a href={`${BASE}/applications/${app.id}/receipt/${pay.id}`} target="_blank" rel="noopener" className="inline-flex items-center h-8 px-3 rounded-lg text-[13px] font-semibold text-brand hover:bg-sunken"><Words k="Receipt" /></a>}
                            {pay.status === "CONFIRMED" && !pay.cancelledAt && viewer.overCapacity && <CancelPayment paymentId={pay.id} receiptNo={pay.receiptNo} reasons={CANCEL_REASONS} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-line p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[14px]"><Words k="Admission fee" /></p>
                    <Pill tone={app.stage === "ADMITTED" ? "ok" : "neutral"}>{app.stage === "ADMITTED" ? "In the fee plan" : "After approval"}</Pill>
                  </div>
                  <p className="text-[12.5px] text-ink3 mt-1">{app.stage === "ADMITTED" ? "Collected in Fee Management with the student’s fee plan." : "Asked for once the Principal approves, in Fee Management."}</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Consent" description="DPDP Act 2023" icon={ShieldCheck} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
                {data.texts.map((tx) => {
                  const c = data.consents.find((x) => x.consentType === tx.type && !x.withdrawnAt && x.otpVerifiedAt);
                  return (
                    <li key={tx.type} className="flex gap-3">
                      {c ? <CircleCheck size={18} className="text-ok shrink-0 mt-0.5" aria-hidden="true" /> : <CircleX size={18} className={cx("shrink-0 mt-0.5", tx.required ? "text-warn" : "text-ink3")} aria-hidden="true" />}
                      <span>
                        <b className="font-semibold">{tx.label} {c ? "given" : "not given"}</b>
                        <span className="block text-[12.5px] text-ink3">
                          {c ? `${c.version ? `Version ${c.version} · ` : ""}${c.givenByName} · one-time code to +91 ${phoneWords(app.phone)} · ${formatDateTime(c.givenAt, tz)}` : tx.required ? "Needed before the admission" : "Separate consent, optional"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            {(testsOn || app.tests.length > 0 || app.interviews.length > 0) && (
              <Card>
                <CardHeader title="Test & Interview" icon={ClipboardCheck} action={full && !closed ? <ButtonLink size="sm" variant="soft" href={`${BASE}/tests?schedule=${app.id}`}><Words k="Schedule" /></ButtonLink> : undefined} />
                <ul className="px-5 pb-5 flex flex-col gap-2 text-[14px]">
                  {app.tests.map((b) => (
                    <li key={b.id}><b className="font-semibold">{b.test.title}</b> · {formatDateTime(b.test.startsAt, tz)}{b.test.venue ? ` · ${b.test.venue}` : ""}
                      <span className="block text-[12.5px] text-ink3">{b.absent ? "Absent" : b.marks !== null ? `${Number(b.marks)} of ${b.test.maxMarks}` : "Not scored yet"}{b.remarks ? ` · ${b.remarks}` : ""}</span></li>
                  ))}
                  {app.interviews.map((i) => (
                    <li key={i.id} className={i.cancelledAt ? "text-ink3 line-through" : ""}><b className="font-semibold"><Words k="Interview with" /> {staffName(i.interviewerStaffId) ?? "staff"}</b> · {formatDateTime(i.startsAt, tz)}
                      <span className="block text-[12.5px] text-ink3">{outcomeLabel(i.outcome)}{i.notes ? ` · ${i.notes}` : ""}</span></li>
                  ))}
                  {app.tests.length === 0 && app.interviews.length === 0 && <li className="text-ink3 text-[13.5px]"><Words k="No test or interview yet." /></li>}
                </ul>
              </Card>
            )}
            <Card>
              <CardHeader title="Timeline" description="Newest first. Nothing here is deleted." icon={Clock} />
              <div className="px-5">{timeline.length ? <Timeline items={timeline} /> : <p className="pb-5 text-[13.5px] text-ink3"><Words k="Nothing yet." /></p>}</div>
              {(data.enquiry || data.approval) && (
                <div className="px-5 pb-5 flex flex-wrap gap-3 text-[13px]">
                  {data.enquiry && <Link href={`${BASE}/enquiries?id=${data.enquiry.id}`} className="font-semibold text-brand hover:underline inline-flex items-center gap-1"><MessageSquare size={14} aria-hidden="true" /><Words k="Enquiry" /> {data.enquiry.enquiryNo ?? ""}</Link>}
                  {data.approval && <Link href={`/approvals/${data.approval.id}`} className="font-semibold text-brand hover:underline"><Words k="Approval request" /></Link>}
                </div>
              )}
            </Card>
          </Col>
        </Split>
      </div>
    </>
  );
}
