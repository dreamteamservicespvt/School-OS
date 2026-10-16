// Library Management's tab on the Student Profile (03 §2, "Library", order
// 80): the library card number and limit, books out with due dates, the
// reservations, fines and the recent history. The Librarian's look-up view of
// a student shows the same panel, with "Issue a book" and "Return" for the
// desk. Registered through src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { BookOpen, BookmarkCheck, Receipt, History } from "lucide-react";
import type { Current } from "../current";
import { withSchool } from "../db";
import { formatDate, formatRupees } from "../format";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { libCan, libViewer, pageOpen } from "./access";
import { librarySettings } from "./settings";
import { memberByKey } from "./members";
import { daysBetween, overdueWhere } from "./desk";
import { syncFeeFines } from "./fines";
import { todayDate } from "../front-office/time";
import { BASE, FINE_REASON, FINE_STATUS, MODULE, books, type FineReason, type FineStatus } from "./words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

const day = (d: Date) => formatDate(d, "UTC");

async function load(current: Current, studentId: string) {
  const today = todayDate(current.school.timeZone);
  return withSchool(current.ctx, async (tx) => {
    const s = await librarySettings(tx, current.ctx);
    await syncFeeFines(tx, current.ctx);
    const member = await memberByKey(tx, current.ctx, s, `S:${studentId}`);
    const [out, history, reservations, fines] = await Promise.all([
      tx.bookIssue.findMany({ where: { studentId, returnedAt: null }, orderBy: { dueOn: "asc" }, include: { copy: { select: { accessionNo: true, book: { select: { id: true, title: true } } } } } }),
      tx.bookIssue.findMany({ where: { studentId, returnedAt: { not: null } }, orderBy: { returnedAt: "desc" }, take: 10, include: { copy: { select: { book: { select: { title: true } } } } } }),
      tx.reservation.findMany({ where: { studentId, status: { in: ["WAITING", "READY"] } }, orderBy: { reservedAt: "asc" } }),
      tx.libraryFine.findMany({ where: { studentId, status: { in: ["DUE", "WAITING", "PAID", "WAIVED"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const bookIds = [...new Set([...reservations.map((r) => r.bookId), ...fines.map((f) => f.bookId)])];
    const titles = new Map((bookIds.length ? await tx.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true } }) : []).map((b) => [b.id, b.title]));
    const due = fines.filter((f) => f.status === "DUE").reduce((a, f) => a + f.amountPaise, BigInt(0));
    return { member, out, history, reservations, fines, titles, due, today };
  });
}

/** The library panel for one student (the profile tab and the Librarian's look-up view). */
export async function LibraryPanel({ current, studentId }: { current: Current; studentId: string }) {
  const d = await load(current, studentId);
  const can = libCan(libViewer(current));
  const key = `S:${studentId}`;
  const overdue = d.out.filter((i) => i.dueOn.getTime() < d.today.getTime()).length;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Books out" icon={BookOpen} divided
          description={d.member ? `Library card ${d.member.cardNo} · ${d.out.length} of ${books(d.member.limit)}${d.member.blocked ? " · blocked" : ""}` : undefined}
          action={can.desk && d.member?.active ? <ButtonLink href={`${BASE}?member=${key}`} size="sm" variant="primary">Issue a book</ButtonLink> : undefined} />
        {d.member?.blocked && <p className="px-5 pt-3 text-[13px] text-bad">Blocked: {d.member.blocked.reason}</p>}
        {d.out.length ? (
          <ul className="divide-y divide-line/70">
            {d.out.map((i) => {
              const late = daysBetween(i.dueOn, d.today);
              return (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px] truncate">{i.copy.book.title}</p>
                    <p className="text-[12.5px] text-ink3">Copy <span className="font-mono">{i.copy.accessionNo}</span> · issued {day(i.issuedOn)} · due {day(i.dueOn)}</p>
                  </div>
                  {late > 0 ? <Pill tone="bad">{late} day{late === 1 ? "" : "s"} late</Pill> : late === 0 ? <Pill tone="warn">Due today</Pill> : <Pill tone="info">Out</Pill>}
                  {can.desk && <Link href={`${BASE}?mode=return&copy=${encodeURIComponent(i.copy.accessionNo)}`} className="text-[13px] font-semibold text-brand hover:underline">Return</Link>}
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">No library books out.</p>}
        {overdue > 0 && <p className="px-5 py-3 border-t border-line text-[13px] text-bad">{overdue} overdue. A Transfer Certificate waits until {overdue === 1 ? "it is" : "they are"} returned or marked lost and charged.</p>}
      </Card>
      <Card>
        <CardHeader title="Fines" icon={Receipt} divided description={d.due > BigInt(0) ? `${formatRupees(d.due)} due${d.fines.some((f) => f.feeDueId && f.status === "DUE") ? ", in the fees" : ""}` : "Nothing due."}
          action={pageOpen(libViewer(current), "fines") ? <Link href={`${BASE}/fines?status=all&q=${encodeURIComponent(d.member?.cardNo ?? "")}`} className="text-[13px] font-semibold text-brand hover:underline">All fines</Link> : undefined} />
        {d.fines.length ? (
          <ul className="divide-y divide-line/70">
            {d.fines.map((f) => {
              const st = FINE_STATUS[f.status as FineStatus];
              return (
                <li key={f.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] truncate">{FINE_REASON[f.reason as FineReason]}{f.lateDays ? ` (${f.lateDays} days)` : ""} · {d.titles.get(f.bookId) ?? "Book"}</p>
                    <p className="text-[12.5px] text-ink3">{formatDate(f.createdAt, current.school.timeZone)}</p>
                  </div>
                  <b className="font-semibold tnum text-[14px]">{formatRupees(f.amountPaise)}</b>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">No library fines.</p>}
      </Card>
      {d.reservations.length > 0 && (
        <Card>
          <CardHeader title="Reserved" icon={BookmarkCheck} divided />
          <ul className="divide-y divide-line/70">
            {d.reservations.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
                <p className="min-w-0 flex-1 text-[14px] truncate">{d.titles.get(r.bookId) ?? "Book"}</p>
                {r.status === "READY" ? <Pill tone="ok">Ready at the desk</Pill> : <Pill tone="info">Waiting</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Recently returned" icon={History} divided />
        {d.history.length ? (
          <ul className="divide-y divide-line/70">
            {d.history.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                <p className="min-w-0 flex-1 text-[14px] truncate">{i.copy.book.title}</p>
                <span className="text-[12.5px] text-ink3 tnum shrink-0">{i.returnedOn ? day(i.returnedOn) : ""}{i.lateDays ? ` · ${i.lateDays}d late` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">No books returned yet.</p>}
      </Card>
    </div>
  );
}

registerProfileTab({
  key: "library",
  label: "Library",
  module: MODULE,
  order: 80,
  load: async ({ current, studentId }: ProfileTabArgs) => <LibraryPanel current={current} studentId={studentId} />,
  summary: async ({ current, studentId }) => {
    const today = todayDate(current.school.timeZone);
    const [out, late, fines] = await withSchool(current.ctx, (tx) => Promise.all([
      tx.bookIssue.count({ where: { studentId, returnedAt: null } }),
      tx.bookIssue.count({ where: { studentId, ...overdueWhere(today) } }),
      tx.libraryFine.aggregate({ where: { studentId, status: "DUE" }, _sum: { amountPaise: true } }),
    ]));
    const due = fines._sum.amountPaise ?? BigInt(0);
    return [{ label: "Library", value: books(out), sub: late ? `${late} overdue` : due > BigInt(0) ? `${formatRupees(due)} fines due` : "None overdue", tone: late ? "danger" : due > BigInt(0) ? "warning" : "neutral", href: `/student-management/students/${studentId}?tab=library` }];
  },
  allowed: (current) => current.modulesOn.has(MODULE),
});
