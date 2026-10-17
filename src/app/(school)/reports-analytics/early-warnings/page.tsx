import Link from "next/link";
import {
  CalendarX2, Check, CircleCheck, Eye, Inbox, IndianRupee, ListChecks, ListTodo, Pencil, SearchX, Settings2, Sparkles, Telescope, TrendingDown, TriangleAlert, User, UserCheck,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { momentWhere, periodFromSearch, rangeWords } from "@/lib/periods";
import { addDays } from "@/lib/staff/dates";
import {
  ACTIONS, AREAS, aiSignals, listFlags, mayRemind, mayReview, remindedToday, STATUS_LABEL, STATUS_TONE, STRENGTH_LABEL, warningRules,
  type Area, type FlagRow, type FlagStatus,
} from "@/lib/reports/warnings";
import { FORECAST_AREA_LABEL } from "@/lib/reports/forecasts";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner, Chips, Col, DataList, IconTile, Split, Stats, Suggestion, Timeline, Toolbar } from "@/components/ui/kit";
import { Pill } from "@/components/ui/badge";
import { Pager } from "@/components/ui/data-list";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/money/kit";
import { UrlSearch, UrlSegmented } from "@/components/money/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { RemindButton } from "@/components/remind-button";
import { cardPill } from "@/components/ui/data-list";
import { RepHead } from "../_components/head";
import { QuickButton } from "../_components/bits";
import { DropRuleSheet, ReviewSheet } from "../_components/warning-sheets";
import { aiDecisionAction, remindFlagAction } from "../actions";
import { BASE, one, qs, repGuard, withQ, type SearchParams } from "../_lib/page";

const PAGE_SIZE = 25;

export const metadata = { title: "Early Warnings" };

const HREF = `${BASE}/early-warnings`;
const AREA_ICON = { attendance: CalendarX2, marks: TrendingDown, fees: IndianRupee } as const;
const STATUSES: FlagStatus[] = ["NEW", "REVIEWED", "ACTION_PLANNED", "CLOSED"];
const strengthTone = (s: string) => (s === "ACT_NOW" ? "bad" : "warn") as "bad" | "warn";

