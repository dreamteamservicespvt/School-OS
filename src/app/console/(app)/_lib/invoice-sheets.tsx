// The sheets an invoice's buttons open (?act=paid:<id> and so on), shared by a
// school's page and Plans & Billing. Each shows only when the role may use it.
import "server-only";

import { withConsole } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { invoiceSummary, istDay } from "@/lib/console/billing";
import type { ConsoleCurrent } from "@/lib/console/current";
import { ActSheet } from "@/components/console/sheets";
import { MarkPaidSheet } from "@/components/console/billing-sheets";
import { approveTopupAction, cancelInvoiceAction, markPaidAction } from "../billing/actions";
import { sendInvoiceAction } from "../schools/actions";

export async function invoiceSheet(act: string | undefined, closeHref: string, c: ConsoleCurrent) {
  const m = /^(paid|cancelinv|approve|resendinv):([0-9a-f-]{36})$/i.exec(act ?? "");
  if (!m) return null;
  const [, kind, id] = m;
  const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id } }));
  if (!inv) return null;
  const card = await withConsole((tx) => tx.consoleSchool.findUnique({ where: { id: inv.forSchoolId }, select: { name: true, status: true } }));
  const name = card?.name ?? "";
  const total = formatRupees(inv.totalPaise);
  if (kind === "paid" && c.can("markPaid") && inv.status === "UNPAID") {
    return <MarkPaidSheet closeHref={closeHref} invoiceId={inv.id} number={inv.number} schoolName={name} total={total} reactivates={card?.status === "SUSPENDED"} today={istDay().toISOString().slice(0, 10)} action={markPaidAction} />;
  }
  if (kind === "cancelinv" && c.can("markPaid") && (inv.status === "UNPAID" || inv.status === "WAITING")) {
    return (
      <ActSheet title={`Cancel invoice ${inv.number}?`} sub={`${name} · ${total}`} closeHref={closeHref} action={cancelInvoiceAction} submitLabel="Cancel invoice" danger hidden={{ invoiceId: inv.id }}
        reason={{ placeholder: "Wrong student count. A new invoice replaces it." }}>
        <p>Invoices are never deleted. This one stays in the list, marked cancelled, with your reason. Its Razorpay link stops working.</p>
      </ActSheet>
    );
  }
  if (kind === "approve" && c.can("approve") && inv.status === "WAITING") {
    return (
      <ActSheet title={`OK top-up invoice ${inv.number}?`} sub={`${name} · ${total}`} closeHref={closeHref} action={approveTopupAction} submitLabel={`Send ${total} invoice`} hidden={{ invoiceId: inv.id }}>
        <p>{invoiceSummary(inv)}.</p>
        <p>It is dated today, due in 14 days, and goes to the School Admins and the Principal with a Razorpay payment link.</p>
      </ActSheet>
    );
  }
  if (kind === "resendinv" && c.can("invoice") && inv.status === "UNPAID") {
    return (
      <ActSheet title={inv.sentAt ? "Resend this invoice?" : "Send this invoice?"} sub={`${name} · ${inv.number}`} closeHref={closeHref} action={sendInvoiceAction} submitLabel={inv.sentAt ? "Resend invoice" : "Send invoice"} hidden={{ invoiceId: inv.id }}>
        <p>Invoice <b className="text-ink">{inv.number}</b> for {total} ({invoiceSummary(inv)}), due {formatDate(inv.dueOn)}, goes to the School Admins and the Principal on WhatsApp and email, with its Razorpay payment link.</p>
        <p>It marks itself paid when the payment arrives.</p>
      </ActSheet>
    );
  }
  return null;
}
