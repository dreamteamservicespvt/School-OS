// Shared by server pages and client lists (no "server-only"): a screen's own
// error sentence saved as a reason by an older version (live test 14, 31).

/** A screen's own error sentence must never be saved as a reason (QA issue 31). */
export const isScreenMessage = (s: string) => /need the principal.s approval|give a reason of at least|ask for approval/i.test(s);
/** What the lists show for a reason: old rows that hold an error sentence read "No reason given". */
export const shownReason = (s: string) => (isScreenMessage(s) ? "No reason given" : s);
