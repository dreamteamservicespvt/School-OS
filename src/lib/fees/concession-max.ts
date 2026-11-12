// The most a concession can take off, safe in the browser (the New concession form) and on the server.

export type OpenRow = { headId: string; late: boolean; due: string; leftPaise: number };

/**
 * The most a concession can take off: what is still to pay on the open rows it
 * covers (the chosen heads, or late fees for a waiver, in the period by due
 * date). The same rule as the server's check in giveConcession; the New
 * concession form shows it as "Not more than …" (layman test LB1).
 */
export function mostOff(
  open: OpenRow[],
  pick: { waiver: boolean; headIds: string[]; from: string | null; to: string | null },
) {
  return open
    .filter((r) => (pick.waiver ? r.late : !r.late && pick.headIds.includes(r.headId)))
    .filter((r) => (!pick.from || r.due >= pick.from) && (!pick.to || r.due <= pick.to))
    .reduce((s, r) => s + r.leftPaise, 0);
}
