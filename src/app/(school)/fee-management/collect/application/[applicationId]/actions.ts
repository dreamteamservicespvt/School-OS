"use server";

import { formatRupees } from "@/lib/format";
import { collectApplicationFee } from "@/lib/fees/applicants";
import { id, needRupees, str } from "@/lib/fees/act";
import { feeAction } from "../../../_lib/action";

export type ApplicationFeeTaken = { applicationId: string; paymentId: string; receiptNo: string; amount: string };

/** Collect Fee for an applicant: the application fee at the counter, with its receipt (02 §2). */
export async function collectApplicationFeeAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, viewer) => {
    const applicationId = id(fd, "applicationId", "applicant");
    const p = await collectApplicationFee(tx, ctx, viewer, applicationId, {
      amountPaise: needRupees(fd, "amount", "Amount received"),
      mode: str(fd, "mode"),
      reference: str(fd, "reference").replace(/\s+/g, "").slice(0, 80) || null,
    });
    return { applicationId, paymentId: p.id, receiptNo: p.receiptNo ?? "", amount: formatRupees(p.amountPaise) } satisfies ApplicationFeeTaken;
  }, (r) => ({ message: `Application fee ${r.amount} received. Receipt ${r.receiptNo}.`, link: { href: `/fee-management/collect/application/${r.applicationId}/receipt/${r.paymentId}`, label: "Print receipt" } }), { staffOnly: "collecting fees" });
}
