// The automation log (11-communication.md §6): what each automatic rule sent,
// to whom, and why (which rule and which event).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext } from "../db";
import type { ListParams } from "../list";

import { inPeriod, PERIOD_FILTERS } from "./period";
export const LOG_FILTERS = ["rule", "outcome", ...PERIOD_FILTERS] as const;

export const OUTCOME_LABEL: Record<string, string> = {
  sent: "Sent",
  "rule-off": "Rule switched off",
  "opted-out": "Opted out",
  "no-credits": "Not enough credits",
  skipped: "Skipped",
  "not-sent": "Not sent",
  duplicate: "Already sent",
};

export function logWhere(ctx: SchoolContext, params: ListParams, timeZone = "Asia/Kolkata"): Prisma.AutomationLogWhereInput {
  const and: Prisma.AutomationLogWhereInput[] = [{ schoolId: ctx.schoolId }];
  if (params.filters.rule) and.push({ ruleKey: params.filters.rule });
  if (params.filters.outcome) and.push({ outcome: params.filters.outcome });
  const when = inPeriod(params.filters, timeZone);
  if (when) and.push({ createdAt: when });
  if (params.q) and.push({ OR: [{ recipientName: { contains: params.q, mode: "insensitive" } }, { eventLabel: { contains: params.q, mode: "insensitive" } }] });
  return { AND: and };
}
