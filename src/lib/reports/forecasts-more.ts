// More Looking ahead signals (gap list G29), where schools feel the pain
// first. Each is plain arithmetic on the school's own records, says what it
// used, and changes nothing until a person decides (00-global §2.1):
// - Marks needed: the % a student needs in the remaining exams that count to
//   reach the pass mark for the year in each subject (Exam Settings weights).
// - Syllabus: the date each section would finish a subject at the pace taught
//   so far, against the last planned date (or the end of the year).
// - Message credits: the day credits run out at the rate of the last 30 days,
//   with the messages already scheduled.
// - Guardians who cannot be reached: every message to them failed lately.
// - Cash for the next 8 weeks, with salary on pay day; only when the cash and
//   bank books can be trusted (opening balances set, nothing below zero).
//   Otherwise one item says what to set first, instead of a forecast.
// Kept here so forecasts.ts only registers them (computeForecasts parts).
import "server-only";

import { wholeRupees, type Forecast, type Ctx } from "./forecasts";
import type { SubjectResult } from "../exams/compute";
import { examSettings } from "../exams/settings";
import { finalExams } from "../exams/results";
import { schoolDays } from "../attendance/calendar";
import { accountBalances } from "../finance/daybook";
import { salarySettings } from "../salary/settings";
import { creditBalances } from "../messaging/credits";
import { channelSetups } from "../messaging/channels";
import { CANCELLED_REASON } from "../messaging/send";
import { formatDate } from "../format";
import { addDays } from "../staff/dates";
import { BUILT_MODULES } from "../modules";

/** At most this many student or section signals of one kind, the most urgent first. */
const MAX_ITEMS = 15;

const pct = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/* ---------- the arithmetic (pure, tested on its own) ---------- */

/**
 * The % needed in the remaining exams (together, by weight) to reach the pass
 * mark for the year: (pass × all weight − marks so far × their weight) ÷ the
 * weight still to come. Null when nothing is done yet or nothing is left.
 */
export function marksNeeded(done: { weight: number; percent: number }[], remainingWeight: number, pass: number): number | null {
  const doneWeight = done.reduce((a, d) => a + d.weight, 0);
  if (!done.length || doneWeight <= 0 || remainingWeight <= 0) return null;
  const sofar = done.reduce((a, d) => a + d.weight * d.percent, 0);
  return (pass * (doneWeight + remainingWeight) - sofar) / remainingWeight;
}

/**
 * School days still needed to finish a syllabus at the pace so far: topics left
 * ÷ (topics done ÷ school days taught). Null without a pace to go on (fewer than
 * 3 topics, or fewer than 15 school days of teaching).
 */
export function daysToFinish(x: { done: number; total: number; daysTaught: number }): number | null {
  if (x.done < 3 || x.daysTaught < 15 || x.done >= x.total) return null;
  return Math.ceil((x.total - x.done) / (x.done / x.daysTaught));
}

/** Days until credits run out at the daily rate, after the messages already scheduled. Null when nothing is being used. */
export function creditDaysLeft(x: { balance: number; usedLast30: number; scheduled: number }): number | null {
  const left = x.balance - x.scheduled;
  if (left <= 0) return 0;
  if (x.usedLast30 <= 0) return null;
  return Math.floor(left / (x.usedLast30 / 30));
}

/** Week-end balances for the weeks ahead: start + each week's money in − money out − salary that week. */
export function cashWeeks(start: bigint, weeks: { inflow: bigint; outflow: bigint; salary: bigint }[]) {
  let bal = start;
  const ends = weeks.map((w) => (bal = bal + w.inflow - w.outflow - w.salary));
  let low = 0;
  ends.forEach((b, i) => { if (b < ends[low]) low = i; });
  return { ends, lowest: ends[low] ?? start, lowWeek: ends.length ? low : -1 };
}

/** The pay day of a month: a set day (1 to 28), or the last weekday that is not a Sunday ("last-working"). */
export function payDayOf(monthStart: Date, payDay: string): Date {
  const y = monthStart.getUTCFullYear(), m = monthStart.getUTCMonth();
  const n = Number(payDay);
  if (n >= 1 && n <= 28) return new Date(Date.UTC(y, m, n));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return last.getUTCDay() === 0 ? addDays(last, -1) : last;
}

/* ---------- marks needed in the remaining exams ---------- */

