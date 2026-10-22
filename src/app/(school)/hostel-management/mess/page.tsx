// Mess (15 §2): the weekly menu by day and meal with nutrition values per
// plate (pages back week by week; copy last week's), the daily head count per
// meal against the expected count (boarders in the hostel, not out on a
// pass), and mess expenses, which go to Finance, Expenses (and the Day Book
// when paid in cash).
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Pencil, Plus, Receipt, Salad, Search, Users, UtensilsCrossed } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { dateWhere } from "@/lib/periods";
import { financeSettings } from "@/lib/finance/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { DataList, Empty, HBars, Split, Col, Stack, Stats, Toolbar } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { expectedCount, mealMoment, menuWeek } from "@/lib/hostel/mess";
import { MENU_DAYS, MESS_ITEMS, isoOf, mondayOf, plural } from "@/lib/hostel/words";
import { HostelHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { CountSheet, ExpenseSheet, MenuSheet } from "../_components/sheets";
import { copyMenuAction } from "../actions";
import { BASE, hostelGuard, hostelPeriod, one, qs, type Raw, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Mess · Hostel Management") };
}

type P = Awaited<ReturnType<typeof hostelGuard>>;
const DAY = 86_400_000;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function MessPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("mess");
  const view = one(sp.view);
  return view === "count" ? <CountView p={p} sp={sp} /> : view === "expenses" ? <ExpensesView p={p} sp={sp} /> : <MenuView p={p} sp={sp} />;
}

function Views({ view }: { view: "menu" | "count" | "expenses" }) {
  return <SegLinks label="Mess pages" value={view} options={[{ value: "menu", label: "Weekly menu", href: `${BASE}/mess` }, { value: "count", label: "Head count", href: `${BASE}/mess?view=count` }, { value: "expenses", label: "Expenses", href: `${BASE}/mess?view=expenses` }]} />;
}

