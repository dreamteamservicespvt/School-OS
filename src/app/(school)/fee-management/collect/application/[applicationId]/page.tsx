import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, IndianRupee, Printer, ReceiptText } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { applicantForFees } from "@/lib/fees/applicants";
import { COUNTER_MODES, modeLabel } from "@/lib/admission/fee";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Banner, Empty } from "@/components/money/kit";
import { BASE, feeGuard } from "../../../_lib/page";
import { ApplicantFeeForm } from "./applicant-form";

export const metadata = { title: "Collect Fee" };

type Tone = "ok" | "info" | "warn" | "bad" | "neutral";
const STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "ok" }, waiting: { label: "Waiting for payment confirmation", tone: "info" }, due: { label: "Not paid", tone: "warn" }, "not-needed": { label: "Not needed", tone: "neutral" },
};
const PAY: Record<string, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "Paid", tone: "ok" }, PENDING: { label: "Waiting for confirmation", tone: "info" }, FAILED: { label: "Failed", tone: "bad" }, CANCELLED: { label: "Cancelled", tone: "bad" },
};

/**
 * Collect Fee for an applicant (02 §2 "Collect application fee: opens Fee
 * Management, Collect Fee for this applicant"). An applicant is not a student
 * yet, so the fee stays on the application, with its own receipt series.
 */
export default async function ApplicantFeePage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const p = await feeGuard("collect");
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) notFound();
  const a = await withSchool(p.current.ctx, (tx) => applicantForFees(tx, p.viewer, applicationId));
  if (!a) notFound();
  const st = STATUS[a.status.key];
  const canTake = p.desk && !a.closed && a.leftPaise > BigInt(0);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link href={BASE} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 -ml-1 rounded-lg"><ArrowLeft size={17} aria-hidden="true" />Collect fee</Link>
        <span className="text-[13px] text-ink3 hidden md:inline">Collecting as {p.current.user.displayName}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={a.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-[18px] truncate">{a.name}</p>
                <p className="text-[13.5px] text-ink3 truncate">Application {a.applicationNo} · {a.className} (applied for){a.parent ? ` · ${a.parent}` : ""}</p>
              </div>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <p className="mt-3 text-[14px] text-ink2">
              Application fee {formatRupees(a.status.duePaise)}. Paid {formatRupees(a.status.paidPaise)}{a.leftPaise > BigInt(0) ? `, ${formatRupees(a.leftPaise)} left` : ""}.
            </p>
            <p className="mt-1 text-[13px] text-ink3">Not a student yet, so this fee stays on the application with its own receipts. It goes into the Day Book under Other fee types, Application fee.{a.admitted ? " Now admitted: the student’s other fees are collected from their own Collect Fee page." : ""}</p>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Payments" description="Payments are never deleted. A cancelled one stays with its receipt number." icon={ReceiptText} />
            {a.payments.length === 0 ? (
              <Empty icon={IndianRupee} title="Nothing paid yet" body="When the application fee is paid, its receipt shows here." />
            ) : (
              <ul className="px-2 pb-2">
                {a.payments.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] tnum">{formatRupees(x.amountPaise)} <span className="font-normal text-ink3">· {modeLabel(x.mode)}{x.reference ? ` · ${x.reference}` : ""}</span></p>
                      <p className="text-[12.5px] text-ink3">{x.receiptNo ? `Receipt ${x.receiptNo} · ` : ""}{formatDateTime(x.at, p.tz)}{x.takenBy ? ` · ${x.takenBy}` : ""}{x.status === "CANCELLED" && x.cancelReason ? ` · Cancelled: ${x.cancelReason}` : ""}</p>
                    </div>
                    <Pill tone={PAY[x.status].tone}>{PAY[x.status].label}</Pill>
                    {x.status === "CONFIRMED" && x.receiptNo && (
                      <Link href={`${BASE}/collect/application/${a.id}/receipt/${x.id}`} target="_blank" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"><Printer size={14} aria-hidden="true" />Receipt</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="p-5">
          <CardHeader title="Collect application fee" icon={IndianRupee} />
          {canTake ? (
            <ApplicantFeeForm applicationId={a.id} left={formatRupees(a.leftPaise)} modes={COUNTER_MODES.map((m) => ({ value: m.value, label: m.label }))} />
          ) : (
            <Banner tone={a.closed ? "warn" : "ok"}>{a.closed ? "This application is closed, so no fee can be taken." : a.status.key === "waiting" ? "Waiting for payment confirmation from Razorpay. The receipt is made when it is confirmed." : "Nothing is due on this application."}</Banner>
          )}
          <p className="mt-3 text-[12.5px] text-ink3">To cancel a receipt, the Principal or School Admin opens the application in Admission Management.</p>
        </Card>
      </div>
    </div>
  );
}