export async function marksNeededForecasts(c: Ctx, enrolled: { studentId: string; sectionId: string; classId: string }[]): Promise<Forecast[]> {
  if (!enrolled.length || !BUILT_MODULES.has("examination-results")) return [];
  const pass = (await examSettings(c.tx, c.ctx)).passPercentSubject;
  const classIds = [...new Set(enrolled.map((e) => e.classId))];
  const examsBy = new Map<string, Awaited<ReturnType<typeof finalExams>>>();
  for (const id of classIds) examsBy.set(id, (await finalExams(c.tx, c.ctx, c.year.id, id)).filter((e) => e.counts));
  const examIds = [...new Set([...examsBy.values()].flatMap((l) => l.map((e) => e.id)))];
  if (!examIds.length) return [];
  const results = await c.tx.result.findMany({ where: { academicYearId: c.year.id, status: "PUBLISHED", examId: { in: examIds }, studentId: { in: enrolled.map((e) => e.studentId) } }, select: { studentId: true, examId: true, subjects: true } });
  const byStudent = new Map<string, typeof results>();
  for (const r of results) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  const found: { e: (typeof enrolled)[number]; subjects: { name: string; needed: number }[]; worst: number; last: string; remaining: string[] }[] = [];
  for (const e of enrolled) {
    const exams = examsBy.get(e.classId) ?? [];
    const mine = byStudent.get(e.studentId) ?? [];
    const anyWeight = exams.some((x) => x.weight > 0);
    const w = (x: (typeof exams)[number]) => (anyWeight ? x.weight : 1);
    const doneIds = new Set(mine.map((r) => r.examId));
    const left = exams.filter((x) => !doneIds.has(x.id));
    if (!mine.length || !left.length) continue;
    const remainingWeight = left.reduce((a, x) => a + w(x), 0);
    const bySubject = new Map<string, { name: string; done: { weight: number; percent: number }[] }>();
    for (const r of mine) {
      const ex = exams.find((x) => x.id === r.examId);
      if (!ex) continue;
      for (const s of (r.subjects as unknown as SubjectResult[]) ?? []) {
        if (!s || s.gradeOnly || s.percent === null || s.medical) continue;
        const cur = bySubject.get(s.subjectId) ?? { name: s.name, done: [] };
        cur.done.push({ weight: w(ex), percent: s.percent });
        bySubject.set(s.subjectId, cur);
      }
    }
    const subjects: { name: string; needed: number }[] = [];
    for (const s of bySubject.values()) {
      const needed = marksNeeded(s.done, remainingWeight, pass);
      // Only where the remaining exams must go better than the pass mark to get there.
      if (needed !== null && needed > pass + 0.5) subjects.push({ name: s.name, needed });
    }
    if (!subjects.length) continue;
    subjects.sort((a, b) => b.needed - a.needed);
    const lastDone = exams.filter((x) => doneIds.has(x.id)).pop();
    found.push({ e, subjects, worst: subjects[0].needed, last: lastDone?.id ?? "", remaining: left.map((x) => x.title) });
  }
  found.sort((a, b) => b.worst - a.worst);
  const top = found.slice(0, MAX_ITEMS);
  const [who, cls] = await Promise.all([
    c.tx.student.findMany({ where: { id: { in: top.map((f) => f.e.studentId) } }, select: { id: true, fullName: true } }),
    c.tx.section.findMany({ where: { id: { in: top.map((f) => f.e.sectionId) } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } }),
  ]);
  return top.map((f): Forecast => {
    const name = who.find((s) => s.id === f.e.studentId)?.fullName ?? "A student";
    const sec = cls.find((s) => s.id === f.e.sectionId);
    const label = sec ? `${sec.schoolClass.name} ${sec.name}` : "class";
    const cannot = f.subjects.filter((s) => s.needed > 100);
    const can = f.subjects.filter((s) => s.needed <= 100);
    const exams = listWords(f.remaining);
    const words: string[] = [];
    if (can.length) words.push(`needs about ${listWords(can.map((s) => `${pct(s.needed)} in ${s.name}`))} in ${exams} to reach the ${pass}% pass mark for the year`);
    if (cannot.length) words.push(`cannot reach the pass mark in ${listWords(cannot.map((s) => s.name))} through ${exams} alone, even with full marks`);
    return {
      key: `marks-need:${f.e.studentId}:${f.last}`, area: "marks", strength: cannot.length ? "ACT_NOW" : "WATCH", studentId: f.e.studentId, value: f.worst,
      score: cannot.length ? 40 : 30, certainty: "high",
      title: `${name} (${label}) ${words[0]}`,
      body: `${name} ${words.join("; and ")}. Worked out from the marks so far and how much each exam counts in the final result. Extra help in ${listWords(f.subjects.slice(0, 3).map((s) => s.name))} before then may help; you decide.`,
      source: `published results so far, the weight of each exam in the final result and the ${pass}% pass mark (Exam Settings)`,
      href: `/student-management/students/${f.e.studentId}`, hrefLabel: "Open profile",
    };
  });
}

