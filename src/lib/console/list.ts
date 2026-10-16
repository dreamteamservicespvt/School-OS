// The console's Schools list (07-super-admin.md §3.2): filters read from the
// page address, shared by the page and its export so both show the same rows.
import "server-only";

import type { Prisma, SchoolStatus } from "@prisma/client";
import { withConsole } from "../db";
import { formatDate } from "../format";
import { momentWhere, periodFromSearch, type DayRange } from "../periods";
import { schoolPhoneDigits, STATUS_LABEL, inviteState } from "./schools";
import { SUB_STATUS_LABEL, addDays, GRACE_DAYS } from "./billing";

export const CONSOLE_TZ = "Asia/Kolkata";
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

export const STATUS_KEYS: Record<string, SchoolStatus> = { trial: "TRIAL", active: "ACTIVE", suspended: "SUSPENDED", closed: "CLOSED" };
export const SETUP_FILTER = [
  { value: "notsigned", label: "Admin not signed in" },
  { value: "low", label: "Setup under half" },
  { value: "mid", label: "Setup half or more" },
  { value: "done", label: "Setup done" },
];

export type SchoolFilters = { q: string; status: string; board: string; setup: string; city: string; by: string; range: DayRange | null; ids: string[] | null };

export function readSchoolFilters(sp: Raw): SchoolFilters {
  const ids = one(sp.ids).split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  return {
    q: one(sp.q).slice(0, 80),
    status: STATUS_KEYS[one(sp.status)] ? one(sp.status) : "",
    board: one(sp.board),
    setup: SETUP_FILTER.some((s) => s.value === one(sp.setup)) ? one(sp.setup) : "",
    city: one(sp.city),
    by: /^[0-9a-f-]{36}$/i.test(one(sp.by)) ? one(sp.by) : "",
    range: periodFromSearch(sp, { timeZone: CONSOLE_TZ }),
    ids: ids.length ? ids : null,
  };
}

/** Everything but the status chip, so each chip can show its own count. */
export function schoolsWhere(f: SchoolFilters, opts: { withStatus?: boolean } = {}): Prisma.ConsoleSchoolWhereInput {
  const and: Prisma.ConsoleSchoolWhereInput[] = [];
  if (f.ids) and.push({ id: { in: f.ids } });
  if (opts.withStatus !== false && f.status) and.push({ status: STATUS_KEYS[f.status] });
  // Closed schools (and test schools closed after trying) show only under the Closed chip.
  else if (opts.withStatus !== false && !f.ids) and.push({ status: { not: "CLOSED" } });
  if (f.board) and.push({ board: f.board });
  if (f.city) and.push({ city: f.city });
  if (f.by) and.push({ addedById: f.by });
  if (f.range) and.push({ createdAt: momentWhere(f.range, CONSOLE_TZ) });
  if (f.setup === "notsigned") and.push({ adminSignedIn: false });
  if (f.setup === "done") and.push({ setupDone: { gte: 10 } });
  if (f.q) {
    const t = f.q;
    const digits = schoolPhoneDigits(t) ?? (t.replace(/\D/g, "").length >= 4 ? t.replace(/\D/g, "") : null);
    and.push({ OR: [
      { name: { contains: t, mode: "insensitive" } },
      { city: { contains: t, mode: "insensitive" } },
      { code: { contains: t.replace(/\s/g, ""), mode: "insensitive" } },
      { adminName: { contains: t, mode: "insensitive" } },
      ...(digits ? [{ phoneDigits: { contains: digits } }, { adminPhone: { contains: digits.slice(-5) } }] : []),
    ] });
  }
  return and.length ? { AND: and } : {};
}

export type SchoolRow = Awaited<ReturnType<typeof listSchools>>["rows"][number];

