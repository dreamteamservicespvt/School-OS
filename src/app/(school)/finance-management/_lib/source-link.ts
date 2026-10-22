// Which record pages the signed-in person may open from a Day Book entry.
import "server-only";

import type { Current } from "@/lib/current";
import { feePageAllowedFor } from "@/lib/fees/access";
import { can } from "@/lib/permissions";
import { salaryPageAllowed } from "@/lib/salary/access";
import type { SourceLinkAccess } from "@/lib/finance/source-link";

export function sourceLinkAccess(current: Current): SourceLinkAccess {
  return {
    payments: feePageAllowedFor(current, "payments"),
    refunds: feePageAllowedFor(current, "concessions"),
    applications: can(current.permissions, "admission-management", "view"),
    salaryRuns: salaryPageAllowed(current.permissions, "generate"),
    advances: salaryPageAllowed(current.permissions, "advances"),
  };
}