/* ---------- syllabus finish at the current pace ---------- */

export async function syllabusForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("academic-management") || c.today < c.year.startDate || c.today >= c.year.endDate) return [];
  const items = await c.tx.syllabusItem.findMany({ where: { academicYearId: c.year.id, archivedAt: null }, select: { id: true, parentId: true, classId: true, subjectId: true, plannedTo: true } });
  if (!items.length) return [];
  const entries = await c.tx.syllabusProgressEntry.findMany({ where: { academicYearId: c.year.id, archivedAt: null }, select: { sectionId: true, itemId: true, date: true, status: true } });
  if (!entries.length) return [];
  const children = new Set(items.map((i) => i.parentId).filter(Boolean));
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const leaves = items.filter((i) => !children.has(i.id));
  // Leaves by class and subject, and each section's done leaves (taught, or under a completed item).
  const plan = new Map<string, { total: number; plannedTo: Date | null }>();
  for (const l of leaves) {
    const k = `${l.classId}:${l.subjectId}`;
    const p = plan.get(k) ?? { total: 0, plannedTo: null };
    p.total++;
    if (l.plannedTo && (!p.plannedTo || l.plannedTo > p.plannedTo)) p.plannedTo = l.plannedTo;
    plan.set(k, p);
  }
  const bySection = new Map<string, { classId: string; subjectId: string; done: Set<string>; first: Date }>();
  const leafIds = new Set(leaves.map((l) => l.id));
  const leavesUnder = (id: string): string[] => items.filter((i) => i.parentId === id).flatMap((ch) => (leafIds.has(ch.id) ? [ch.id] : leavesUnder(ch.id)));
  for (const e of entries) {
    const it = itemOf.get(e.itemId);
    if (!it) continue;
    const k = `${e.sectionId}:${it.subjectId}`;
    const s = bySection.get(k) ?? { classId: it.classId, subjectId: it.subjectId, done: new Set<string>(), first: e.date };
    if (e.date < s.first) s.first = e.date;
    if (leafIds.has(it.id)) s.done.add(it.id);
    else if (e.status === "completed") for (const l of leavesUnder(it.id)) s.done.add(l);
    bySection.set(k, s);
  }
  const [past, ahead] = await Promise.all([
    schoolDays(c.tx, c.ctx, c.year.startDate, c.today, c.year.campusId),
    schoolDays(c.tx, c.ctx, addDays(c.today, 1), addDays(c.today, 730), c.year.campusId),
  ]);
  const found: { sectionId: string; subjectId: string; first: Date; finish: Date; target: Date; late: number; done: number; total: number; taught: number; planned: boolean }[] = [];
  for (const [k, s] of bySection) {
    const p = plan.get(`${s.classId}:${s.subjectId}`);
    if (!p) continue;
    const taught = past.working.filter((d) => d >= s.first).length;
    const need = daysToFinish({ done: s.done.size, total: p.total, daysTaught: taught });
    if (need === null) continue;
    const finish = ahead.working[need - 1] ?? addDays(c.today, Math.round(need * 1.4));
    const target = p.plannedTo && p.plannedTo <= c.year.endDate ? p.plannedTo : c.year.endDate;
    const late = ahead.working.filter((d) => d > target && d <= finish).length + (ahead.working[need - 1] ? 0 : need - ahead.working.length);
    if (late < 10) continue;
    found.push({ sectionId: k.split(":")[0], subjectId: s.subjectId, first: s.first, finish, target, late, done: s.done.size, total: p.total, taught, planned: Boolean(p.plannedTo) });
  }
  found.sort((a, b) => b.late - a.late);
  const top = found.slice(0, MAX_ITEMS);
  const [sections, subjects] = await Promise.all([
    c.tx.section.findMany({ where: { id: { in: top.map((f) => f.sectionId) } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } }),
    c.tx.subject.findMany({ where: { id: { in: top.map((f) => f.subjectId) } }, select: { id: true, name: true } }),
  ]);
  return top.map((f): Forecast => {
    const sec = sections.find((s) => s.id === f.sectionId);
    const label = sec ? `${sec.schoolClass.name} ${sec.name}` : "A section";
    const subject = subjects.find((s) => s.id === f.subjectId)?.name ?? "a subject";
    return {
      key: `syllabus:${f.sectionId}:${f.subjectId}`, area: "academic", strength: f.late >= 30 ? "ACT_NOW" : "WATCH", value: f.late,
      score: 35, certainty: f.taught >= 40 ? "medium" : "low",
      title: `${label} may finish ${subject} about ${plural(f.late, "school day")} late`,
      body: `${f.done} of ${f.total} topics taught in ${plural(f.taught, "school day")} since ${formatDate(f.first, "UTC")}. At that pace the rest would be done around ${formatDate(f.finish, "UTC")}, after ${f.planned ? "the last planned date" : "the end of the year"}, ${formatDate(f.target, "UTC")}. Extra periods or a revised plan may help; you decide.`,
      source: `the daily syllabus log of ${label}, the syllabus plan and the School Calendar`,
      href: "/academic-management/syllabus", hrefLabel: "Open Syllabus",
    };
  });
}

