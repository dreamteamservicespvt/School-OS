// Library Reports (13 §7): books issued (by date, class, member), overdue
// books with days overdue, most read books and categories, fines collected,
// due and waived, stock check results, and the catalogue with copies by
// status. Each report is one function returning a Table, so the Library
// Reports page, its files and the Reports & Analytics catalogue show the same
// rows. The overdue count is the desk's own (overdueWhere).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Row, Table } from "../reports/types";
import { librarySettings } from "./settings";
import { membersOf, type Member } from "./members";
import { overdueAsAt, overdueWhere, lateFine, daysBetween } from "./desk";
import { syncFeeFines } from "./fines";
import { copyCounts, shelfOf } from "./catalogue";
import { showIsbn } from "./isbn";
import { BASE, COPY_STATUS, FINE_REASON, FINE_STATUS, type CopyStatus, type FineStatus } from "./words";

export type LibFilter = {
  /** Inclusive dates (00:00 UTC) of the chosen period; null for all dates. */
  from: Date | null;
  to: Date | null;
  today: Date;
  /** Sections of the chosen class or section; null for all. */
  sectionIds: string[] | null;
  /** Report-specific choice (stock check session). */
  session?: string | null;
  /** Overdue report: only books more than this many days late (the Dashboard's card); 0 or left out for every overdue book. */
  lateMoreThan?: number;
  /** A year that is over (?year=): overdue as it stood at the end of `today`, its last day (desk.ts overdueAsAt). */
  asAt?: boolean;
};

const ZERO = BigInt(0);
const dateRange = (f: LibFilter) => (f.from && f.to ? { gte: f.from, lte: f.to } : undefined);
const momentRange = (f: LibFilter) => (f.from && f.to ? { gte: f.from, lt: new Date(f.to.getTime() + 86_400_000) } : undefined);

async function membersFor(tx: Tx, ctx: SchoolContext, rows: { studentId: string | null; staffId: string | null }[]) {
  const s = await librarySettings(tx, ctx);
  return membersOf(tx, ctx, s, { studentIds: rows.map((r) => r.studentId).filter((x): x is string => Boolean(x)), staffIds: rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)) });
}
const mOf = (map: Map<string, Member>, r: { studentId: string | null; staffId: string | null }) => map.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null;

/** "Class 7 B" for every section id given. */
async function sectionLabels(tx: Tx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const rows = list.length ? await tx.section.findMany({ where: { id: { in: list } }, select: { id: true, name: true, schoolClass: { select: { name: true, sortOrder: true } } } }) : [];
  return new Map(rows.map((s) => [s.id, { label: `${s.schoolClass.name} ${s.name}`, sort: s.schoolClass.sortOrder * 100 + s.name.charCodeAt(0) }]));
}

const sectionWhere = (f: LibFilter): Prisma.BookIssueWhereInput => (f.sectionIds ? { sectionId: { in: f.sectionIds } } : {});

/** The overdue count on a day: the same number on the desk, the dashboard and the reports. */
export async function overdueCount(tx: Tx, today: Date, f?: Pick<LibFilter, "sectionIds" | "asAt">) {
  return tx.bookIssue.count({ where: { ...(f?.asAt ? overdueAsAt(today) : overdueWhere(today)), ...(f ? sectionWhere(f as LibFilter) : {}) } });
}

/* ---------- Books issued ---------- */

