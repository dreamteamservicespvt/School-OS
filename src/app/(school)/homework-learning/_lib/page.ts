// What every Homework & Learning page starts with: the signed-in person,
// checked on the server, their reach here (full, own classes, or a student's
// own work), what they do on each page (edit or view; overseers watch and
// remind), the optional pages the school has on, today in the school's time
// zone and the shared date filter.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope } from "@/lib/homework/scope";
import { assistantOn, homeworkFeatures, homeworkSettings } from "@/lib/homework/settings";
import { HOMEWORK_PAGES, homeworkPageAllowed, type HomeworkPageKey } from "@/lib/homework/access";

export const MODULE = "homework-learning" as const;
export const BASE = "/homework-learning";
export { qs, one, financePeriod as homeworkPeriod, type SearchParams } from "../../finance-management/_lib/page";

export const PAGE_HREF: Record<HomeworkPageKey, string> = {
  homework: BASE,
  submissions: `${BASE}/submissions`,
  "study-material": `${BASE}/study-material`,
  quizzes: `${BASE}/quizzes`,
  discussions: `${BASE}/discussions`,
  "online-classes": `${BASE}/online-classes`,
  "learning-progress": `${BASE}/learning-progress`,
  settings: `${BASE}/settings`,
};

export const homeworkPage = cache(async () => {
  const current = await requirePage(MODULE);
  const dates = await periodSetup(current);
  const tz = current.school.timeZone;
  const now = new Date();
  const today = todayIn(tz, now);
  const data = await withSchool(current.ctx, async (tx) => {
    const [scope, features, settings] = await Promise.all([homeworkScope(tx, current, today), homeworkFeatures(tx, current.ctx), homeworkSettings(tx, current.ctx)]);
    return { scope, features, settings };
  });
  const s = data.scope;
  const may = (page: HomeworkPageKey) => homeworkPageAllowed(s.modes, data.features, page);
  /** Does this person do the work on this page (give, grade, add, schedule)? */
  const edits = (page: HomeworkPageKey) => may(page) && s.modes[page] === "edit" && s.level !== "student";
  const student = s.level === "student";
  const own = s.level === "own";
  const ai = assistantOn(data.features);
  return { current, dates, tz, now, today, ...data, may, edits, student, own, ai };
});

export type HomeworkPage = Awaited<ReturnType<typeof homeworkPage>>;

/** Homework & Learning's pages in the order of the approved design (mod-homework.jsx); pages a person may not open are hidden. */
export async function homeworkTabs() {
  const p = await homeworkPage();
  const keys = (Object.keys(HOMEWORK_PAGES) as HomeworkPageKey[]).filter((k) => p.may(k));
  return keys.map((k) => (k === "homework" ? { href: BASE, label: HOMEWORK_PAGES[k].label, exact: true, also: [`${BASE}/homework`] } : { href: PAGE_HREF[k], label: HOMEWORK_PAGES[k].label }));
}

/** A Homework & Learning page this person may open; anything else is a plain "no access" page. */
export async function homeworkGuard(page: HomeworkPageKey) {
  const p = await homeworkPage();
  if (!p.may(page)) {
    // An optional page the school has switched off goes back to Homework; anything else is "no access".
    if (p.scope.modes[page]) redirect(BASE);
    redirect(`/no-access?m=${MODULE}`);
  }
  return p;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A moment as a date-and-time box value ("2026-10-16T20:00") in the school's time zone. */
export function localInput(d: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
