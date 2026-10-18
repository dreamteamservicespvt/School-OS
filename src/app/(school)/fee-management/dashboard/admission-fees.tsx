import Link from "next/link";
import { ArrowRight, CircleCheck, FileText, Hourglass, SearchX, UserPlus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { classOfStudents } from "@/lib/fees/dues";
import { feeStudentFilter } from "@/lib/fees/access";
import { inCampus } from "@/lib/campus";
import { feeStatus } from "@/lib/admission/fee";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { PeriodFilter } from "@/components/list/period-filter";
import { DataList, Empty, Stack, Stats, Toolbar } from "@/components/money/kit";
import { FeeHead } from "../_components/fee-head";
import { BASE, feePage, feePeriod, one, qs, type SearchParams } from "../_lib/page";

const ZERO = BigInt(0);
const HREF = `${BASE}/dashboard`;
type Tone = "ok" | "info" | "warn" | "neutral";
type Row = { id: string; name: string; number: string; cls: string; status: string; tone: Tone; note: string };

/**
 * "Admission Fees": the Admission Counsellor's only fee page (05-roles.md and the
 * approved prototype). It shows whether the application fee and the admission
 * fee are paid, and nothing else: no amounts, ledgers, payments or reports.
 */
export async function AdmissionFees({ searchParams }: { searchParams: SearchParams }) {
  const p = await feePage();
  const sp = await searchParams;
  const tab = one(sp.fee) === "admission" ? "admission" : "application";
  const per = feePeriod(sp, p.dates, null);
  const made = per.from && per.to ? { gte: per.from, lt: new Date(per.to.getTime() + 86_400_000) } : undefined;

  const data = await withSchool(p.current.ctx, async (tx) => {
    // A person limited to one campus sees that campus's applications and students only.
    const only = await feeStudentFilter(tx, p.viewer);
    const [apps, heads, classes] = await Promise.all([
      tx.application.findMany({
        where: { ...inCampus(p.viewer), feeDuePaise: { gt: ZERO }, ...(made ? { createdAt: made } : {}) }, orderBy: { createdAt: "desc" }, take: 500,
        select: { id: true, applicationNo: true, fullName: true, guardianName: true, fatherName: true, classId: true, stage: true, feeDuePaise: true, createdAt: true },
      }),
      tx.feeHead.findMany({ where: { kind: "admission", archivedAt: null }, select: { id: true } }),
      tx.schoolClass.findMany({ select: { id: true, name: true } }),
    ]);
    const appPays = apps.length ? await tx.applicationFeePayment.findMany({ where: { applicationId: { in: apps.map((a) => a.id) } }, select: { applicationId: true, status: true, amountPaise: true, cancelledAt: true, receiptNo: true, confirmedAt: true } }) : [];
    const dues = heads.length ? await tx.studentFeeDue.findMany({ where: { ...only, feeHeadId: { in: heads.map((h) => h.id) }, state: "OPEN", ...(made ? { createdAt: made } : {}) }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, studentId: true, balancePaise: true, paidPaise: true, dueDate: true } }) : [];
    const ids = [...new Set(dues.map((d) => d.studentId))];
    const [students, studentClasses, allocations] = await Promise.all([
      tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true } }),
      classOfStudents(tx, ids, null),
      tx.paymentAllocation.findMany({ where: { dueId: { in: dues.map((d) => d.id) }, payment: { status: "POSTED" } }, select: { dueId: true, paymentId: true, payment: { select: { paymentDate: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    const receipts = allocations.length ? await tx.receipt.findMany({ where: { paymentId: { in: allocations.map((a) => a.paymentId) } }, select: { paymentId: true, number: true } }) : [];
    return { apps, appPays, classes, dues, students, studentClasses, allocations, receipts };
  });

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const application: Row[] = data.apps.map((a) => {
    const pays = data.appPays.filter((x) => x.applicationId === a.id);
    const st = feeStatus(a, pays);
    const paidBy = pays.find((x) => x.status === "CONFIRMED" && !x.cancelledAt);
    const status = st.key === "paid" ? "Paid" : st.key === "waiting" ? "Waiting for confirmation" : st.paidPaise > ZERO ? "Part paid" : "Not paid";
    return {
      id: a.id, name: a.fullName, number: a.applicationNo, cls: className(a.classId),
      status, tone: st.key === "paid" ? "ok" : st.key === "waiting" ? "info" : "warn",
      note: st.key === "paid" && paidBy ? `${paidBy.receiptNo ?? ""}${paidBy.confirmedAt ? ` · ${formatDate(paidBy.confirmedAt, p.tz)}` : ""}` : `Applied ${formatDate(a.createdAt, p.tz)}`,
    };
  });
  const admission: Row[] = data.dues.map((d) => {
    const s = data.students.find((x) => x.id === d.studentId);
    const a = data.allocations.find((x) => x.dueId === d.id);
    const r = a ? data.receipts.find((x) => x.paymentId === a.paymentId) : null;
    const paid = d.balancePaise <= ZERO;
    const status = paid ? "Paid" : d.paidPaise > ZERO ? "Part paid" : "Not paid";
    return {
      id: d.id, name: s?.fullName ?? "Student", number: s?.admissionNo ?? "", cls: data.studentClasses.get(d.studentId)?.label ?? "Not in a class yet",
      status, tone: paid ? "ok" : d.paidPaise > ZERO ? "info" : "warn",
      note: paid && a ? `${r?.number ?? ""} · ${formatDate(a.payment.paymentDate)}` : `Due ${formatDate(d.dueDate)}`,
    };
  });
  const rows = tab === "admission" ? admission : application;
  const paidN = (list: Row[]) => list.filter((r) => r.status === "Paid").length;
  const keep = { ...per.keep };
  const word = tab === "admission" ? "Admission fee" : "Application fee";

  return (
    <div>
      <FeeHead pageName="Admission Fees" href={HREF} sub="Whether new families have paid the application and admission fees. Other fee details stay with the accounts team." />
      <Stack>
        <Stats items={[
          { label: "Application fee paid", value: `${paidN(application)} of ${application.length}`, icon: CircleCheck, tone: "ok" },
          { label: "Application fee not paid", value: application.length - paidN(application), icon: Hourglass, tone: application.length - paidN(application) ? "warn" : undefined },
          { label: "Admission fee paid", value: `${paidN(admission)} of ${admission.length}`, icon: CircleCheck, tone: "ok" },
          { label: "Admission fee not paid", value: admission.length - paidN(admission), icon: FileText, tone: admission.length - paidN(admission) ? "warn" : undefined },
        ]} />
        <Card className="overflow-hidden">
          <CardHeader title="Fee status" description={per.range ? per.range.label : "All dates"} icon={UserPlus}
            action={<Link href="/admission-management" className={buttonClass("secondary", "sm")}><ArrowRight size={15} aria-hidden="true" />Admissions</Link>} />
          <LinkTabs className="px-3" label="Which fee" tabs={[
            { href: qs(HREF, { ...keep, fee: null }), label: "Application fee", count: application.length, on: tab === "application" },
            { href: qs(HREF, { ...keep, fee: "admission" }), label: "Admission fee", count: admission.length, on: tab === "admission" },
          ]} />
          <Toolbar>
            <div className="md:w-56"><PeriodFilter {...p.dates} /></div>
          </Toolbar>
          <DataList rows={rows.slice(0, 100)} rowKey={(r) => r.id} minWidth={600} caption={`${word} status`}
            footer={`Showing ${Math.min(rows.length, 100)} of ${rows.length}`}
            empty={<Empty icon={per.range ? SearchX : UserPlus} title={per.range ? `No ${word.toLowerCase()} ${per.range.label.toLowerCase()}` : `No ${word.toLowerCase()} yet`}
              body={tab === "admission" ? "When a new student is given an admission fee, whether it is paid shows here." : "Applications that need an application fee show here, with whether it is paid."} />}
            columns={[
              { key: "name", label: tab === "admission" ? "Student" : "Applicant", render: (r) => <p className="font-semibold leading-tight">{r.name}</p> },
              { key: "no", label: tab === "admission" ? "Admission no." : "Application no.", render: (r) => <span className="font-mono text-[12.5px]">{r.number}</span> },
              { key: "cls", label: "Class", nowrap: true, render: (r) => r.cls },
              { key: "fee", label: word, render: (r) => <><Pill tone={r.tone}>{r.status}</Pill><span className="block text-[12px] text-ink3 mt-0.5">{r.note}</span></> },
            ]}
            phone={(r) => ({ title: r.name, sub: `${r.number} · ${r.cls}`, avatar: r.name, pills: <Pill tone={r.tone} className="!h-[22px] !text-[11.5px]">{word}: {r.status.toLowerCase()}</Pill> })} />
        </Card>
      </Stack>
    </div>
  );
}
