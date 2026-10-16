// One platform invoice in a list, with the actions the person's role allows.
import Link from "next/link";
import { Check, Download, FileText, FileX, Send } from "lucide-react";
import type { PlatformInvoice } from "@prisma/client";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { formatDate, formatRupees } from "@/lib/format";
import { invoiceSummary } from "@/lib/console/billing";

export type InvoiceCan = { invoice: boolean; markPaid: boolean; approve: boolean };

const join = (base: string, q: string) => `${base}${base.includes("?") ? "&" : "?"}${q}`;

export function InvoiceRow({ i, schoolName, base, can, today }: { i: PlatformInvoice; schoolName?: string | null; base: string; can: InvoiceCan; today: Date }) {
  const unpaid = i.status === "UNPAID";
  const late = unpaid && i.dueOn < today;
  const label = i.status === "WAITING" ? "Waiting for Owner’s OK" : i.status === "PAID" ? "Paid" : i.status === "CANCELLED" ? "Cancelled" : late ? "Overdue" : i.sentAt ? "Unpaid" : "Not sent";
  const tone = i.status === "PAID" ? "ok" : i.status === "CANCELLED" ? "neutral" : late ? "bad" : "warn";
  const taxable = i.subtotalPaise - i.discountPaise;
  const via = i.paidVia === "RAZORPAY" ? "Razorpay" : i.paidVia === "CHEQUE" ? "cheque" : i.paidVia === "BANK" ? "bank transfer" : null;
  return (
    <li className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3.5 border-t border-line/70">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", i.status === "CANCELLED" ? "bg-sunken text-ink3" : "bg-brand/10 text-brand")}>{i.status === "CANCELLED" ? <FileX size={19} aria-hidden="true" /> : <FileText size={19} aria-hidden="true" />}</span>
        <div className="min-w-0">
          <p className="font-semibold text-[14.5px] leading-tight"><span className="font-mono text-[12.5px]">{i.number}</span>{schoolName && <> · {schoolName}</>}</p>
          <p className={cx("text-[13px] text-ink3", i.status === "CANCELLED" && "line-through")}>{invoiceSummary(i)}</p>
          <p className="text-[12.5px] text-ink3">{formatDate(i.issuedOn)} · due {formatDate(i.dueOn)}{i.paidAt ? ` · paid ${formatDate(i.paidAt)}${via ? ` by ${via}` : ""}${i.paidRef ? ` (${i.paidRef})` : ""}` : ""}</p>
          {i.cancelReason && <p className="text-[12.5px] text-ink2 mt-0.5">Cancelled{i.cancelledAt ? ` on ${formatDate(i.cancelledAt)}` : ""}: {i.cancelReason}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap pl-[52px] md:pl-0 md:justify-end shrink-0">
        <div className="text-right mr-1">
          <p className={cx("font-semibold tnum text-[14.5px]", i.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(i.totalPaise)}</p>
          <p className="text-[11.5px] text-ink3 tnum">{formatRupees(taxable)} + GST {formatRupees(i.gstPaise)}</p>
        </div>
        <Pill tone={tone}>{label}</Pill>
        {i.status === "WAITING" && can.approve && <Link scroll={false} href={join(base, `act=approve:${i.id}`)} className={buttonClass("secondary", "sm")}><Check size={15} aria-hidden="true" />OK and send</Link>}
        {unpaid && can.invoice && <Link scroll={false} href={join(base, `act=resendinv:${i.id}`)} className={buttonClass("ghost", "sm")}><Send size={15} aria-hidden="true" />{i.sentAt ? "Resend" : "Send"}</Link>}
        {unpaid && can.markPaid && <Link scroll={false} href={join(base, `act=paid:${i.id}`)} className={buttonClass("secondary", "sm")}><Check size={15} aria-hidden="true" />Mark paid</Link>}
        {(unpaid || i.status === "WAITING") && can.markPaid && <Link scroll={false} href={join(base, `act=cancelinv:${i.id}`)} className={buttonClass("ghost", "sm")}>Cancel</Link>}
        <a href={`/console/billing/invoices/${i.id}`} download className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label={`Download ${i.number} as PDF`} title="Download PDF"><Download size={16} aria-hidden="true" /></a>
      </div>
    </li>
  );
}
