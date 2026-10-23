// Library Management on the Dashboard (13 §4: "Librarian home: due today,
// overdue, reservations; operations panel"). The numbers are the desk's own:
// the overdue count is overdueWhere(), the same as Issue & Return and the
// Library Reports. Widgets show only when the library is built, switched on
// and open to the person (the registry checks the module).
import "server-only";

import { libCan, libViewer } from "../../library/access";
import { overdueWhere } from "../../library/desk";
import { librarySettings } from "../../library/settings";
import { membersOf } from "../../library/members";
import { BASE } from "../../library/words";
import { n, plural, shortDate } from "../common";
import type { ListRow, Viewer, Widget } from "../types";

const viewerOf = (v: Viewer) => libViewer(v as unknown as Parameters<typeof libViewer>[0]);
const deskWorker = (v: Viewer) => libCan(viewerOf(v)).desk;
const watches = (v: Viewer) => viewerOf(v).pages.issue !== "hidden";

/** Books due back today. */
const dueToday: Widget<"band"> = {
  id: "library.due-today",
  module: "library-management",
  kind: "band",
  homes: ["librarian"],
  allowed: deskWorker,
  async load(c) {
    const [due, issuedToday] = await Promise.all([
      c.tx.bookIssue.count({ where: { returnedAt: null, dueOn: c.today } }),
      c.tx.bookIssue.count({ where: { issuedOn: c.today } }),
    ]);
    return { id: "library.due-today", label: "Due back today", big: n(due), foot: `${plural(issuedToday, "book")} issued today`, href: `${BASE}?list=due` };
  },
};

/** Overdue books: on the Librarian's home and the leaders' (the same count as the desk). */
const overdueBand: Widget<"band"> = {
  id: "library.overdue",
  module: "library-management",
  kind: "band",
  homes: ["librarian", "leader"],
  allowed: watches,
  async load(c) {
    const [count, members] = await Promise.all([
      c.tx.bookIssue.count({ where: overdueWhere(c.today) }),
      c.tx.bookIssue.findMany({ where: overdueWhere(c.today), select: { studentId: true, staffId: true }, distinct: ["studentId", "staffId"] }),
    ]);
    return { id: "library.overdue", label: "Library books overdue", big: n(count), foot: count ? `With ${plural(members.length, "member")}` : "None late", href: `${BASE}?list=overdue` };
  },
};

/** Reservations waiting: a copy kept at the desk, or members in a queue. */
const reservations: Widget<"band"> = {
  id: "library.reservations",
  module: "library-management",
  kind: "band",
  homes: ["librarian"],
  allowed: deskWorker,
  async load(c) {
    const [ready, waiting] = await Promise.all([
      c.tx.reservation.count({ where: { status: "READY" } }),
      c.tx.reservation.count({ where: { status: "WAITING" } }),
    ]);
    return { id: "library.reservations", label: "Reservations", big: n(ready + waiting), foot: ready ? `${plural(ready, "book")} kept at the desk` : waiting ? `${plural(waiting, "member")} waiting` : "Nobody waiting", href: `${BASE}#reservations` };
  },
};

/** Books more than a week late: remind the members (desk) or the librarian (leaders). */
const longOverdue: Widget<"attention"> = {
  id: "library.long-overdue",
  module: "library-management",
  kind: "attention",
  homes: ["librarian", "leader"],
  allowed: watches,
  async load(c) {
    // The overdue report's own rule, opened with the same "more than 7 days late" (gap list G36).
    const count = await c.tx.bookIssue.count({ where: overdueWhere(c.today, 7) });
    if (!count) return null;
    const desk = deskWorker(c.viewer);
    const report = viewerOf(c.viewer).pages.reports !== "hidden";
    return {
      id: "library.long-overdue", tone: "warn", icon: "BookOpenCheck",
      title: `${plural(count, "library book")} more than a week late`,
      detail: desk ? "Send reminders to the parents and staff from the desk." : "Ask the librarian to follow up with the members.",
      action: desk ? "Remind" : "Review", href: report ? `${BASE}/reports?r=lib-overdue&late=7#report` : `${BASE}?list=overdue`, value: String(count),
    };
  },
};

/** Copies kept at the desk for members: the librarian hands them over. */
const readyToCollect: Widget<"panel"> = {
  id: "library.ready-panel",
  module: "library-management",
  kind: "panel",
  homes: ["librarian"],
  allowed: deskWorker,
  async load(c) {
    const rows = await c.tx.reservation.findMany({ where: { status: { in: ["READY", "WAITING"] } }, orderBy: [{ status: "asc" }, { reservedAt: "asc" }], take: 6 });
    if (!rows.length) return null;
    const s = await librarySettings(c.tx, c.viewer.ctx);
    const [members, books] = await Promise.all([
      membersOf(c.tx, c.viewer.ctx, s, { studentIds: rows.map((r) => r.studentId).filter((x): x is string => Boolean(x)), staffIds: rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)) }),
      c.tx.book.findMany({ where: { id: { in: rows.map((r) => r.bookId) } }, select: { id: true, title: true } }),
    ]);
    const list: ListRow[] = rows.map((r) => {
      const m = members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`);
      return {
        id: r.id, title: books.find((b) => b.id === r.bookId)?.title ?? "Book", sub: `${m?.name ?? "Member"}${m ? ` · ${m.short}` : ""} · since ${shortDate(r.reservedAt)}`,
        right: r.status === "READY" ? "Ready" : "Waiting", rightTone: r.status === "READY" ? "ok" : "info", href: m ? `${BASE}?member=${m.key}` : BASE,
      };
    });
    return { slot: "side", panel: { kind: "list", title: "Reservations", sub: "Kept at the desk first, then the queue", icon: "BookOpenCheck", rows: list, href: `${BASE}#reservations`, linkLabel: "All reservations", empty: "Nobody is waiting for a book." } };
  },
};

export const LIBRARY_WIDGETS: Widget[] = [dueToday, overdueBand, reservations, longOverdue, readyToCollect];