/* ---------- message credits ---------- */

export async function creditForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("communication")) return [];
  const [balances, setups] = await Promise.all([creditBalances(c.tx, c.ctx), channelSetups(c.tx, c.ctx)]);
  const since = addDays(c.today, -30);
  const out: Forecast[] = [];
  for (const ch of ["whatsapp", "sms"] as const) {
    if (!setups[ch]?.isOn) continue;
    const [used, scheduled] = await Promise.all([
      c.tx.creditLedgerEntry.aggregate({ where: { channel: ch, createdAt: { gte: since }, messageId: { not: null } }, _sum: { amount: true } }),
      c.tx.message.aggregate({ where: { status: "SCHEDULED", cancelledAt: null, channels: { has: ch }, scheduledAt: { gte: c.today } }, _sum: { creditCost: true } }),
    ]);
    const usedLast30 = Math.max(0, -(used._sum.amount ?? 0));
    const sched = scheduled._sum.creditCost ?? 0;
    const days = creditDaysLeft({ balance: balances[ch], usedLast30, scheduled: sched });
    if (days === null || days > 30) continue;
    const name = ch === "sms" ? "SMS" : "WhatsApp";
    const runOut = addDays(c.today, days);
    out.push({
      key: `credits:${ch}:${runOut.toISOString().slice(0, 7)}`, area: "messages", strength: days <= 7 ? "ACT_NOW" : "WATCH", value: days,
      score: 60, certainty: usedLast30 > 0 ? "medium" : "high",
      title: days === 0 ? `${name} credits are not enough for the messages already scheduled` : `${name} credits may run out around ${formatDate(runOut, "UTC")}`,
      body: `${plural(balances[ch], "credit")} left. ${plural(usedLast30, "credit")} used in the last 30 days${sched ? `, and ${plural(sched, "credit")} needed for messages already scheduled` : ""}. Fee reminders and absence messages stop when credits run out. Buying credits before then may help; you decide.`,
      source: `the credit ledger for the last 30 days${sched ? " and the scheduled messages" : ""}`,
      href: "/settings/messaging", hrefLabel: "Open SMS, WhatsApp & Email",
    });
  }
  return out;
}

/* ---------- guardians who cannot be reached ---------- */

/** Failed sends to one guardian in the last 60 days that make them "cannot be reached", when nothing reached them. */
export const UNREACHABLE_FAILS = 2;