/** The rows for the list, with what the Status and School Admin columns say. */
export async function listSchools(f: SchoolFilters, now = new Date(), take = 500) {
  return withConsole(async (tx) => {
    const where = schoolsWhere(f);
    const [cards, total, chips] = await Promise.all([
      tx.consoleSchool.findMany({ where, orderBy: [{ createdAt: "desc" }], take }),
      tx.consoleSchool.count(),
      tx.consoleSchool.groupBy({ by: ["status"], where: schoolsWhere(f, { withStatus: false }), _count: true }),
    ]);
    const ids = cards.map((c) => c.id);
    const [subs, invites, graceInv] = await Promise.all([
      tx.subscription.findMany({ where: { forSchoolId: { in: ids } } }),
      tx.schoolInvite.findMany({ where: { forSchoolId: { in: ids }, usedAt: null, cancelledAt: null, replacedAt: null, kind: "INVITE" }, orderBy: { sentAt: "desc" } }),
      tx.platformInvoice.findMany({ where: { forSchoolId: { in: ids }, status: "UNPAID", kind: { in: ["NEW", "RENEWAL", "SECOND_HALF"] } }, orderBy: { dueOn: "asc" }, select: { forSchoolId: true, dueOn: true } }),
    ]);
    let rows = cards.map((c) => {
      const sub = subs.find((s) => s.forSchoolId === c.id) ?? null;
      const inv = invites.find((i) => i.forSchoolId === c.id) ?? null;
      const state = inv ? inviteState(inv, now) : null;
      const admin = c.adminSignedIn
        ? { label: "Signed in", tone: "ok" as const }
        : state === "expired" ? { label: "Invite expired", tone: "bad" as const }
        : state === "sent" || state === "opened" ? { label: state === "opened" ? "Invite opened" : "Invited", tone: "info" as const }
        : c.adminName ? { label: "Not signed in", tone: "warn" as const } : { label: "No School Admin yet", tone: "bad" as const };
      const due = graceInv.find((g) => g.forSchoolId === c.id);
      const statusSub =
        c.status === "TRIAL" ? (c.trialEndsOn ? `Ends ${formatDate(c.trialEndsOn)}` : "Trial")
        : c.status === "ACTIVE" ? (sub ? (sub.status === "GRACE" && due ? `In grace till ${formatDate(addDays(due.dueOn, GRACE_DAYS))}` : sub.status === "PAID" ? `Paid till ${formatDate(sub.renewOn)}` : SUB_STATUS_LABEL[sub.status]) : "No plan yet")
        : c.status === "SUSPENDED" ? `Since ${formatDate(c.statusSince)}`
        : c.keepUntil ? `Data kept till ${formatDate(c.keepUntil)}` : "Closed";
      return {
        id: c.id, code: c.code, name: c.name, city: c.city, board: c.board, status: c.status, statusLabel: STATUS_LABEL[c.status], statusSub, grace: sub?.status === "GRACE",
        adminName: c.adminName ?? "No School Admin yet", admin, setupDone: c.setupDone, setupTotal: c.setupTotal,
        stuck: Boolean(c.setupChangedAt && c.adminSignedIn && c.setupDone < c.setupTotal && now.getTime() - c.setupChangedAt.getTime() > 7 * 86_400_000),
        students: c.activeStudents, createdAt: c.createdAt, addedBy: c.addedByName ?? "School OS", inviteId: inv && (state === "sent" || state === "opened" || state === "expired") ? inv.id : null,
      };
    });
    if (f.setup === "low") rows = rows.filter((r) => r.setupDone * 2 < r.setupTotal);
    if (f.setup === "mid") rows = rows.filter((r) => r.setupDone * 2 >= r.setupTotal && r.setupDone < r.setupTotal);
    const chipCount = (s: SchoolStatus) => chips.find((x) => x.status === s)?._count ?? 0;
    return { rows, total, chips: { all: chips.reduce((t, x) => t + (x.status === "CLOSED" ? 0 : x._count), 0), trial: chipCount("TRIAL"), active: chipCount("ACTIVE"), suspended: chipCount("SUSPENDED"), closed: chipCount("CLOSED") } };
  });
}

/** Choices for the filters: boards, cities and who added schools. */
export async function filterChoices() {
  return withConsole(async (tx) => {
    const [cities, boards, adders] = await Promise.all([
      tx.consoleSchool.findMany({ where: { city: { not: null } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } }),
      tx.consoleSchool.findMany({ where: { board: { not: null } }, distinct: ["board"], select: { board: true }, orderBy: { board: "asc" } }),
      tx.consoleSchool.findMany({ where: { addedById: { not: null } }, distinct: ["addedById"], select: { addedById: true, addedByName: true }, orderBy: { addedByName: "asc" } }),
    ]);
    return {
      cities: cities.map((c) => ({ value: c.city!, label: c.city! })),
      boards: boards.map((b) => ({ value: b.board!, label: b.board! })),
      adders: adders.map((a) => ({ value: a.addedById!, label: a.addedByName ?? "Unknown" })),
    };
  });
}

/** The filters in words, for the top of an export. */
export function describeSchoolFilters(f: SchoolFilters, names: { adders: { value: string; label: string }[] }) {
  const parts: string[] = [];
  if (f.status) parts.push(`Status: ${STATUS_LABEL[STATUS_KEYS[f.status]]}`);
  if (f.q) parts.push(`Search: ${f.q}`);
  if (f.board) parts.push(`Board: ${f.board}`);
  if (f.setup) parts.push(SETUP_FILTER.find((s) => s.value === f.setup)!.label);
  if (f.city) parts.push(`City: ${f.city}`);
  if (f.by) parts.push(`Added by: ${names.adders.find((a) => a.value === f.by)?.label ?? "someone"}`);
  if (f.range) parts.push(`Added: ${f.range.label}`);
  if (f.ids) parts.push(`${f.ids.length} chosen schools`);
  return parts.join(" · ") || "All schools";
}