export async function issuedReport(tx: Tx, ctx: SchoolContext, f: LibFilter): Promise<Table> {
  const issues = await tx.bookIssue.findMany({
    where: { issuedOn: dateRange(f), ...sectionWhere(f) }, orderBy: [{ issuedOn: "desc" }, { issuedAt: "desc" }], take: 5000,
    include: { copy: { select: { accessionNo: true, book: { select: { title: true } } } } },
  });
  const members = await membersFor(tx, ctx, issues);
  const secs = await sectionLabels(tx, issues.map((i) => i.sectionId));
  const rows: Row[] = issues.map((i) => {
    const m = mOf(members, i);
    const status = i.returnedAt ? (i.outcome === "LOST" ? "Lost" : i.outcome === "DAMAGED" ? "Returned damaged" : "Returned") : i.dueOn < f.today ? "Overdue" : "Out";
    return { issued: i.issuedOn, book: i.copy.book.title, accession: i.copy.accessionNo, member: m?.name ?? "", card: m?.cardNo ?? "", cls: i.sectionId ? secs.get(i.sectionId)?.label ?? "" : m?.kind === "STAFF" ? "Staff" : "", due: i.dueOn, returned: i.returnedOn, renewals: i.renewals, status };
  });
  return {
    columns: [{ key: "issued", label: "Issued", kind: "date" }, { key: "book", label: "Book" }, { key: "accession", label: "Accession" }, { key: "member", label: "Member" }, { key: "card", label: "Card no." }, { key: "cls", label: "Class" }, { key: "due", label: "Due", kind: "date" }, { key: "returned", label: "Returned", kind: "date" }, { key: "renewals", label: "Renewals", kind: "number" }, { key: "status", label: "Status" }],
    rows, note: `${rows.length} issue${rows.length === 1 ? "" : "s"}.`, empty: "No books were issued on these dates.",
    links: [{ label: "Open Issue & Return", href: BASE }],
  };
}

/* ---------- Overdue ---------- */

export async function overdueReport(tx: Tx, ctx: SchoolContext, f: LibFilter): Promise<Table> {
  const s = await librarySettings(tx, ctx);
  const late = f.lateMoreThan ?? 0;
  const issues = await tx.bookIssue.findMany({ where: { ...(f.asAt ? overdueAsAt(f.today, late) : overdueWhere(f.today, late)), ...sectionWhere(f) }, orderBy: { dueOn: "asc" }, include: { copy: { select: { accessionNo: true, book: { select: { title: true } } } } } });
  const members = await membersFor(tx, ctx, issues);
  const secs = await sectionLabels(tx, issues.map((i) => i.sectionId));
  const rows: Row[] = issues.map((i) => {
    const m = mOf(members, i);
    const fine = lateFine(s, i.dueOn, f.today);
    return { member: m?.name ?? "", card: m?.cardNo ?? "", cls: i.sectionId ? secs.get(i.sectionId)?.label ?? "" : m?.kind === "STAFF" ? "Staff" : "", book: i.copy.book.title, accession: i.copy.accessionNo, issued: i.issuedOn, due: i.dueOn, days: fine.lateDays, fine: fine.amountPaise, reminded: i.lastRemindedOn };
  });
  const t: Table = {
    columns: [{ key: "member", label: "Member" }, { key: "card", label: "Card no." }, { key: "cls", label: "Class" }, { key: "book", label: "Book" }, { key: "accession", label: "Accession" }, { key: "issued", label: "Issued", kind: "date" }, { key: "due", label: "Due", kind: "date" }, { key: "days", label: "Days overdue", kind: "number" }, { key: "fine", label: "Fine so far", kind: "money" }, { key: "reminded", label: "Last reminded", kind: "date" }],
    rows, empty: "No books are overdue.", note: late
      ? `${rows.length} book${rows.length === 1 ? "" : "s"} more than ${late} days late: the same count as the Dashboard.`
      : `${rows.length} book${rows.length === 1 ? "" : "s"} overdue today: the same count as Issue & Return.`,
    links: [{ label: "Remind from Issue & Return", href: `${BASE}?list=overdue` }],
  };
  if (rows.length) t.totals = { member: "Total", card: null, cls: null, book: null, accession: null, issued: null, due: null, days: null, fine: rows.reduce<bigint>((a, r) => a + (r.fine as bigint), ZERO), reminded: null };
  return t;
}