export async function reachForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("communication")) return [];
  const since = addDays(c.today, -60);
  const base = { guardianId: { not: null }, isBackup: false, queuedAt: { gte: since } };
  const [failed, reached] = await Promise.all([
    c.tx.messageRecipient.groupBy({ by: ["guardianId"], where: { ...base, status: "FAILED", NOT: { failReason: CANCELLED_REASON } }, _count: { _all: true } }),
    c.tx.messageRecipient.groupBy({ by: ["guardianId"], where: { ...base, status: { in: ["SENT", "DELIVERED", "READ"] } }, _count: { _all: true } }),
  ]);
  const ok = new Set(reached.map((r) => r.guardianId));
  const lost = failed.filter((f) => f.guardianId && !ok.has(f.guardianId) && f._count._all >= UNREACHABLE_FAILS).sort((a, b) => b._count._all - a._count._all);
  if (!lost.length) return [];
  const ids = lost.map((l) => l.guardianId!);
  const [guardians, never] = await Promise.all([
    c.tx.guardian.findMany({ where: { id: { in: ids.slice(0, 5) } }, select: { id: true, name: true } }),
    c.tx.parentLink.findMany({ where: { guardianId: { in: ids }, status: "ACTIVE", lastOpenedAt: null }, select: { guardianId: true }, distinct: ["guardianId"] }),
  ]);
  const named = ids.slice(0, 5).map((id) => `${guardians.find((g) => g.id === id)?.name ?? "A guardian"} (${lost.find((l) => l.guardianId === id)!._count._all} failed)`);
  return [{
    key: `unreachable:${Math.min(4, Math.floor(Math.log2(lost.length)))}`, area: "messages", strength: "WATCH", value: lost.length,
    score: 40, certainty: "high",
    title: `${plural(lost.length, "guardian")} could not be reached by any message in the last 60 days`,
    body: `Every message to them failed: ${listWords(named)}${lost.length > 5 ? ` and ${lost.length - 5} more` : ""}.${never.length ? ` ${plural(never.length, "of them has", "of them have")} never opened their Parent Link either.` : ""} Fee reminders and absence messages do not reach these families. Checking their phone numbers in the student profiles may help; you decide.`,
    source: "message delivery in the last 60 days and Parent Link openings",
    href: "/communication/history?status=failed", hrefLabel: "Open failed messages",
  }];
}

/* ---------- cash for the next 8 weeks ---------- */

export const CASH_WEEKS = 8;

/**
 * Cash and bank for the next 8 weeks: the balances now, fees falling due each
 * week at the school's own collection rate, usual spending, and salary on pay
 * day. Only when the books can be trusted; otherwise one item asks for the
 * opening balances (or a check) instead of predicting a shortfall.
 */
