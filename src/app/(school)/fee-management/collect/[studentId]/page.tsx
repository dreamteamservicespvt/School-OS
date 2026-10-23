import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatDate, formatRupees } from "@/lib/format";
import { studentYear } from "@/lib/academic/years";
import { canSeeStudent } from "@/lib/fees/access";
import { advanceHeld, allDues, dueStatus, netAmount, studentCard, totalsOf } from "@/lib/fees/dues";
import { gatewayFor } from "@/lib/fees/settings";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Ring } from "@/components/ui/display";
import { pct } from "../../_components/bits";
import { BASE, feeGuard } from "../../_lib/page";
import { CollectForm, type DueRow } from "./collect-form";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Collect Fee") };
}

/** Collect Fee, step 2: the student's dues, ticked for you, and the payment (fees.jsx). */
export default async function CollectPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const p = await feeGuard("collect");
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const data = await withSchool(p.current.ctx, async (tx) => {
    if (!(await canSeeStudent(tx, p.viewer, studentId))) return null;
    // "This year" for this student is their own campus's current year.
    const year = await studentYear(tx, p.current.ctx, studentId);
    const card = await studentCard(tx, p.current.ctx, studentId, year?.id);
    if (!card) return null;
    const dues = await allDues(tx, studentId);
    const heads = await tx.feeHead.findMany({ where: { id: { in: dues.map((d) => d.feeHeadId) } }, select: { id: true, name: true } });
    const advance = await advanceHeld(tx, studentId);
    const gateway = await gatewayFor(tx, p.current.ctx, card.classId);
    return { card, dues, heads, advance, gateway: Boolean(gateway), year };
  });
  if (!data) notFound();
  const { card, dues, heads, advance, year } = data;
  const yearDues = dues.filter((d) => !year || d.academicYearId === year.id || d.balancePaise > BigInt(0));
  const totals = totalsOf(yearDues);
  const rows: DueRow[] = yearDues
    .filter((d) => d.balancePaise > BigInt(0) || d.academicYearId === year?.id)
    .map((d) => {
      const status = dueStatus(d, p.today);
      const head = heads.find((h) => h.id === d.feeHeadId)?.name ?? "Fees";
      return {
        id: d.id,
        head: d.kind === "LATE_FEE" ? "Late fee" : d.kind === "OLD_DUES" ? "Old dues" : head,
        label: d.kind === "LATE_FEE" ? d.label.replace(/^Late fee\s*[·:-]?\s*/i, "") || "Late fee" : d.label,
        due: formatDate(d.dueDate),
        net: Number(netAmount(d)),
        paid: Number(d.paidPaise),
        balance: Number(d.balancePaise),
        status,
        lateFee: d.kind === "LATE_FEE",
      };
    });
  const paidPct = pct(totals.paid, totals.total);
  const counter = {
    discount: p.can.counter("give-discount"),
    waive: p.can.counter("waive-late-fee"),
    changeDate: p.can.counter("change-payment-date"),
  };
  const nextDue = yearDues.filter((d) => dueStatus(d, p.today) === "NOT_DUE").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  const first = card.name.split(" ")[0];
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link href={BASE} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 -ml-1 rounded-lg"><ArrowLeft size={17} aria-hidden="true" /><Words k="Collect fee" /></Link>
        <span className="text-[13px] text-ink3 hidden md:inline"><Words k="Collecting as" /> {p.current.user.displayName}</span>
      </div>
      <CollectForm
        studentId={card.id}
        studentName={card.name}
        firstName={first}
        father={card.fatherName ?? card.primaryGuardian?.name ?? "the parent"}
        rows={rows}
        today={p.today.toISOString().slice(0, 10)}
        counter={counter}
        advanceOn={p.features.has("fee-advance")}
        advanceHeld={advance > BigInt(0) ? formatRupees(advance) : null}
        gateway={data.gateway}
        verifyModes={p.features.has("fee-verification") ? p.settings.verifyModes : []}
        limit={formatRupees(p.settings.concessionLimitPaise)}
        nextDueText={nextDue ? `Next installment is due on ${formatDate(nextDue.dueDate)}.` : "Nothing more is raised for this year yet."}
        studentCard={
          <Card className="p-4 md:p-5 flex items-center gap-4">
            <Avatar name={card.name} size={56} src={card.photoFileId ? fileLink(card.photoFileId, p.current.ctx.schoolId) : null} />
            <div className="min-w-0 flex-1">
              <Link href={`/student-management/students/${card.id}`} className="font-display font-semibold text-[19px] leading-tight hover:underline">{card.name}</Link>
              <p className="text-[13px] text-ink3 truncate">{card.classSection}{card.rollNo != null ? ` · Roll ${card.rollNo}` : ""}<span className="hidden md:inline">{card.fatherName ? ` · ${card.fatherName}` : ""}{card.primaryGuardian?.phone ? <> · <span className="tnum">{card.primaryGuardian.phone}</span></> : null}</span></p>
              <div className="flex gap-x-4 gap-y-0.5 mt-2 text-[13px] tnum flex-wrap">
                <span><span className="text-ink3"><Words k="Year" /> </span><b className="font-semibold">{formatRupees(totals.total)}</b></span>
                <span><span className="text-ink3"><Words k="Paid" /> </span><b className="font-semibold text-ok">{formatRupees(totals.paid)}</b></span>
                <span><span className="text-ink3"><Words k="Left this year" /> </span><b className="font-semibold text-bad">{formatRupees(totals.balance)}</b></span>
                {advance > BigInt(0) && <span><span className="text-ink3"><Words k="Advance held" /> </span><b className="font-semibold text-info">{formatRupees(advance)}</b></span>}
              </div>
            </div>
            <div className="hidden sm:block"><Ring value={paidPct} size={64} stroke={7}><span className="text-[13px] font-bold tnum">{paidPct}%</span></Ring></div>
          </Card>
        }
      />
    </div>
  );
}
