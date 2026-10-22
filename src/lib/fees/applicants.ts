// The application fee at Fee Management's counter (02 §2 "Collect application
// fee: opens Fee Management, Collect Fee for this applicant", 05-roles.md:
// the Accountant takes the application fee through Fee Management, gap list
// G21). An applicant is not a student yet, so the payment stays on the
// application with the application fee's own receipt series; it is taken by
// the same rule as at the admission counter (src/lib/admission/fee.ts) and
// posted to the Day Book by Fee Management (application-fee.ts). Payments
// taken before this page existed show here too, from the same records.
import "server-only";

import type { Application, ApplicationStage, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { AdmissionProblem } from "../admission/act";
import { feeStatus, takeCounterPayment, type CounterInput, type FeeStatus } from "../admission/fee";
import type { FeeViewer } from "./access";
import { requireFeeStaff } from "./access";
import { MoneyProblem } from "./problem";

/** Applications a fee counter never takes money for. */
const NOT_FOR_FEES: ApplicationStage[] = ["REJECTED", "WITHDRAWN"];

/** Applications with an application fee that this person may see: their campus only, when limited to one. */
export function applicantScope(v: Pick<FeeViewer, "campusId">): Prisma.ApplicationWhereInput {
  return { feeDuePaise: { gt: BigInt(0) }, ...(v.campusId ? { campusId: v.campusId } : {}) };
}

export type FoundApplicant = { id: string; name: string; applicationNo: string; className: string; parent: string | null; status: FeeStatus; closed: boolean };

const parentOf = (a: Pick<Application, "fatherName" | "motherName" | "guardianName">) => a.fatherName ?? a.motherName ?? a.guardianName ?? null;

/** Collect Fee's search: applicants by name, application number, parent's name or phone. People who only see their own sections find none. */
export async function findApplicants(tx: Tx, v: FeeViewer, q: string, limit = 6): Promise<FoundApplicant[]> {
  if (v.see !== "all" || q.trim().length < 2) return [];
  const words = q.trim();
  const digits = words.replace(/\D/g, "");
  const or: Prisma.ApplicationWhereInput[] = [
    { fullName: { contains: words, mode: "insensitive" } },
    { applicationNo: { contains: words, mode: "insensitive" } },
    { fatherName: { contains: words, mode: "insensitive" } },
    { motherName: { contains: words, mode: "insensitive" } },
    { guardianName: { contains: words, mode: "insensitive" } },
  ];
  if (digits.length >= 4) or.push({ phone: { contains: digits } }, { altPhone: { contains: digits } });
  const apps = await tx.application.findMany({
    where: { ...applicantScope(v), stage: { notIn: NOT_FOR_FEES }, OR: or },
    orderBy: { createdAt: "desc" }, take: limit, include: { payments: true },
  });
  const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(apps.map((a) => a.classId))] } }, select: { id: true, name: true } });
  return apps.map((a) => ({
    id: a.id, name: a.fullName, applicationNo: a.applicationNo, className: classes.find((c) => c.id === a.classId)?.name ?? "",
    parent: parentOf(a), status: feeStatus(a, a.payments), closed: NOT_FOR_FEES.includes(a.stage),
  }));
}

/** One applicant's application fee for the counter: what is due, and every payment with its receipt. Null when not theirs to see. */
export async function applicantForFees(tx: Tx, v: FeeViewer, applicationId: string) {
  if (v.see !== "all") return null;
  const app = await tx.application.findFirst({ where: { id: applicationId, ...applicantScope(v) }, include: { payments: { orderBy: { createdAt: "asc" } } } });
  if (!app) return null;
  const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
  const takers = await tx.staff.findMany({ where: { userLoginId: { in: app.payments.map((p) => p.receivedById).filter((x): x is string => Boolean(x)) } }, select: { userLoginId: true, fullName: true } });
  const status = feeStatus(app, app.payments);
  return {
    id: app.id, name: app.fullName, applicationNo: app.applicationNo, className: cls?.name ?? "", parent: parentOf(app), phone: app.phone,
    stage: app.stage, admitted: app.stage === "ADMITTED", closed: NOT_FOR_FEES.includes(app.stage),
    status, leftPaise: status.duePaise > status.paidPaise ? status.duePaise - status.paidPaise : BigInt(0),
    payments: app.payments.map((p) => ({
      id: p.id, receiptNo: p.receiptNo, amountPaise: p.amountPaise, mode: p.mode, reference: p.reference ?? p.gatewayPaymentId ?? null,
      status: p.cancelledAt ? "CANCELLED" as const : p.status, at: p.confirmedAt ?? p.createdAt, cancelReason: p.cancelReason,
      takenBy: takers.find((t) => t.userLoginId === p.receivedById)?.fullName ?? null,
    })),
  };
}

/** Takes the application fee at Fee Management's counter: full Fee Management only, on the person's own campus. */
export async function collectApplicationFee(tx: Tx, ctx: SchoolContext, v: FeeViewer, applicationId: string, input: CounterInput) {
  requireFeeStaff(v, "collecting fees");
  const app = await tx.application.findFirst({ where: { id: applicationId, ...applicantScope(v) } });
  if (!app) throw new MoneyProblem("This applicant was not found, or has no application fee.");
  try {
    return await takeCounterPayment(tx, ctx, app, input, "fee-management");
  } catch (e) {
    if (e instanceof AdmissionProblem) throw new MoneyProblem(e.message, e.field);
    throw e;
  }
}