export async function cashForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("finance-management")) return [];
  const [balances, accounts, openings] = await Promise.all([
    accountBalances(c.tx, c.ctx),
    c.tx.bankAccount.findMany({ where: { archivedAt: null }, select: { id: true, name: true, kind: true } }),
    c.tx.openingBalance.count({ where: { kind: { in: ["CASH", "BANK"] }, archivedAt: null } }),
  ]);
  if (!accounts.length) return [];
  const total = [...balances.values()].reduce((a, b) => a + b, BigInt(0));
  const negative = accounts.filter((a) => (balances.get(a.id) ?? BigInt(0)) < BigInt(0));
  const setup = (title: string, body: string): Forecast[] => [{
    key: "cash-setup", area: "finance", strength: "WATCH", score: 45, certainty: "high",
    title, body, source: "the cash and bank books and the opening balances in Finance Management",
    href: "/finance-management/cash-bank", hrefLabel: "Open Cash & Bank",
  }];
  if (!openings) {
    return setup("Cash forecast needs your opening cash and bank balances",
      `No opening balances are set for the cash box and bank accounts, so the books start from zero${total < BigInt(0) ? ` and show ${wholeRupees(total)}, which cannot be right` : ""}. Set them in Finance Management, Cash & Bank, Opening balances. The cash forecast starts once the books show what is really there.`);
  }
  if (total < BigInt(0) || negative.some((a) => a.kind === "CASH")) {
    return setup("Cash forecast needs a check of the cash and bank books",
      `The books show ${listWords(negative.map((a) => `${a.name} at ${wholeRupees(balances.get(a.id)!)}`))}, which cannot be right. An opening balance or an entry may be missing. Check them in Finance Management, Cash & Bank. The cash forecast starts again once the books are right.`);
  }
  // Usual spending a week (last 12 weeks), leaving out salary, which is placed on pay day.
  const from = addDays(c.today, -84);
  const spent = await c.tx.dayBookEntry.aggregate({ where: { direction: "OUT", date: { gte: from, lt: c.today }, section: { notIn: ["opening", "transfer", "salary", "salary-advance"] }, sourceType: { notIn: ["opening-balance", "transfer"] } }, _sum: { amountPaise: true } });
  const weeklyOut = (spent._sum.amountPaise ?? BigInt(0)) / BigInt(12);
  // The school's own collection rate: paid against due over the last 3 months.
  const pastFrom = new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth() - 3, 1));
  const past = await c.tx.studentFeeDue.aggregate({ where: { state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, dueDate: { gte: pastFrom, lt: c.today } }, _sum: { amountPaise: true, concessionPaise: true, adjustmentPaise: true, paidPaise: true } });
  const pastDue = (past._sum.amountPaise ?? BigInt(0)) - (past._sum.concessionPaise ?? BigInt(0)) + (past._sum.adjustmentPaise ?? BigInt(0));
  if (pastDue <= BigInt(0) && weeklyOut <= BigInt(0)) return [];
  const rate = pastDue > BigInt(0) ? Math.min(1, Number(past._sum.paidPaise ?? BigInt(0)) / Number(pastDue)) : 0;
  const salaryRun = await c.tx.payrollRun.findFirst({ where: { status: { in: ["APPROVED", "PAID", "LOCKED"] } }, orderBy: { month: "desc" }, select: { netPaise: true } });
  const salary = salaryRun?.netPaise ?? BigInt(0);
  const payDay = (await salarySettings(c.tx, c.ctx)).payDay;
  const weeks: { start: Date; end: Date; inflow: bigint; outflow: bigint; salary: bigint; payOn: Date | null }[] = [];
  for (let i = 0; i < CASH_WEEKS; i++) {
    const start = addDays(c.today, 1 + i * 7);
    const end = addDays(start, 6);
    const due = await c.tx.studentFeeDue.aggregate({ where: { state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, balancePaise: { gt: 0 }, dueDate: { gte: start, lte: end } }, _sum: { balancePaise: true } });
    const payOns = [0, 1, 2].map((k) => payDayOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1)), payDay)).filter((d) => d >= start && d <= end);
    weeks.push({ start, end, inflow: BigInt(Math.round(Number(due._sum.balancePaise ?? BigInt(0)) * rate)), outflow: weeklyOut, salary: payOns.length ? salary : BigInt(0), payOn: payOns[0] ?? null });
  }
  const plan = cashWeeks(total, weeks);
  const floor = salary > BigInt(0) ? salary : weeklyOut * BigInt(2);
  if (plan.lowWeek < 0 || plan.lowest >= floor) return [];
  const low = weeks[plan.lowWeek];
  const payWeek = weeks.find((w) => w.payOn);
  const short = plan.lowest < BigInt(0);
  return [{
    key: `cash-8w:${low.start.toISOString().slice(0, 10)}`, area: "finance", strength: short ? "ACT_NOW" : "WATCH", value: Number(plan.lowest) / 100,
    score: short ? 90 : 65, certainty: rate > 0 ? "medium" : "low",
    title: short ? `Cash may run short by about ${wholeRupees(-plan.lowest)} in the week of ${formatDate(low.start, "UTC")}` : `Cash may be low in the week of ${formatDate(low.start, "UTC")}: about ${wholeRupees(plan.lowest)}`,
    body: `Cash and bank now: ${wholeRupees(total)}. Week by week, at the end of each week: ${weeks.map((w, i) => `${formatDate(w.start, "UTC").slice(0, 5)} ${wholeRupees(plan.ends[i])}`).join(", ")}. Money in: fees falling due each week, about ${Math.round(rate * 100)}% of which is usually paid. Money out: usual spending of about ${wholeRupees(weeklyOut)} a week${salary > BigInt(0) && payWeek ? `, and salary of about ${wholeRupees(salary)} on ${formatDate(payWeek.payOn!, "UTC")}` : ""}. Collecting dues early or moving a payment may help; you decide.`,
    source: `cash and bank balances, fee dues of the next 8 weeks, the Day Book from ${formatDate(from, "UTC")} and the last approved salary`,
    href: "/finance-management/cash-bank", hrefLabel: "Open Cash & Bank",
  }];
}
