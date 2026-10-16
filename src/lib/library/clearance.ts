// Library clearance before a student leaves (A14): books not returned block
// the TC until they are returned, or marked lost and charged. A lost or
// damaged charge still waiting for approval, or a fine to be paid at the
// library desk, also holds it (fines added to fees are checked by "Fees").
// Imported by src/lib/students/leaving.ts; runs only when Library Management
// is switched on.
import "server-only";

import { registerClearanceCheck } from "../students/clearance";
import { formatRupees } from "../format";
import { BASE } from "./words";

registerClearanceCheck(
  "Library",
  async (tx, _ctx, studentId) => {
    const [out, waiting, deskDue] = await Promise.all([
      tx.bookIssue.count({ where: { studentId, returnedAt: null } }),
      tx.libraryFine.aggregate({ where: { studentId, status: "WAITING" }, _count: { _all: true }, _sum: { amountPaise: true } }),
      tx.libraryFine.aggregate({ where: { studentId, status: "DUE", feeDueId: null }, _sum: { amountPaise: true } }),
    ]);
    const href = `${BASE}?mode=return&member=S:${studentId}`;
    if (out > 0) return { clear: false, detail: `${out} library book${out === 1 ? "" : "s"} not returned`, actionHref: href, actionLabel: "Return or mark lost" };
    if (waiting._count._all > 0) return { clear: false, detail: `${formatRupees(waiting._sum.amountPaise ?? BigInt(0))} lost-book charge waiting for approval`, amountPaise: waiting._sum.amountPaise, actionHref: `${BASE}/fines?status=WAITING`, actionLabel: "Open fines" };
    const due = deskDue._sum.amountPaise ?? BigInt(0);
    if (due > BigInt(0)) return { clear: false, detail: `${formatRupees(due)} library fines due`, amountPaise: due, actionHref: `${BASE}/fines?member=S:${studentId}`, actionLabel: "Collect fine" };
    return { clear: true, detail: "Clear" };
  },
  { moduleKey: "library-management" },
);
