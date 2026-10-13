// Every Salary Management action: the role is checked on the server, the work
// runs in the school's own transaction, plain-words problems go back to the form.
import "server-only";

import type { Action } from "@/lib/permissions";
import type { Flash } from "@/lib/flash";
import type { SchoolContext, Tx } from "@/lib/db";
import type { Current } from "@/lib/current";
import { MoneyProblem } from "@/lib/fees/problem";
import { salaryLevel } from "@/lib/salary/access";
import { moneyAction } from "../../fee-management/_lib/action";

type Work<T> = (tx: Tx, ctx: SchoolContext, current: Current) => Promise<T>;

/** A change to salary: only people with full Salary Management (HR's View and Own are refused on the server). */
export const salaryAction = <T>(action: Action, fd: FormData | undefined, work: Work<T>, success: (result: T) => Flash | string) =>
  moneyAction("salary-management", action, fd, async (tx, ctx, _viewer, current) => {
    if (salaryLevel(current.permissions) !== "full") throw new MoneyProblem("Only the Accountant, the Principal or the School Admin can change salary.");
    return work(tx, ctx, current);
  }, success, { staffOnly: false });