/** Overdue books in buckets of days late (Library Reports, and the Principal's overdue watch). */
export async function overdueBuckets(tx: Tx, today: Date, asAt = false) {
  const rows = await tx.bookIssue.findMany({ where: asAt ? overdueAsAt(today) : overdueWhere(today), select: { dueOn: true } });
  const b = [{ key: "1-7", label: "1–7 days", value: 0 }, { key: "8-14", label: "8–14 days", value: 0 }, { key: "15-30", label: "15–30 days", value: 0 }, { key: "30+", label: "Over 30", value: 0 }];
  for (const r of rows) {
    const d = daysBetween(r.dueOn, today);
    b[d <= 7 ? 0 : d <= 14 ? 1 : d <= 30 ? 2 : 3].value++;
  }
  return b;
}

/* ---------- Most read ---------- */

export async function popularBooks(tx: Tx, f: LibFilter, take = 50) {
  const g = await tx.bookIssue.groupBy({ by: ["bookId"], where: { issuedOn: dateRange(f), ...sectionWhere(f) }, _count: { _all: true }, orderBy: { _count: { bookId: "desc" } }, take });
  const books = await tx.book.findMany({ where: { id: { in: g.map((x) => x.bookId) } }, select: { id: true, title: true, authorText: true, categoryId: true } });
  const cats = await tx.libraryCategory.findMany({ select: { id: true, name: true } });
  return g.map((x) => {
    const b = books.find((y) => y.id === x.bookId);
    return { bookId: x.bookId, title: b?.title ?? "", author: b?.authorText ?? "", category: cats.find((c) => c.id === b?.categoryId)?.name ?? "No category", times: x._count._all };
  });
}

export async function popularReport(tx: Tx, _ctx: SchoolContext, f: LibFilter): Promise<Table> {
  const list = await popularBooks(tx, f, 100);
  return {
    columns: [{ key: "rank", label: "Rank", kind: "number" }, { key: "title", label: "Book" }, { key: "author", label: "Author" }, { key: "category", label: "Category" }, { key: "times", label: "Times issued", kind: "number" }],
    rows: list.map((b, i) => ({ rank: i + 1, title: b.title, author: b.author, category: b.category, times: b.times })),
    empty: "No books were issued on these dates.",
  };
}

export async function categoriesRead(tx: Tx, f: LibFilter) {
  const g = await tx.bookIssue.groupBy({ by: ["bookId"], where: { issuedOn: dateRange(f), ...sectionWhere(f) }, _count: { _all: true } });
  const books = g.length ? await tx.book.findMany({ where: { id: { in: g.map((x) => x.bookId) } }, select: { id: true, categoryId: true } }) : [];
  const cats = await tx.libraryCategory.findMany({ select: { id: true, name: true } });
  const by = new Map<string, number>();
  for (const x of g) {
    const cat = cats.find((c) => c.id === books.find((b) => b.id === x.bookId)?.categoryId)?.name ?? "No category";
    by.set(cat, (by.get(cat) ?? 0) + x._count._all);
  }
  return [...by.entries()].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times);
}

export async function categoriesReport(tx: Tx, _ctx: SchoolContext, f: LibFilter): Promise<Table> {
  const list = await categoriesRead(tx, f);
  const total = list.reduce((a, b) => a + b.times, 0);
  const t: Table = {
    columns: [{ key: "name", label: "Category" }, { key: "times", label: "Times issued", kind: "number" }, { key: "share", label: "Share", kind: "percent" }],
    rows: list.map((c) => ({ name: c.name, times: c.times, share: total ? Math.round((c.times / total) * 1000) / 10 : 0 })),
    empty: "No books were issued on these dates.",
  };
  if (list.length) t.totals = { name: "Total", times: total, share: 100 };
  return t;
}

/** Books issued per month in the period (oldest first). */
export async function issuedByMonth(tx: Tx, f: LibFilter) {
  const rows = await tx.bookIssue.findMany({ where: { issuedOn: dateRange(f), ...sectionWhere(f) }, select: { issuedOn: true } });
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = r.issuedOn.toISOString().slice(0, 7);
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
}

