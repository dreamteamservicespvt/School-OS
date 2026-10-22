import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { BookOpen, Boxes, CircleCheck, ClipboardCheck, FileOutput, IndianRupee, Info, ListChecks, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banner, Col, DL, Split } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import { blockMessage, isCleared } from "@/lib/students/leaving";
import { BASE, studentPage, todayIso } from "../../_lib/page";
import { campusAllows } from "@/lib/campus";
import { askWaiverAction, cancelLeavingAction, completeLeavingAction, refreshClearanceAction } from "../../_actions/leaving";
import { CERT_LABEL, CHECK_LABEL, CHECK_TONE, LEAVING_TYPE_LABEL, studentFacts } from "../load";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Leaving") };
}

const CHECK_ICON: Record<string, LucideIcon> = { Fees: IndianRupee, Library: BookOpen, Inventory: Boxes };

const STATUS = { IN_PROGRESS: { label: "In progress", tone: "warning" }, LEFT: { label: "Left", tone: "neutral" }, CANCELLED: { label: "Cancelled", tone: "neutral" } } as const;

/** One leaving request: clearance checks with a way to settle each, waiver through Approvals, TC, mark as left, cancel. */
export default async function LeavingRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, can, tz } = await studentPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const req = await tx.leavingRequest.findUnique({ where: { id }, include: { checks: { orderBy: { name: "asc" } } } });
    if (!req) return null;
    // One campus: that campus's students only.
    const st = await tx.student.findFirst({ where: { id: req.studentId }, select: { campusId: true } });
    if (!campusAllows(current, st?.campusId)) return null;
    const [facts, certs, people] = await Promise.all([
      studentFacts(tx, [req.studentId]),
      tx.certificate.findMany({ where: { leavingRequestId: id }, orderBy: { createdAt: "desc" } }),
      tx.userLogin.findMany({ where: { id: { in: [req.createdById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    return { req, student: facts.get(req.studentId), certs, people };
  });
  if (!data || !data.student) notFound();
  const { req, student } = data;
  const cleared = isCleared(req.checks);
  const block = blockMessage(req.checks);
  const open = req.status === "IN_PROGRESS";
  const due = req.lastDate.toISOString().slice(0, 10) <= todayIso(tz);
  const tc = data.certs.find((c) => c.type === "TC" && c.status !== "CANCELLED");

  return (
    <>
      <BackLink href={`${BASE}/leaving`} label="Leaving & Alumni" sub={student.name} />
      <PageHeader title={`${student.name} is ${open ? "leaving" : req.status === "LEFT" ? "left" : "not leaving (cancelled)"}`} href={`${BASE}/leaving/${id}`} userId={current.user.id}
        sub={`${LEAVING_TYPE_LABEL[req.type]} · ${req.reason} · last day ${formatDate(req.lastDate, tz)}${req.destinationSchool ? ` · to ${req.destinationSchool}` : ""}`}>
        <ButtonLink href={`${BASE}/students/${req.studentId}`} icon={UserRound}><Words k="Student Profile" /></ButtonLink>
      </PageHeader>
      <Split side={340}>
        <Col>
          {open && (cleared
            ? <Banner tone="ok" title="Clearance passed.">{tc ? `The TC is ${CERT_LABEL[tc.status].toLowerCase()}${tc.number ? ` (${tc.number})` : ""}.` : "The TC can be issued now."}</Banner>
            : <Banner tone="warn" title="Clearance pending.">{block}<Words k=". Settle each one below, or ask for a waiver with a reason." /></Banner>)}
          <Card>
            <CardHeader title="Clearance" icon={ListChecks} description="Checked when leaving started and each time you check again. Only modules that are switched on are checked."
              action={open && can.manage ? <ActionButton action={refreshClearanceAction} fields={{ id }}><Words k="Check again" /></ActionButton> : undefined} />
            <div className="px-5 pb-5">
              {req.checks.length === 0 ? (
                <div className="flex items-start gap-3 rounded-2xl bg-sunken/60 px-4 py-3 text-[14px] text-ink2"><Info size={18} className="mt-0.5 shrink-0 text-ink3" aria-hidden="true" /><Words k="Nothing to check yet: fee dues and library books are checked here once Fee Management and Library Management are in use. Clearance passes." /></div>
              ) : (
                <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                  {req.checks.map((c) => {
                    const ok = c.status === "CLEAR" || c.status === "WAIVED";
                    const Ic = CHECK_ICON[c.name] ?? ClipboardCheck;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", ok ? "bg-ok/10 text-ok" : c.status === "WAIVER_ASKED" ? "bg-warn/12 text-warn" : "bg-bad/10 text-bad")}><Ic size={17} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold">{c.name} <Badge tone={CHECK_TONE[c.status]} className="!h-[22px] !text-[11.5px] align-middle">{CHECK_LABEL[c.status]}</Badge></p>
                          <p className={cx("text-[12.5px]", ok ? "text-ink3" : "text-ink2")}>{c.detail}{c.waiverReason ? ` · Waiver reason: ${c.waiverReason}` : ""} <Words k="· checked" /> {formatDateTime(c.checkedAt, tz)}</p>
                        </div>
                        {ok && <CircleCheck size={18} className="text-ok" aria-hidden="true" />}
                        {open && can.manage && c.status === "PENDING" && (
                          <div className="flex flex-wrap gap-2">
                            {c.actionHref && <ButtonLink href={c.actionHref} size="sm" variant="soft">{c.actionLabel ?? "Settle"}</ButtonLink>}
                            <ConfirmAction action={askWaiverAction} fields={{ checkId: c.id }} trigger="Ask for waiver" triggerVariant="secondary"
                              title={`Waive ${c.name} for ${student.name}?`} confirmLabel="Send for approval" reason={{ label: "Reason", min: 5 }}>
                              {c.detail}<Words k=". The waiver goes to Approvals; someone allowed to approve it decides. The check stays pending until then." />
                            </ConfirmAction>
                          </div>
                        )}
                        {c.status === "WAIVER_ASKED" && c.approvalId && <Link href="/approvals" className="text-[13px] font-semibold text-brand hover:underline"><Words k="See in Approvals" /></Link>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Certificates" icon={FileOutput} divided={data.certs.length > 0}
              action={open && can.manage && !tc && cleared ? <ButtonLink href={`${BASE}/certificates/new?student=${req.studentId}&type=TC`} variant="primary" size="sm" icon={FileOutput}><Words k="Issue TC" /></ButtonLink> : undefined} />
            {data.certs.length === 0 ? (
              <p className="px-5 pb-5 text-[14px] text-ink3">{open && can.manage && !tc && !cleared ? "No TC yet. It can be issued when every check is clear or waived." : "No TC yet."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.certs.map((c) => (
                  <li key={c.id}>
                    <Link className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition hover:bg-sunken/60" href={`${BASE}/certificates/${c.id}`}>
                      <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.type === "TC" ? "Transfer certificate" : c.type}{c.isDuplicate ? " (duplicate)" : ""}</span>{c.number && <span className="block font-mono text-[12.5px] text-ink3">{c.number}</span>}</span>
                      <Badge tone={c.status === "ISSUED" ? "success" : c.status === "CANCELLED" ? "neutral" : "warning"}>{CERT_LABEL[c.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHeader title="Details" icon={ShieldCheck} action={<Badge tone={STATUS[req.status].tone}>{STATUS[req.status].label}</Badge>} />
            <DL cols={1} rows={[
              ["Student", <>{student.name} · <span className="font-mono text-[13px]">{student.admissionNo}</span>{student.cls ? ` · ${student.cls}` : ""}</>],
              ["Type", LEAVING_TYPE_LABEL[req.type]],
              ["Reason", req.reason],
              ["Last date", formatDate(req.lastDate, tz)],
              ...(req.destinationSchool ? [["Destination school", req.destinationSchool] as [string, React.ReactNode]] : []),
              ...(req.cancelReason ? [["Why cancelled", req.cancelReason] as [string, React.ReactNode]] : []),
              ["Started", `${formatDateTime(req.createdAt, tz)} by ${data.people[0]?.displayName ?? "someone"}`],
              ...(req.documentFileIds.length > 0 ? [["Documents", <ul key="d">{req.documentFileIds.map((f, i) => <li key={f}><a className="font-semibold text-brand hover:underline" href={fileLink(f, current.ctx.schoolId)} target="_blank" rel="noreferrer"><Words k="Document" /> {i + 1}</a></li>)}</ul>] as [string, React.ReactNode]] : []),
            ]} />
          </Card>
          {open && can.manage && (
            <Card>
              <div className="flex flex-col gap-3 p-5">
                {due ? (
                  <ConfirmAction action={completeLeavingAction} fields={{ id }} trigger="Mark as left" triggerVariant="primary"
                    title={`Mark ${student.name} as left?`} confirmLabel="Mark as left">
                    <Words k="The status changes to" /> {req.type === "TRANSFER" ? "Transferred" : req.type === "GRADUATION" ? "Graduated" : "Withdrawn"} <Words k="from" /> {formatDate(req.lastDate, tz)}<Words k=". The record stays, and the student no longer shows in class lists." />
                  </ConfirmAction>
                ) : <p className="text-[13.5px] text-ink2"><Words k="The status changes by itself on" /> {formatDate(req.lastDate, tz)}.</p>}
                <div>
                  <ConfirmAction action={cancelLeavingAction} fields={{ id }} trigger="Cancel leaving" triggerVariant="danger-outline"
                    title="Cancel this leaving request?" confirmLabel="Cancel leaving" confirmVariant="danger" reason={{ label: "Reason", min: 5, placeholder: "For example: the family decided to stay." }}>
                    {student.name} <Words k="stays in the class. A TC that is waiting for approval is cancelled too." />
                  </ConfirmAction>
                </div>
              </div>
            </Card>
          )}
        </Col>
      </Split>
    </>
  );
}
