import "server-only";

import { formatDate, formatRupees } from "@/lib/format";
import type { PaymentView } from "@/lib/fees/payment-view";
import { modeWord } from "../_components/bits";

export type PaySheetData = ReturnType<typeof toSheet>;

/** The payment sheet's words, made on the server. */
export function toSheet(v: PaymentView, today: Date) {
  return {
    id: v.id,
    studentId: v.studentId,
    title: v.status === "FAILED" ? "Online payment failed" : v.receiptNo ? `Receipt ${v.receiptNo}` : v.status === "WAITING" ? "Waiting for verification" : "Payment",
    sub: `${v.student?.name ?? "Student"} · ${v.student?.classSection ?? ""} · ${v.when}`,
    studentName: v.student?.name ?? "the student",
    parent: v.student?.parent ?? null,
    phone: v.student?.phone ?? null,
    status: v.status as string,
    broughtIn: v.broughtIn,
    receiptNo: v.receiptNo,
    lines: v.lines.map((l) => ({ label: l.label, amount: formatRupees(l.amount) })),
    discount: v.discount > BigInt(0) ? formatRupees(v.discount) : null,
    tax: v.tax,
    modeText: `${modeWord(v.mode)}${v.reference ? ` · ${v.reference}` : ""}`,
    total: formatRupees(v.amount),
    online: v.online,
    collectedBy: v.collectedBy,
    goesTo: v.goesTo,
    dayBook: v.dayBook,
    cancel: v.cancel,
    cancelWaiting: v.cancelWaiting,
    failure: v.failure,
    verify: v.verify,
    canResendLink: v.status === "FAILED",
    mode: v.mode as string,
    past: v.date < today,
    paidOn: formatDate(v.date),
    note: v.note,
  };
}