/** Books issued per class (students' section when issued), and to staff. */
export async function issuedByClass(tx: Tx, f: LibFilter) {
  const g = await tx.bookIssue.groupBy({ by: ["sectionId", "memberKind"], where: { issuedOn: dateRange(f), ...sectionWhere(f) }, _count: { _all: true } });
  const secs = await sectionLabels(tx, g.map((x) => x.sectionId));
  const out = new Map<string, { label: string; value: number; sort: number }>();
  for (const x of g) {
    const key = x.memberKind === "STAFF" ? "staff" : x.sectionId ?? "none";
    const label = x.memberKind === "STAFF" ? "Staff" : x.sectionId ? secs.get(x.sectionId)?.label ?? "Class" : "No class";
    const sort = x.memberKind === "STAFF" ? 1e9 : x.sectionId ? secs.get(x.sectionId)?.sort ?? 1e8 : 1e8;
    const cur = out.get(key) ?? { label, value: 0, sort };
    cur.value += x._count._all;
    out.set(key, cur);
  }
  return [...out.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.sort - b.sort);
}

/* ---------- Fines ---------- */

export async function fineTotals(tx: Tx, ctx: SchoolContext, f: LibFilter) {
  await syncFeeFines(tx, ctx);
  const where = (status: FineStatus, by: "created" | "paid" | "waived" = "created"): Prisma.LibraryFineWhereInput => ({
    status, ...(by === "paid" ? { paidAt: momentRange(f) } : by === "waived" ? { waivedAt: momentRange(f) } : { createdAt: momentRange(f) }),
  });
  const sum = async (w: Prisma.LibraryFineWhereInput) => {
    const r = await tx.libraryFine.aggregate({ where: w, _sum: { amountPaise: true }, _count: { _all: true } });
    return { paise: r._sum.amountPaise ?? ZERO, count: r._count._all };
  };
  const [collected, due, waived, waiting] = await Promise.all([sum(where("PAID", "paid")), sum({ status: "DUE" }), sum(where("WAIVED", "waived")), sum({ status: "WAITING" })]);
  return { collected, due, waived, waiting };
}

export async function finesReport(tx: Tx, ctx: SchoolContext, f: LibFilter): Promise<Table> {
  await syncFeeFines(tx, ctx);
  const fines = await tx.libraryFine.findMany({ where: { createdAt: momentRange(f) }, orderBy: { createdAt: "desc" }, take: 5000 });
  const members = await membersFor(tx, ctx, fines);
  const books = await tx.book.findMany({ where: { id: { in: [...new Set(fines.map((x) => x.bookId))] } }, select: { id: true, title: true } });
  const visible = f.sectionIds ? fines.filter((x) => { const m = mOf(members, x); return m?.sectionId ? f.sectionIds!.includes(m.sectionId) : false; }) : fines;
  const rows: Row[] = visible.map((x) => {
    const m = mOf(members, x);
    return {
      no: x.fineNo, date: x.createdAt, member: m?.name ?? "", cls: m ? (m.kind === "STAFF" ? "Staff" : m.short) : "", book: books.find((b) => b.id === x.bookId)?.title ?? "",
      reason: FINE_REASON[x.reason], amount: x.amountPaise, status: FINE_STATUS[x.status].label,
      how: x.status === "PAID" ? (x.paidHow === "fees" ? "With fees" : `At the desk${x.receiptNo ? ` (${x.receiptNo})` : ""}`) : x.status === "WAIVED" ? x.waiveReason ?? "" : x.feeDueId ? "Added to fees" : "",
    };
  });
  const sumOf = (st: string) => rows.filter((r) => r.status === st).reduce<bigint>((a, r) => a + (r.amount as bigint), ZERO);
  const t: Table = {
    columns: [{ key: "no", label: "Fine no." }, { key: "date", label: "Date", kind: "date" }, { key: "member", label: "Member" }, { key: "cls", label: "Class" }, { key: "book", label: "Book" }, { key: "reason", label: "Reason" }, { key: "amount", label: "Amount", kind: "money" }, { key: "status", label: "Status" }, { key: "how", label: "How paid or why waived" }],
    rows, empty: "No fines on these dates.",
  };
  if (rows.length) {
    t.totals = { no: "Total", date: null, member: null, cls: null, book: null, reason: null, amount: rows.reduce<bigint>((a, r) => a + (r.amount as bigint), ZERO), status: null, how: null };
    t.note = `Paid ${fmt(sumOf("Paid"))} · due ${fmt(sumOf("Due"))} · waived ${fmt(sumOf("Waived"))} · waiting approval ${fmt(sumOf("Waiting approval"))}.`;
  }
  return t;
}
const fmt = (p: bigint) => `₹${(Number(p) / 100).toLocaleString("en-IN")}`;