/** Early Warnings (19 §3, mod-reports.jsx EarlyWarnings): students who may need help; nothing happens until a person reviews. */
export default async function EarlyWarningsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await repGuard("warnings");
  const sp = await searchParams;
  const a = p.a;
  const statusRaw = one(sp.status);
  const status = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as FlagStatus) : "open";
  const areas = AREAS.filter((x) => x.value !== "fees" || a.warnings.fees);
  const area = (areas.find((x) => x.value === one(sp.area))?.value ?? "all") as Area | "all";
  const q = one(sp.q).trim();
  const range = periodFromSearch(sp, { ...p.dates, fallback: "last30" });
  const when = range ? momentWhere(range, p.tz) : null;
  const openId = one(sp.open) || one(sp.review);

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [rules, res, ai] = await Promise.all([
      warningRules(tx, p.current.ctx),
      listFlags(tx, p.current, a, { status, area, q, raisedFrom: when?.gte ?? null, raisedTo: when?.lt ?? null }),
      aiSignals(tx, p.current, a),
    ]);
    let open: FlagRow | null = openId ? res.list.find((f) => f.id === openId) ?? null : null;
    if (openId && !open) {
      for (const s of ["open", "CLOSED"] as const) {
        open = (await listFlags(tx, p.current, a, { status: s, area: "all", q: "", raisedFrom: null, raisedTo: null })).list.find((f) => f.id === openId) ?? null;
        if (open) break;
      }
    }
    const reminded = mayRemind(a) ? await remindedToday(tx, p.current.ctx, [...res.list.map((f) => f.id), ...(open ? [open.id] : [])], p.tz) : new Map<string, Date>();
    return { rules, ...res, ai, open, reminded };
  });
  const { rules, list, counts, open, reminded } = data;
  const ahead = data.ai.filter((s) => s.kind === "prediction");
  const signals = data.ai.filter((s) => s.kind !== "prediction");
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(sp.page) || "1", 10) || 1));
  const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const keep = { status: status === "open" ? null : status, area: area === "all" ? null : area, q: q || null, period: one(sp.period) || null, from: one(sp.from) || null, to: one(sp.to) || null };
  const close = withQ(HREF, sp, { open: null, review: null, as: null, rule: null, first: null });
  const due = formatDate(addDays(p.today, 3), "UTC");
  const own = p.own.map((s) => s.label);
  const remindAt = (id: string) => { const t = reminded.get(id); return t ? formatTime(t, p.tz) : null; };
  const reviewing = one(sp.review) && open && open.status !== "CLOSED" && mayReview(a, open.area) ? open : null;

  return (
    <div>
      <RepHead pageName="Early Warnings" href={HREF}
        sub={a.own ? `Students in ${own.length === 1 ? `Class ${own[0]}` : "your classes"} who may need help. Nothing happens until a person reviews.` : "Students who may need help, from attendance, marks and fees. Nothing happens to a student until a person reviews."}
        actions={a.warnings.rule ? <ButtonLink href={withQ(HREF, sp, { rule: "1" })} scroll={false} variant="secondary" icon={Settings2}>Marks-drop rule</ButtonLink> : null} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {a.own && <Banner tone="info" title="Showing your classes only.">Fee signals go to the Principal and accounts, not to teachers.</Banner>}
        {!a.own && a.warnings.review === "none" && <Banner tone="info" title="You watch these flags.">Class teachers review their students’ flags; use Remind to ask them. Fee flags go to accounts.</Banner>}
        <Stats items={[
          { label: "Act now", value: String(counts.actNow), sub: "Open flags", tone: "bad", icon: TriangleAlert, href: qs(HREF, { ...keep, status: null }) },
          { label: "Watch", value: String(counts.watch), sub: "Open flags", tone: "warn", icon: Eye },
          { label: "Not reviewed yet", value: String(counts.NEW), sub: "Review before any action", tone: "brand", icon: Inbox, href: qs(HREF, { ...keep, status: "NEW" }) },
          { label: "Closed", value: String(counts.CLOSED), sub: "With a reason each", icon: CircleCheck, href: qs(HREF, { ...keep, status: "CLOSED" }) },
        ]} />
        <Split side={340}>
          <Card className="overflow-hidden">
            <Toolbar className="md:flex-wrap">
              <UrlSearch id="ew-q" placeholder="Student name or class" label="Find a student" />
              <PeriodFilter {...p.dates} fallback="last30" className="w-full md:w-auto" />
              <UrlSegmented param="area" fallback="all" label="Signal" options={[{ value: "all", label: "All" }, ...areas.map((x) => ({ value: x.value, label: x.label }))]} />
            </Toolbar>
            <p className="px-4 pt-3 text-[12.5px] text-ink3">Showing flags raised: {range ? `${range.label} · ${rangeWords(range.from, range.to)}` : "All dates"}</p>
            <div className="px-3 pt-2">
              <Chips value={status} label="Flag status" options={[
                { value: "open", label: "Open", count: counts.open, href: qs(HREF, { ...keep, status: null }) },
                ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s], href: qs(HREF, { ...keep, status: s }) })),
              ]} />
            </div>
            <DataList rows={shown} rowKey={(f) => f.id} minWidth={720} href={(f) => withQ(HREF, sp, { open: f.id })}
              empty={status === "NEW" && !q
                ? <Empty icon={CircleCheck} title="Every flag has been reviewed" body="New flags appear here each morning after attendance is taken, and when marks or fees cross a rule." />
                : <Empty icon={SearchX} title="No flag matches" body="Try another status, signal or dates." action={<Link href={qs(HREF, { period: "acyear" })} className={buttonClass("secondary")}>Show all open flags this year</Link>} />}
              columns={[
                { key: "n", label: "Student", render: (f) => <span className="flex items-center gap-3"><Avatar name={f.name} size={34} /><span className="min-w-0"><b className="font-semibold block leading-tight">{f.name}</b><span className="text-[12.5px] text-ink3">{f.cls}</span></span></span> },
                { key: "r", label: "Why", className: "max-w-[340px]", render: (f) => <span className="block text-[13px] text-ink2 leading-snug">{f.signals[0]?.text}{f.signals.length > 1 && <span className="text-ink3"> · +{f.signals.length - 1} more</span>}</span> },
                { key: "s", label: "Strength", nowrap: true, render: (f) => <Pill tone={strengthTone(f.strength)} dot>{STRENGTH_LABEL[f.strength]}</Pill> },
                { key: "t", label: "Status", nowrap: true, render: (f) => <Pill tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Pill> },
              ]}
              mobile={(f) => ({
                title: f.name, sub: `${f.cls} · ${f.signals[0]?.text ?? ""}`, lead: <Avatar name={f.name} size={36} />,
                pills: <><Pill tone={strengthTone(f.strength)} className={cardPill}>{STRENGTH_LABEL[f.strength]}</Pill><Pill tone={STATUS_TONE[f.status]} className={cardPill}>{STATUS_LABEL[f.status]}</Pill></>,
              })}
              footer={list.length > PAGE_SIZE
                ? <Pager page={page} pageSize={PAGE_SIZE} total={list.length} prevHref={withQ(HREF, sp, { page: page > 2 ? String(page - 1) : null, open: null })} nextHref={withQ(HREF, sp, { page: String(page + 1), open: null })} />
                : `${list.length} ${list.length === 1 ? "flag" : "flags"} · Act now first`} />
          </Card>
          <Col>
            <Card>
              <CardHeader title="Rules behind the flags" description="From the settings of each module" icon={ListChecks} />
              <ul className="px-5 pb-4 text-[13.5px] divide-y divide-line/70">
                {([
                  ["Attendance below", `${rules.threshold}% (watch from ${rules.watch}%)`, "Attendance Settings"],
                  ["Absent in a row", `${rules.streakDays} school days`, "Attendance Settings"],
                  ["Pass mark", `${rules.pass}% in a subject`, "Exam Settings"],
                  ["Marks drop between tests", `${rules.drop}% or more`, "Set here by the Principal"],
                  ...(a.warnings.fees ? [["Fees overdue", `${rules.feeDays} days`, "Fee Settings"]] : []),
                ] as [string, string, string][]).map(([k, v, from]) => (
                  <li key={k} className="py-2.5 flex items-start justify-between gap-3"><span className="min-w-0"><span className="block font-medium">{k}</span><span className="block text-[12px] text-ink3">{from}</span></span><b className="font-semibold tnum text-right">{v}</b></li>
                ))}
              </ul>
              {rules.lastRefreshAt && <p className="px-5 pb-3 -mt-2 text-[12px] text-ink3">Last checked {formatDateTime(rules.lastRefreshAt, p.tz)}</p>}
              {a.warnings.rule && <div className="px-5 pb-4"><ButtonLink href={withQ(HREF, sp, { rule: "1" })} scroll={false} size="sm" variant="secondary" icon={Pencil}>Change the marks-drop rule</ButtonLink></div>}
            </Card>
            {a.ai.forecasts && (
              <>
                <div id="looking-ahead" className="scroll-mt-4 flex items-center gap-2 px-1"><Telescope size={15} className="text-brand" aria-hidden="true" /><p className="text-[13px] font-semibold text-ink2">Looking ahead</p><span className="text-[12px] text-ink3">· what may happen next, if nothing changes</span></div>
                {ahead.map((s) => (
                  <Suggestion key={s.key} title={s.title} source={s.source}
                    actions={<>
                      {s.area && <Pill tone={s.strength === "ACT_NOW" ? "bad" : "warn"} dot>{FORECAST_AREA_LABEL[s.area]}{s.strength === "ACT_NOW" ? " · act soon" : ""}</Pill>}
                      {s.href && <ButtonLink href={s.href} size="sm" variant="secondary">{s.hrefLabel ?? "Open"}</ButtonLink>}
                      <QuickButton run={aiDecisionAction.bind(null, s.key, "FLAGGED")} variant="soft">{s.studentId ? "Add for review" : "Make it a task"}</QuickButton>
                      <QuickButton run={aiDecisionAction.bind(null, s.key, "DISMISSED")} variant="ghost">Not a concern</QuickButton>
                    </>}>{s.body}</Suggestion>
                ))}
                {ahead.length === 0 && <Card><Empty icon={Telescope} title="Nothing to look out for right now" body="Worked out again every few hours from attendance, marks, fees, admissions, staff leave and the cash and bank books." /></Card>}
              </>
            )}
            {a.ai.insights && (
              <>
                <div className="flex items-center gap-2 px-1"><Sparkles size={15} className="text-brand" aria-hidden="true" /><p className="text-[13px] font-semibold text-ink2">AI signals</p><span className="text-[12px] text-ink3">· on in Settings, Modules On/Off</span></div>
                {signals.map((s) => (
                  <Suggestion key={s.key} title={s.title} source={s.source}
                    actions={<>
                      {s.flagId
                        ? <ButtonLink href={withQ(HREF, sp, { open: s.flagId })} scroll={false} size="sm" variant="soft">Open the flag</ButtonLink>
                        : <QuickButton run={aiDecisionAction.bind(null, s.key, "FLAGGED")} variant="soft">Add for review</QuickButton>}
                      <QuickButton run={aiDecisionAction.bind(null, s.key, "DISMISSED")} variant="ghost">Not a concern</QuickButton>
                    </>}>{s.body}</Suggestion>
                ))}
                {signals.length === 0 && <Card><Empty icon={Sparkles} title="No AI signals right now" body="New ones appear here after each day’s attendance and each exam." /></Card>}
              </>
            )}
          </Col>
        </Split>
      </div>

      {open && !reviewing && (
        <UrlSheet wide title={`${open.name} · ${open.cls}`} sub={`Raised ${formatDate(open.raisedAt, p.tz)} · ${STRENGTH_LABEL[open.strength]} · ${STATUS_LABEL[open.status]}`} closeHref={close}
          footer={open.status !== "CLOSED" && mayReview(a, open.area) ? <>
            <ButtonLink href={`/student-management/students/${open.studentId}`} variant="ghost" icon={User}>Open profile</ButtonLink>
            <ButtonLink href={open.status === "NEW" ? withQ(HREF, sp, { first: "1" }) : withQ(HREF, sp, { open: null, review: open.id, as: "ACTION_PLANNED" })} scroll={false} variant="secondary" icon={ListTodo}>Plan an action</ButtonLink>
            <ButtonLink href={withQ(HREF, sp, { open: null, review: open.id, as: null, first: null })} scroll={false} variant="primary" icon={Check}>Review</ButtonLink>
          </> : open.status !== "CLOSED" && mayRemind(a) ? <>
            <ButtonLink href={`/student-management/students/${open.studentId}`} variant="ghost" icon={User}>Open profile</ButtonLink>
            <RemindButton run={remindFlagAction.bind(null, open.id)} done={remindAt(open.id)} size="md" label={open.area === "fees" ? "Remind accounts" : "Remind the class teacher"} />
          </> : <CloseSheetButton>Close</CloseSheetButton>}>
          <div className="flex flex-col gap-4">
            {one(sp.first) === "1" && open.status === "NEW" && <Banner tone="warn" title="Review this flag first.">Check the reason and write a note. You can plan the action in the same step.</Banner>}
            <ul className="flex flex-col gap-2.5">
              {open.signals.map((s, i) => (
                <li key={i} className="rounded-2xl border border-line p-3.5 flex gap-3">
                  <IconTile icon={AREA_ICON[open.area as Area] ?? TriangleAlert} tone={strengthTone(open.strength)} size={36} />
                  <div className="min-w-0">
                    <p className="text-[12px] text-ink3 font-semibold">{AREAS.find((x) => x.value === open.area)?.label}</p>
                    <p className="text-[14.5px] font-semibold leading-snug">{s.text}</p>
                    <p className="text-[12.5px] text-ink3 mt-1">Based on: {s.basis}</p>
                  </div>
                </li>
              ))}
            </ul>
            {open.action && <p className="text-[13.5px] text-ink2 flex items-center gap-2"><ListTodo size={16} className="text-ink3" aria-hidden="true" />Planned: <b className="font-semibold text-ink">{open.action}</b></p>}
            {open.closedReason && open.status === "CLOSED" && !open.reviews.length && <p className="text-[13.5px] text-ink2">{open.closedReason}</p>}
            <div>
              <p className="eyebrow text-ink3 mb-2">Review history</p>
              {open.reviews.length
                ? <Timeline items={open.reviews.map((r) => ({ what: <><b className="font-semibold">{r.who}</b> · {r.decision === "NOT_A_CONCERN" ? "Not a concern" : r.decision === "ACTION_PLANNED" ? `Action planned${r.action ? `: ${r.action}` : ""}` : "Reviewed"}. “{r.note}”</>, when: formatDateTime(r.createdAt, p.tz), icon: UserCheck, tone: "brand" as const }))} />
                : <p className="text-[13.5px] text-ink3">Not reviewed yet. Nothing happens to {open.name.split(" ")[0]} from this flag alone.</p>}
            </div>
          </div>
        </UrlSheet>
      )}
      {reviewing && (
        <ReviewSheet flagId={reviewing.id} name={reviewing.name} fee={reviewing.area === "fees"} preset={one(sp.as) === "ACTION_PLANNED" ? "ACTION_PLANNED" : "REVIEWED"}
          actions={ACTIONS.map((x) => ({ key: x.key, label: x.label, fees: x.fees }))} closeHref={withQ(HREF, sp, { review: null, as: null, open: reviewing.id })}
          teacher={null} counsellor={null} dueWords={due} />
      )}
      {one(sp.rule) === "1" && a.warnings.rule && <DropRuleSheet value={rules.drop} closeHref={close} />}
    </div>
  );
}
