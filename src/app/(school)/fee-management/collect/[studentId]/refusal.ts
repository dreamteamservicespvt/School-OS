// What Collect Fee shows of the server's last refusal and of the counter
// discount limit (testing issues 5 and 30). Kept apart from the form so the
// rules can be tested (tests/fees/collect-form-refusal.test.ts).

/**
 * The server's refusal to show: none once the discount it was about changed
 * (issue 30), or once that discount went to the principal (issue 5: the red
 * "Ask for approval, then collect..." stayed under the green "Sent to the principal").
 */
export function refusalShown<S extends { ok: boolean }>(state: S | null | undefined, hiddenFor: unknown, sent: boolean): S | null {
  return state && !state.ok && hiddenFor !== state && !sent ? state : null;
}

/**
 * The Discount box's own line above the counter limit, before Collect is
 * pressed. Not repeated for the very discount that was just sent for approval.
 */
export function limitLine(a: { discountPaise: number; waivePaise: number; limitPaise: number; limit: string; sent: boolean }): string {
  return a.discountPaise > 0 && a.discountPaise + a.waivePaise > a.limitPaise && !a.sent ? `More than ${a.limit} needs the principal’s approval` : "";
}