/* ---------- Stock check ---------- */

export async function stockSessions(tx: Tx, f: LibFilter) {
  return tx.stockCheckSession.findMany({ where: { startedAt: momentRange(f) }, orderBy: { startedAt: "desc" }, take: 50 });
}

export async function stockReport(tx: Tx, _ctx: SchoolContext, f: LibFilter): Promise<Table> {
  const sessions = await stockSessions(tx, f);
  const pick = f.session ? sessions.find((x) => x.id === f.session) ?? (await tx.stockCheckSession.findFirst({ where: { id: f.session } })) : null;
  if (pick) {
    const scans = await tx.stockCheckScan.findMany({ where: { sessionId: pick.id }, select: { code: true, copyId: true } });
    const missingCopies = await tx.bookCopy.findMany({ where: { id: { in: pick.missingIds } }, include: { book: { select: { title: true } } } });
    const scannedCopies = await tx.bookCopy.findMany({ where: { id: { in: scans.map((x) => x.copyId).filter((x): x is string => Boolean(x)) } }, include: { book: { select: { title: true } } } });
    const rows: Row[] = [
      ...missingCopies.map((c) => ({ accession: c.accessionNo, book: c.book.title, result: "Missing", now: COPY_STATUS[c.status as CopyStatus].label })),
      ...scans.filter((x) => !x.copyId).map((x) => ({ accession: x.code, book: "Not in the catalogue", result: "Extra", now: "" })),
      ...scannedCopies.filter((c) => !["AVAILABLE", "RESERVED", "DAMAGED"].includes(c.status) && !pick.missingIds.includes(c.id)).map((c) => ({ accession: c.accessionNo, book: c.book.title, result: "Extra", now: COPY_STATUS[c.status as CopyStatus].label })),
    ];
    return {
      columns: [{ key: "accession", label: "Accession" }, { key: "book", label: "Book" }, { key: "result", label: "Result" }, { key: "now", label: "Status now" }],
      rows, note: `${pick.name}: ${pick.expected ?? 0} expected, ${pick.found ?? 0} found, ${pick.missing ?? 0} missing, ${pick.extra ?? 0} extra.`,
      empty: pick.status === "OPEN" ? "This stock check is still open. Close it to see the result." : "Every expected copy was found, and nothing extra.",
    };
  }
  return {
    columns: [{ key: "name", label: "Stock check" }, { key: "started", label: "Started", kind: "date" }, { key: "closed", label: "Closed", kind: "date" }, { key: "expected", label: "Expected", kind: "number" }, { key: "found", label: "Found", kind: "number" }, { key: "missing", label: "Missing", kind: "number" }, { key: "extra", label: "Extra", kind: "number" }],
    rows: sessions.map((x) => ({ name: x.name + (x.status === "OPEN" ? " (open)" : ""), started: x.startedAt, closed: x.closedAt, expected: x.expected, found: x.found, missing: x.missing, extra: x.extra })),
    empty: "No stock checks on these dates.", links: [{ label: "Open Fines & Stock Check", href: `${BASE}/fines?view=stock` }],
  };
}

/* ---------- Catalogue ---------- */

