// Every Finance Management action: the role is checked on the server, the work
// runs in the school's own transaction, plain-words problems go back to the form.
import "server-only";

import type { Action } from "@/lib/permissions";
import type { Flash } from "@/lib/flash";
import type { SchoolContext, Tx } from "@/lib/db";
import type { Current } from "@/lib/current";
import type { FeeViewer } from "@/lib/fees/access";
import { moneyAction } from "../../fee-management/_lib/action";

type Work<T> = (tx: Tx, ctx: SchoolContext, viewer: FeeViewer, current: Current) => Promise<T>;

export const financeAction = <T>(action: Action, fd: FormData | undefined, work: Work<T>, success: (result: T) => Flash | string) =>
  moneyAction("finance-management", action, fd, work, success, { staffOnly: false });
