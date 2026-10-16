// Every Fee Management action: the role is checked on the server, the work runs
// in the school's own transaction, plain-words problems go back to the form.
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import type { Action } from "@/lib/permissions";
import { PermissionDeniedError } from "@/lib/permissions";
import type { Flash } from "@/lib/flash";
import type { FormState } from "@/lib/forms";
import { act, problemState } from "@/lib/fees/act";
import { feeViewer, requireFeeStaff, type FeeViewer } from "@/lib/fees/access";
import type { ModuleKey } from "@/lib/modules";

type Work<T> = (tx: Tx, ctx: SchoolContext, viewer: FeeViewer, current: Current) => Promise<T>;

export async function moneyAction<T>(
  module: ModuleKey,
  action: Action,
  fd: FormData | undefined,
  work: Work<T>,
  success: (result: T) => Flash | string,
  opts: { staffOnly?: string | false } = {},
): Promise<FormState<T>> {
  let current: Current;
  try {
    ({ current } = await requireAction(module, action));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return problemState(e, fd) as FormState<T>;
    throw e;
  }
  return act(fd, () => withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (module === "fee-management" && opts.staffOnly !== false) requireFeeStaff(viewer, opts.staffOnly ?? "this");
    return work(tx, current.ctx, viewer, current);
  }), success);
}

export const feeAction = <T>(action: Action, fd: FormData | undefined, work: Work<T>, success: (result: T) => Flash | string, opts?: { staffOnly?: string | false }) =>
  moneyAction("fee-management", action, fd, work, success, opts);