async function MenuView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, settings: s } = p;
  const thisWeek = mondayOf(p.today);
  const want = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.week)) ? mondayOf(new Date(`${one(sp.week)}T00:00:00Z`)) : thisWeek;
  const week = want.getTime() > thisWeek.getTime() + 8 * 7 * DAY ? thisWeek : want;
  const prev = new Date(week.getTime() - 7 * DAY);
  const next = new Date(week.getTime() + 7 * DAY);
  const d = await withSchool(current.ctx, async (tx) => {
    const [items, last, first] = await Promise.all([menuWeek(tx, week), menuWeek(tx, prev), tx.messMenuItem.findFirst({ orderBy: { weekStart: "asc" }, select: { weekStart: true } })]);
    return { items, last, first };
  });
  const cell = (day: number, meal: string) => d.items.find((x) => x.dayIndex === day && x.meal === meal);
  const href = (w: Date, extra: Record<string, string | null> = {}) => qs(`${BASE}/mess`, { week: w.getTime() === thisWeek.getTime() ? null : isoOf(w), ...extra });
  const editKey = one(sp.edit);
  const [eDay, ...eMeal] = editKey.split(":");
  const editDay = Number(eDay);
  const editMeal = eMeal.join(":");
  const editing = can.mess && Number.isInteger(editDay) && editDay >= 0 && editDay <= 6 && s.meals.includes(editMeal) ? cell(editDay, editMeal) ?? null : undefined;
  const todayIdx = Math.round((p.today.getTime() - week.getTime()) / DAY);
  const kcalOf = (day: number) => s.meals.reduce((a, m) => a + (cell(day, m)?.kcal ?? 0), 0);
  const proteinOf = (day: number) => s.meals.reduce((a, m) => a + (cell(day, m)?.proteinG ?? 0), 0);
  const canGoBack = d.first ? week.getTime() > d.first.weekStart.getTime() - 7 * DAY : week.getTime() > thisWeek.getTime() - 7 * DAY;
  const weekWords = `${formatDate(week, "UTC")} to ${formatDate(new Date(week.getTime() + 6 * DAY), "UTC")}`;

  return (
    <>
      <HostelHead pageName="Mess" href={`${BASE}/mess`} mode={p.mode}
        sub={can.mess ? "The weekly menu with nutrition per plate, the daily head count and mess expenses." : "The weekly menu, head counts and mess expenses."}
        actions={can.mess && d.last.length > 0 ? <ActButton action={copyMenuAction} fields={{ from: isoOf(prev), to: isoOf(week) }} label={d.items.length ? "Fill gaps from last week" : "Copy last week's menu"} icon="undo" size="md" /> : undefined} />
      <Stack>
        <Views view="menu" />
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-b border-line">
            {canGoBack ? <ButtonLink href={href(prev)} variant="ghost" size="sm" icon={ChevronLeft} aria-label="Earlier week"><Words k="Earlier" /></ButtonLink> : <span className="w-[84px]" />}
            <div className="flex-1 text-center min-w-0">
              <p className="font-semibold text-[15px]">{week.getTime() === thisWeek.getTime() ? "This week" : week.getTime() === thisWeek.getTime() - 7 * DAY ? "Last week" : week.getTime() === thisWeek.getTime() + 7 * DAY ? "Next week" : "Week of"}</p>
              <p className="text-[12.5px] text-ink3">{weekWords}</p>
            </div>
            <ButtonLink href={href(next)} variant="ghost" size="sm" icon={ChevronRight} aria-label="Later week"><Words k="Later" /></ButtonLink>
          </div>
          {d.items.length === 0 && (
            <div className="px-5 pt-4"><p className="text-[13.5px] text-ink2 flex gap-2 items-center"><Salad size={16} className="text-ink3" aria-hidden="true" /><Words k="No menu for this week yet." />{can.mess ? (d.last.length ? " Copy last week's, then change what differs." : " Tap a meal to write what is served.") : ""}</p></div>
          )}
          {/* Desktop: meals down, days across */}
          <div className="hidden lg:block overflow-x-auto p-4 md:p-5">
            <table className="w-full min-w-[980px] border-separate border-spacing-1.5 text-[13px]">
              <caption className="sr-only"><Words k="Mess menu," /> {weekWords}</caption>
              <thead>
                <tr>
                  <th className="w-24" />
                  {MENU_DAYS.map((x, i) => <th key={x} scope="col" className={cx("text-left font-semibold text-ink2 px-2 pb-1", i === todayIdx && "text-brand")}>{x}{i === todayIdx ? " · today" : ""}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.meals.map((m) => (
                  <tr key={m}>
                    <th scope="row" className="text-left align-top font-semibold text-ink3 text-[12.5px] pt-2 pr-2">{m}</th>
                    {MENU_DAYS.map((_, i) => {
                      const c = cell(i, m);
                      const body = (
                        <>
                          <span className={cx("block leading-snug", !c && "text-ink3")}>{c?.dishes ?? (can.mess ? "Add" : "—")}</span>
                          {c && (c.kcal || c.proteinG) ? <span className="block text-[11.5px] text-ink3 mt-1 tnum">{c.kcal ? `${c.kcal} kcal` : ""}{c.kcal && c.proteinG ? " · " : ""}{c.proteinG ? `${c.proteinG} g protein` : ""}</span> : null}
                          {c?.note && <span className="block text-[11.5px] text-info mt-0.5">{c.note}</span>}
                        </>
                      );
                      return (
                        <td key={i} className="align-top">
                          {can.mess ? (
                            <Link href={href(week, { edit: `${i}:${m}` })} scroll={false} className={cx("block rounded-xl p-2.5 min-h-[72px] border transition hover:border-brand/50", i === todayIdx ? "bg-brand/[.05] border-brand/25" : "bg-sunken/50 border-transparent", !c && "border-dashed border-line")}>{body}</Link>
                          ) : (
                            <div className={cx("rounded-xl p-2.5 min-h-[72px]", i === todayIdx ? "bg-brand/[.05]" : "bg-sunken/50")}>{body}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="text-left font-semibold text-ink3 text-[12.5px] pr-2"><Words k="Per day" /></th>
                  {MENU_DAYS.map((_, i) => <td key={i} className="px-2 text-[12px] text-ink3 tnum">{kcalOf(i) ? `${kcalOf(i).toLocaleString("en-IN")} kcal · ${proteinOf(i)} g` : ""}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          {/* Phone and tablet: one card per day */}
          <div className="lg:hidden divide-y divide-line/70">
            {MENU_DAYS.map((x, i) => (
              <section key={x} aria-label={DAY_NAMES[i]} className={cx("px-4 py-3", i === todayIdx && "bg-brand/[.04]")}>
                <h3 className="font-semibold text-[14px] mb-1.5">{DAY_NAMES[i]}{i === todayIdx ? <span className="text-brand"> <Words k="· today" /></span> : ""}{kcalOf(i) ? <span className="text-[12px] text-ink3 font-normal tnum"> · {kcalOf(i).toLocaleString("en-IN")} <Words k="kcal" /></span> : null}</h3>
                <ul className="flex flex-col gap-1">
                  {s.meals.map((m) => {
                    const c = cell(i, m);
                    const inner = <><span className="w-20 shrink-0 text-[12.5px] text-ink3 pt-0.5">{m}</span><span className="flex-1 min-w-0 text-[13.5px]">{c?.dishes ?? <span className="text-ink3">{can.mess ? "Add" : "—"}</span>}{c?.note && <span className="block text-[12px] text-info">{c.note}</span>}</span>{can.mess && <Pencil size={14} className="text-ink3 mt-1 shrink-0" aria-hidden="true" />}</>;
                    return <li key={m}>{can.mess ? <Link href={href(week, { edit: `${i}:${m}` })} scroll={false} className="flex gap-2 py-1.5 rounded-lg hover:bg-sunken/60 min-h-11 items-start" aria-label={`${DAY_NAMES[i]} ${m}: ${c?.dishes ?? "not set"}. Change`}>{inner}</Link> : <div className="flex gap-2 py-1.5">{inner}</div>}</li>;
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Card>
        <p className="text-[12.5px] text-ink3"><Words k="Calories and protein are per plate. The meals of the day are set in Hostel Settings." /></p>
      </Stack>
      {editing !== undefined && (
        <MenuSheet closeHref={href(week)} week={isoOf(week)} day={editDay} dayName={`${DAY_NAMES[editDay]}, ${formatDate(new Date(week.getTime() + editDay * DAY), "UTC")}`} meal={editMeal}
          start={{ dishes: editing?.dishes ?? "", kcal: editing?.kcal != null ? String(editing.kcal) : "", proteinG: editing?.proteinG != null ? String(editing.proteinG) : "", note: editing?.note ?? "" }} />
      )}
    </>
  );
}

async function CountView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, settings: s, tz } = p;
  const per = hostelPeriod(sp, p.dates, "last7");
  const d = await withSchool(current.ctx, async (tx) => {
    const today = await tx.mealHeadCount.findMany({ where: { date: p.today } });
    const expected = new Map<string, number>();
    for (const m of s.meals) expected.set(m, await expectedCount(tx, p.today, mealMoment(p.today, m, tz, p.now)));
    const hist = await tx.mealHeadCount.findMany({ where: per.range ? { date: dateWhere(per.range) } : {}, orderBy: [{ date: "desc" }, { meal: "asc" }], take: 400 });
    let opened: null | { date: Date; meal: string; expected: number; row: (typeof hist)[number] | null } = null;
    const wantMeal = one(sp.count);
    const wantDate = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? new Date(`${one(sp.date)}T00:00:00Z`) : p.today;
    if (can.mess && s.meals.includes(wantMeal) && wantDate.getTime() <= p.today.getTime() && wantDate.getTime() >= p.today.getTime() - 7 * DAY) {
      const row = await tx.mealHeadCount.findUnique({ where: { schoolId_date_meal: { schoolId: current.ctx.schoolId, date: wantDate, meal: wantMeal } } });
      opened = { date: wantDate, meal: wantMeal, expected: await expectedCount(tx, wantDate, mealMoment(wantDate, wantMeal, tz, p.now)), row };
    }
    return { today, expected, hist, opened };
  });
  const base = `${BASE}/mess`;
  const keep = { view: "count", ...per.keep };
  const close = qs(base, keep);
  const exportHref = qs(`${base}/export`, { view: "count", ...per.keep });
  const totalExp = d.hist.reduce((a, r) => a + r.expected, 0);
  const totalAct = d.hist.reduce((a, r) => a + r.actual, 0);

  return (
    <>
      <HostelHead pageName="Mess" href={base} mode={p.mode} sub="How many ate each meal, against the boarders in the hostel." />
      <Stack>
        <Views view="count" />
        <Card>
          <CardHeader title={`Today · ${formatDate(p.today, "UTC")}`} icon={UtensilsCrossed} description="Expected: boarders checked in and not out on a pass at the meal time." divided />
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 md:p-5">
            {s.meals.map((m) => {
              const row = d.today.find((x) => x.meal === m);
              const exp = row?.expected ?? d.expected.get(m) ?? 0;
              return (
                <li key={m} className="rounded-2xl border border-line p-3.5 flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink3">{m}</span>
                  <span className="text-[22px] font-bold tnum leading-none">{row ? row.actual : "—"}<span className="text-[13px] font-medium text-ink3"> / {exp} <Words k="expected" /></span></span>
                  {row ? <span className={cx("text-[12.5px]", row.actual < row.expected ? "text-warn" : "text-ok")}>{row.actual === row.expected ? "As expected" : row.actual < row.expected ? `${row.expected - row.actual} fewer` : `${row.actual - row.expected} more`}{row.note ? ` · ${row.note}` : ""}</span> : <span className="text-[12.5px] text-ink3"><Words k="Not counted yet" /></span>}
                  {can.mess && <ButtonLink href={qs(base, { ...keep, count: m })} size="sm" variant={row ? "ghost" : "secondary"} scroll={false} className="self-start mt-1">{row ? "Change" : "Record count"}</ButtonLink>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Head counts" icon={Users} description={`${per.label} · ${totalAct.toLocaleString("en-IN")} plates served of ${totalExp.toLocaleString("en-IN")} expected`} divided
            action={<div className="flex gap-2"><PeriodFilter {...p.dates} fallback="last7" size="sm" />{can.export && <ExportButton href={exportHref} size="sm" />}</div>} />
          <DataList rows={d.hist} rowKey={(r) => r.id} minWidth={620} caption="Meal head counts"
            empty={<Empty icon={Users} title="No head counts in these dates" body="Try other dates." />}
            columns={[
              { key: "date", label: "Date", nowrap: true, render: (r) => formatDate(r.date, "UTC") },
              { key: "meal", label: "Meal", render: (r) => r.meal },
              { key: "exp", label: "Expected", align: "right", render: (r) => <span className="tnum">{r.expected}</span> },
              { key: "act", label: "Actual", align: "right", render: (r) => <b className="font-semibold tnum">{r.actual}</b> },
              { key: "diff", label: "Difference", align: "right", render: (r) => <span className={cx("tnum", r.actual < r.expected ? "text-warn" : r.actual > r.expected ? "text-info" : "text-ink3")}>{r.actual - r.expected > 0 ? "+" : ""}{r.actual - r.expected}</span> },
              { key: "note", label: "Note", render: (r) => r.note ?? <span className="text-ink3">—</span> },
              { key: "edit", label: "", render: (r) => (can.mess && r.date.getTime() >= p.today.getTime() - 7 * DAY ? <Link href={qs(base, { ...keep, count: r.meal, date: isoOf(r.date) })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Change" /></Link> : null) },
            ]}
            phone={(r) => ({ title: `${formatDate(r.date, "UTC")} · ${r.meal}`, sub: r.note ?? `${r.expected} expected`, icon: UtensilsCrossed, iconTone: r.actual < r.expected ? "warn" : "ok", right: <b className="font-semibold tnum">{r.actual} / {r.expected}</b> })}
          />
        </Card>
      </Stack>
      {d.opened && (
        <CountSheet closeHref={close} date={isoOf(d.opened.date)} dateWords={formatDate(d.opened.date, "UTC")} meal={d.opened.meal} expected={d.opened.expected}
          start={{ actual: d.opened.row ? String(d.opened.row.actual) : "", note: d.opened.row?.note ?? "" }} />
      )}
    </>
  );
}

async function ExpensesView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can } = p;
  const ctx = current.ctx;
  const params = readListParams(sp, ["view", "period", "from", "to"]);
  const per = hostelPeriod(sp, p.dates, "thismonth");
  const seesFinance = (current.permissions["finance-management"]?.see ?? "none") !== "none";
  const d = await withSchool(ctx, async (tx) => {
    const dated: Prisma.MessExpenseWhereInput = { archivedAt: null, ...(per.range ? { date: dateWhere(per.range) } : {}) };
    const where: Prisma.MessExpenseWhereInput = { ...dated, ...(params.q ? { OR: [{ item: { contains: params.q, mode: "insensitive" } }, { note: { contains: params.q, mode: "insensitive" } }] } : {}) };
    const [total, rows, sum, byItem] = await Promise.all([
      tx.messExpense.count({ where }),
      tx.messExpense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], ...skipTake(params) }),
      tx.messExpense.aggregate({ where: dated, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.messExpense.groupBy({ by: ["item"], where: dated, _sum: { amountPaise: true }, orderBy: { _sum: { amountPaise: "desc" } }, take: 6 }),
    ]);
    const [expenses, vendors, allVendors, billAbove] = await Promise.all([
      tx.expense.findMany({ where: { id: { in: rows.map((r) => r.expenseId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true, status: true } }),
      tx.vendor.findMany({ where: { id: { in: rows.map((r) => r.vendorId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
      can.mess && one(sp.new) === "1" ? tx.vendor.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }) : [],
      can.mess && one(sp.new) === "1" ? financeSettings(tx, ctx).then((f) => formatRupees(f.billRequiredAbove)) : null,
    ]);
    // Head counts in the same dates, for the cost per plate.
    const plates = await tx.mealHeadCount.aggregate({ where: per.range ? { date: dateWhere(per.range) } : {}, _sum: { actual: true } });
    return { total, rows, sum, byItem, expenses: new Map(expenses.map((e) => [e.id, e])), vendors: new Map(vendors.map((v) => [v.id, v.name])), allVendors, billAbove, plates: plates._sum.actual ?? 0 };
  });

  const base = `${BASE}/mess`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, view: "expenses", ...change });
  const spent = d.sum._sum.amountPaise ?? BigInt(0);
  const maxItem = Number(d.byItem[0]?._sum.amountPaise ?? 1);
  const STATUS: Record<string, { label: string; tone: "ok" | "info" | "warn" | "neutral" }> = { PAID: { label: "Paid", tone: "ok" }, APPROVED: { label: "To pay", tone: "info" }, WAITING: { label: "Waiting approval", tone: "warn" }, DRAFT: { label: "Draft", tone: "neutral" }, CANCELLED: { label: "Cancelled", tone: "neutral" } };
  const exportHref = qs(`${base}/export`, { view: "expenses", q: params.q || null, ...per.keep });

  return (
    <>
      <HostelHead pageName="Mess" href={base} mode={p.mode} sub="Groceries, gas, milk and the like. Each goes to Finance, Expenses under Hostel mess."
        actions={can.mess ? <ButtonLink href={href({ new: "1" })} variant="primary" icon={Plus} scroll={false}><Words k="Add expense" /></ButtonLink> : undefined} />
      <Stack>
        <Views view="expenses" />
        <Stats items={[
          { label: "Spent", value: formatRupees(spent), sub: `${per.label} · ${plural(d.sum._count._all, "bill")}`, icon: Receipt },
          { label: "Plates served", value: d.plates.toLocaleString("en-IN"), sub: "from the head counts", icon: UtensilsCrossed },
          { label: "Cost per plate", value: d.plates ? formatRupees(BigInt(Math.round(Number(spent) / d.plates))) : "—", sub: "spent ÷ plates served" },
        ]} />
        <Split side={340}>
          <Col>
            <Card>
              <Toolbar className="md:flex-wrap">
                <UrlSearch placeholder="Search item or note" label="Search mess expenses" className="flex-1 md:min-w-[220px]" id="mess-search" />
                <div className="flex gap-2 flex-wrap">
                  <PeriodFilter {...p.dates} fallback="thismonth" />
                  {can.export && <ExportButton href={exportHref} />}
                </div>
              </Toolbar>
              <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={720} caption="Mess expenses"
                empty={<Empty icon={params.q ? Search : Receipt} title={params.q ? "No expense matches" : "No mess expenses in these dates"} body={can.mess && !params.q ? "Add the first bill: vegetables, milk, gas." : "Try other dates."} />}
                columns={[
                  { key: "date", label: "Date", nowrap: true, render: (r) => formatDate(r.date, "UTC") },
                  { key: "item", label: "Item", render: (r) => <span>{r.item}<span className="block text-[12.5px] text-ink3">{r.vendorId ? d.vendors.get(r.vendorId) : ""}{r.note ? `${r.vendorId ? " · " : ""}${r.note}` : ""}</span></span> },
                  { key: "amount", label: "Amount", align: "right", nowrap: true, render: (r) => <b className="font-semibold tnum">{formatRupees(r.amountPaise)}</b> },
                  { key: "finance", label: "In Finance", render: (r) => { const e = r.expenseId ? d.expenses.get(r.expenseId) : null; if (!e) return "—"; const st = STATUS[e.status] ?? STATUS.DRAFT; return <span className="flex flex-col gap-0.5 items-start"><Pill tone={st.tone}>{st.label}</Pill>{seesFinance ? <Link href={qs("/finance-management/expenses", { q: e.number })} className="text-[12px] font-mono text-brand hover:underline">{e.number}</Link> : <span className="text-[12px] font-mono text-ink3">{e.number}</span>}</span>; } },
                ]}
                phone={(r) => { const e = r.expenseId ? d.expenses.get(r.expenseId) : null; return { title: r.item, sub: `${formatDate(r.date, "UTC")}${e ? ` · ${e.number}` : ""}`, icon: Receipt, iconTone: e?.status === "PAID" ? "ok" : "neutral", right: <b className="font-semibold tnum">{formatRupees(r.amountPaise)}</b> }; }}
              />
              {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { view: "expenses", page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { view: "expenses", page: params.page + 1 })} />}
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="By item" icon={Receipt} description={per.label} />
              <div className="px-5 pb-5">
                {d.byItem.length ? <HBars labelWidth={96} rows={d.byItem.map((x) => ({ key: x.item, label: x.item, value: Number(x._sum.amountPaise ?? 0) / maxItem, text: formatRupees(x._sum.amountPaise ?? BigInt(0)) }))} /> : <p className="text-[13px] text-ink3"><Words k="Nothing spent in these dates." /></p>}
              </div>
            </Card>
          </Col>
        </Split>
      </Stack>
      {can.mess && one(sp.new) === "1" && <ExpenseSheet closeHref={href({ new: null })} todayStr={p.todayStr} vendors={d.allVendors.map((v) => ({ value: v.id, label: v.name }))} items={MESS_ITEMS} billAbove={d.billAbove} />}
    </>
  );
}