export async function catalogueReport(tx: Tx): Promise<Table> {
  const books = await tx.book.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" }, take: 20000 });
  const [counts, cats, pubs] = await Promise.all([
    copyCounts(tx, books.map((b) => b.id)),
    tx.libraryCategory.findMany({ select: { id: true, name: true, shelf: true } }),
    tx.publisher.findMany({ select: { id: true, name: true } }),
  ]);
  const rows: Row[] = books.map((b) => {
    const c = counts.get(b.id)!;
    const cat = cats.find((x) => x.id === b.categoryId);
    return { title: b.title, author: b.authorText, publisher: pubs.find((p) => p.id === b.publisherId)?.name ?? "", isbn: showIsbn(b.isbn), category: cat?.name ?? "", subject: b.subject ?? "", shelf: shelfOf(b, cat) ?? "", total: c.total, available: c.available, issued: c.issued, reserved: c.reserved, lost: c.lost, damaged: c.damaged, withdrawn: c.withdrawn };
  });
  const t: Table = {
    columns: [{ key: "title", label: "Title" }, { key: "author", label: "Author" }, { key: "publisher", label: "Publisher" }, { key: "isbn", label: "ISBN" }, { key: "category", label: "Category" }, { key: "subject", label: "Subject" }, { key: "shelf", label: "Shelf" },
      { key: "total", label: "Copies", kind: "number" }, { key: "available", label: "Available", kind: "number" }, { key: "issued", label: "Issued", kind: "number" }, { key: "reserved", label: "Reserved", kind: "number" }, { key: "lost", label: "Lost", kind: "number" }, { key: "damaged", label: "Damaged", kind: "number" }, { key: "withdrawn", label: "Withdrawn", kind: "number" }],
    rows, empty: "No books in the catalogue yet.",
  };
  if (rows.length) {
    const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    t.totals = { title: `${rows.length} titles`, author: null, publisher: null, isbn: null, category: null, subject: null, shelf: null, total: sum("total"), available: sum("available"), issued: sum("issued"), reserved: sum("reserved"), lost: sum("lost"), damaged: sum("damaged"), withdrawn: sum("withdrawn") };
  }
  return t;
}

/** Copies by status across the library (the catalogue card). */
export async function copiesByStatus(tx: Tx) {
  const g = await tx.bookCopy.groupBy({ by: ["status"], _count: { _all: true } });
  return (Object.keys(COPY_STATUS) as CopyStatus[]).map((st) => ({ status: st, label: COPY_STATUS[st].label, value: g.find((x) => x.status === st)?._count._all ?? 0 }));
}

/** The reports of the Library Reports page and Reports & Analytics, by key. */
export const LIBRARY_REPORT_LIST = [
  { key: "lib-issued", name: "Books issued", sub: "Every issue by date, class and member, with due and return dates", dated: true, byClass: true, run: issuedReport },
  { key: "lib-overdue", name: "Overdue books", sub: "Books not returned by the due date, with days overdue and the fine so far", dated: false, byClass: true, run: overdueReport },
  { key: "lib-popular", name: "Most read books", sub: "Books issued most often", dated: true, byClass: true, run: popularReport },
  { key: "lib-categories", name: "Most read categories", sub: "Issues by category, with each category's share", dated: true, byClass: true, run: categoriesReport },
  { key: "lib-fines", name: "Library fines", sub: "Fines collected, due, waived and waiting for approval", dated: true, byClass: false, run: finesReport },
  { key: "lib-stock", name: "Stock check result", sub: "Each stock check with copies expected, found, missing and extra", dated: true, byClass: false, run: stockReport },
  { key: "lib-catalogue", name: "Catalogue and copies by status", sub: "Every book with its copies available, issued, lost, damaged and withdrawn", dated: false, byClass: false, run: (tx: Tx) => catalogueReport(tx) },
] as const;

export type LibraryReportKey = (typeof LIBRARY_REPORT_LIST)[number]["key"];
