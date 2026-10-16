// Undo for Finance Management (P5): closing a day can be undone by the person
// who closed it, straight after. The server checks their rights again.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool } from "../db";
import { requirePermission } from "../permissions";
import { MoneyProblem } from "../fees/problem";
import { closesDays, reopenDay } from "./day-close";

registerUndo("finance-day-close", async (current, id) => {
  requirePermission(current.permissions, "finance-management", "create");
  if (!closesDays(current)) throw new MoneyProblem("Closing the day is the accountant's work.");
  await withSchool(current.ctx, (tx) => reopenDay(tx, current.ctx, id, "", { undo: true }));
});
