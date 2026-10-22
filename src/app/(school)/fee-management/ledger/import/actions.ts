"use server";

// Fees due before go-live (workflow 15; gap list G14): the school says the
// unpaid part of plan installments due before the go-live date was collected in
// the old software or is inside the old dues, so it is not billed again; Undo
// puts it back. Used from Import old dues and receipts and from the go-live check.

import { formatDate, formatRupees } from "@/lib/format";
import { MoneyProblem } from "@/lib/fees/problem";
import { str } from "@/lib/fees/act";
import { counterAllowed, feeSettings } from "@/lib/fees/settings";
import { settleBeforeGoLive, undoSettleBeforeGoLive } from "@/lib/fees/before-go-live";
import { moveInGoLive } from "@/lib/move-in/live";
import type { SchoolContext, Tx } from "@/lib/db";
import type { FeeViewer } from "@/lib/fees/access";
import { feeAction } from "../../_lib/action";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Changing many students' fees at once is "Edit a student's fees" (a counter permission in Fee Settings). */
async function mayEdit(tx: Tx, ctx: SchoolContext, viewer: FeeViewer) {
  if (!counterAllowed(await feeSettings(tx, ctx), viewer.roleKeys, "edit-student-fees")) {
    throw new MoneyProblem("Your role cannot change students’ fees. The School Admin can allow it in Fee Settings, Counter permissions.");
  }
}

export async function settleBeforeGoLiveAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayEdit(tx, ctx, viewer);
    const goLive = await moveInGoLive(tx, ctx);
    if (!goLive) throw new MoneyProblem("Type the go-live date on the go-live check first (Settings, Data Backup & Security, Switching to School OS).");
    const scope = str(fd, "scope");
    if (scope !== "old-dues" && scope !== "all") throw new MoneyProblem("Choose whose fees to settle.", "scope");
    const r = await settleBeforeGoLive(tx, ctx, { scope, goLive });
    return { ...r, goLive };
  }, (r) => `${formatRupees(r.paise)} of fees due before ${formatDate(r.goLive)} is settled in the old software for ${plural(r.students, "student")} (${plural(r.rows, "row")}). It is no longer owed and stays on each ledger with the reason. Undo puts it back.`);
}

export async function undoSettleBeforeGoLiveAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    await mayEdit(tx, ctx, viewer);
    return undoSettleBeforeGoLive(tx, ctx);
  }, (r) => `${formatRupees(r.paise)} is owed again by ${plural(r.students, "student")}, as before it was settled.`);
}
