import Link from "next/link";
import { ArrowRight, CalendarDays, CircleCheck, Clock, FileText, Hourglass, UserPlus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { classOfStudents } from "@/lib/fees/dues";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DataList, Empty, SimpleTable, Split, Stack, Stats } from "@/components/money/kit";
import { FeeHead } from "../_components/fee-head";
import { BASE, feePage } from "../_lib/page";

const ZERO = BigInt(0);

/**
 * The Admission Counsellor's fee view (05-roles.md): only the admission fee
 * status of new students. Other fee details stay with the accounts team.
 */
export async function AdmissionFees() {
  const p = await feePage();
  const data = await withSchool(p.current.ctx, async (tx) => {
    const heads = await tx.feeHead.findMany({ where: { kind: "admission", archivedAt: null }, select: { id: true, name: true } });
    const dues = heads.length ? await tx.studentFeeDue.findMany({ where: { feeHeadId: { in: heads.map((h) => h.id) }, state: "OPEN" }, orderBy: { createdAt: "desc" }, take: 500 }) : [];
    const ids = [...new Set(dues.map((d) => d.studentId))];
    const [students, classes, allocations] = await Promise.all([
      tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true, guardians: { where: { archivedAt: null }, orderBy: { isPrimary: "desc" }, take: 1, select: { guardian: { select: { name: true } } } } } }),
      classOfStudents(tx, ids, null),
      tx.paymentAllocation.findMany({ where: { dueId: { in: dues.map((d) => d.id) }, payment: { status: "POSTED" } }, include: { payment: { select: { id: true, paymentDate: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    const receipts = await tx.receipt.findMany({ where: { paymentId: { in: allocations.map((a) => a.paymentId) } }, select: { paymentId: true, number: true } });
    return { heads, dues, students, classes, allocations, receipts };
  });
  const rows = data.dues.map((d) => {
    const s = data.students.find((x) => x.id === d.studentId);
    const a = data.allocations.find((x) => x.dueId === d.id);
    const r = a ? data.receipts.find((x) => x.paymentId === a.paymentId) : null;
    const paid = d.balancePaise <= ZERO;
    return {
      id: d.id,
      name: s?.fullName ?? "Student",
      admissionNo: s?.admissionNo ?? "",
      parent: s?.guardians[0]?.guardian.name ?? "",
      cls: data.classes.get(d.studentId)?.label ?? "Not in a class yet",
      amount: d.amountPaise - d.concessionPaise + d.adjustmentPaise,
      balance: d.balancePaise,
      status: paid ? "Paid" : d.paidPaise > ZERO ? "Part paid" : "Waiting",
      note: paid && a ? `${r?.number ?? ""} · ${formatDate(a.payment.paymentDate)}` : `Due ${formatDate(d.dueDate)}`,
      paidOn: a?.payment.paymentDate ?? null,
    };
  });
  const paid = rows.filter((r) => r.status === "Paid");
  const waiting = rows.filter((r) => r.status !== "Paid");
  const months = new Map<string, { label: string; n: number; amount: bigint }>();
  for (const r of paid) {
    if (!r.paidOn) continue;
    const k = r.paidOn.toISOString().slice(0, 7);
    const m = months.get(k) ?? { label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(r.paidOn), n: 0, amount: ZERO };
    m.n += 1; m.amount += r.amount;
    months.set(k, m);
  }
  const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const tone = (s: string) => (s === "Paid" ? "ok" : s === "Part paid" ? "info" : "warn") as "ok" | "info" | "warn";
  return (
    <div>
      <FeeHead pageName="Fee Dashboard" href={`${BASE}/dashboard`} sub="You see only admission fees. Other fee details stay with the accounts team." />
      <Stack>
        <Stats items={[
          { label: "Admission fees paid", value: `${paid.length} of ${rows.length}`, sub: formatRupees(paid.reduce((a, r) => a + r.amount, ZERO)), icon: CircleCheck, tone: "ok" },
          { label: "Waiting for admission fee", value: waiting.length, sub: `${formatRupees(waiting.reduce((a, r) => a + r.balance, ZERO))} still due`, tone: waiting.length ? "warn" : undefined, icon: Hourglass },
          { label: "Fee heads counted", value: data.heads.length, sub: data.heads.map((h) => h.name).join(", ") || "No admission fee head yet", icon: FileText },
          { label: "Paid this month", value: byMonth.at(-1)?.n ?? 0, sub: byMonth.at(-1)?.label ?? "None yet", icon: Clock },
        ]} />
        <Split>
          <Card className="overflow-hidden">
            <CardHeader title="Admission fees" description={`Latest ${Math.min(rows.length, 50)} new students`} icon={UserPlus}
              action={<Link href="/admission-management" className={buttonClass("secondary", "sm")}><ArrowRight size={15} aria-hidden="true" />Admissions</Link>} />
            <DataList rows={rows.slice(0, 50)} rowKey={(r) => r.id} minWidth={640} caption="Admission fees"
              footer={`Showing ${Math.min(rows.length, 50)} of ${rows.length}`}
              empty={<Empty icon={UserPlus} title="No admission fees yet" body="When a new student is given an admission fee, its status shows here." />}
              columns={[
                { key: "name", label: "Student", render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.parent}</p></> },
                { key: "adm", label: "Admission no.", render: (r) => <span className="font-mono text-[12.5px]">{r.admissionNo}</span> },
                { key: "cls", label: "Class", nowrap: true, render: (r) => r.cls },
                { key: "fee", label: "Admission fee", render: (r) => <><Pill tone={tone(r.status)}>{r.status}</Pill><span className="block text-[12px] text-ink3 mt-0.5">{r.note}</span></> },
                { key: "amt", label: "Amount", align: "right", render: (r) => formatRupees(r.amount) },
              ]}
              phone={(r) => ({ title: r.name, sub: `${r.admissionNo} · ${r.cls}`, avatar: r.name, pills: <Pill tone={tone(r.status)} className="!h-[22px] !text-[11.5px]">Admission fee: {r.status.toLowerCase()}</Pill> })} />
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="By month" description="Admission fees paid" icon={CalendarDays} />
            {byMonth.length ? (
              <SimpleTable minWidth={280} rows={byMonth} rowKey={(m) => m.label}
                cols={[{ label: "Month", render: (m) => m.label }, { label: "Paid", right: true, render: (m) => m.n }, { label: "Amount", right: true, render: (m) => formatRupees(m.amount) }]}
                foot={["Total", String(paid.length), formatRupees(paid.reduce((a, r) => a + r.amount, ZERO))]} />
            ) : <p className="px-5 pb-5 text-[13.5px] text-ink3">No admission fee paid yet.</p>}
          </Card>
        </Split>
      </Stack>
    </div>
  );
}
