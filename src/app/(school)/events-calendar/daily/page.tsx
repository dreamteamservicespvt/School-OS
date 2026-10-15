import Link from "next/link";
import { Baby, BarChart3, Bell, CalendarPlus, Check, CheckCheck, History, NotebookPen, Send } from "lucide-react";
import { withSchool } from "@/lib/db";
import { absentOn, activityIcon, childDay, childrenOf, dayActivities, diariesSent, filledIn, needsCare, todayProgress } from "@/lib/events/daily";
import { clock, isoOf, niceDay, shortDay, spanWords } from "@/lib/events/words";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Chips, Col, Empty, HBars, Progress, Row, Split } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { formatTime } from "@/lib/format";
import { EvHead } from "../_components/head";
import { EvIcon } from "../_components/icons";
import { ActButton } from "../_components/bits";
import { AssignSheet, DailyLog, SendDiarySheet } from "../_components/daily-sheets";
import { removeActivityAction, remindDiaryAction } from "../activity-actions";
import { BASE, UUID, evGuard, evPeriod, one, qs, type SearchParams } from "../_lib/page";

export const metadata = { title: "Daily Activities" };

const HREF = `${BASE}/daily`;

/** Minutes after midnight now, in the school's time zone. */
function nowMin(tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
}

/**
 * Daily Activities (18 §2, mod-events.jsx DailyActivities): the pre-primary
 * diary. A pre-primary class teacher writes their own class's diary; the
 * Principal, School Admin and VP see each class's progress today, remind a
 * teacher who is behind and read any diary, but never write it.
 */
export default async function DailyPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("daily");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const year = p.year!;
  const writer = p.preMine.length > 0;
  const sections = writer ? p.preMine : p.pre;
  const sectionId = sections.some((s) => s.id === one(sp.section)) ? one(sp.section) : sections[0].id;
  const sec = sections.find((s) => s.id === sectionId)!;
  const vp = evPeriod(sp, p.dates, "last7");
  const range = vp.range!;
  const keep = { section: sectionId === sections[0].id ? null : sectionId, ...vp.keep };
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...over });
  const doing = writer ? one(sp.do) : "";
  const now = nowMin(p.tz);
  const today = p.today;

  const d = await withSchool(ctx, async (tx) => {
    const [kids, acts, away, sent, filled, progress] = await Promise.all([
      childrenOf(tx, sectionId, year.id),
      dayActivities(tx, [sectionId], today),
      absentOn(tx, [sectionId], today),
      diariesSent(tx, [sectionId], range.from, range.to),
      filledIn(tx, sections.map((s) => s.id), range.from, range.to),
      !writer && p.can.dailyRemind ? todayProgress(tx, ctx, year.id, today, now) : Promise.resolve([]),
    ]);
    return { kids, acts, absent: away.get(sectionId) ?? new Set<string>(), sent, filled, progress };
  });

  const absentKids = d.kids.filter((k) => d.absent.has(k.id));
  const present = d.kids.filter((k) => !d.absent.has(k.id));
  const actId = d.acts.some((a) => a.id === one(sp.act)) ? one(sp.act) : (d.acts.find((a) => a.logs.length < present.length) ?? d.acts[0])?.id ?? "";
  const act = d.acts.find((a) => a.id === actId);
  const done = (a: (typeof d.acts)[number]) => present.filter((k) => a.logs.some((l) => l.studentId === k.id)).length;
  const sentToday = d.sent.find((x) => isoOf(x.date) === today);
  const notLogged = d.acts.filter((a) => done(a) < present.length).map((a) => a.label);
  const preview = (() => { for (const k of present) { const t = childDay(d.acts, k.id); if (t) return `${k.firstName}’s day, ${niceDay(today)}: ${t} – ${sec.teacher ?? "Class teacher"}, ${sec.label}`; } return null; })();
  const subLine = `${sec.label} · class teacher ${sec.teacher ?? "not set"} · ${shortDay(today)} · `;

  const diaryTable = (
    <Card className="overflow-hidden min-w-0">
      <CardHeader title={writer ? "Today’s diary" : `Today’s diary · ${sec.label}`} icon={NotebookPen}
        description={writer ? "Tap a column to log it for the whole class" : `${sec.label} · ${sec.teacher ?? "No class teacher"} · ${present.length} present${absentKids.length ? `, ${absentKids.length} absent` : ""}${sentToday ? ` · sent ${formatTime(sentToday.sentAt, p.tz)}` : " · not sent yet"}`} />
      {d.acts.length ? (
        <div className="overflow-x-auto scroll-thin border-t border-line">
          <table className="text-[12.5px] min-w-full">
            <caption className="sr-only">Today’s diary for {sec.label}</caption>
            <thead>
              <tr className="border-b border-line text-ink3">
                <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[150px]">Child</th>
                {d.acts.map((a) => {
                  const inner = <><span className="flex items-center gap-1 whitespace-nowrap"><EvIcon name={activityIcon(a.type, a.label)} size={13} />{a.label.split(":")[0]}</span><span className="block text-[11px] font-medium opacity-90 tnum">{clock(a.startMin)} · {done(a)}/{present.length}</span></>;
                  return (
                    <th key={a.id} scope="col" className="px-1.5 py-2 font-semibold min-w-[96px]">
                      {writer ? <Link href={here({ act: a.id })} scroll={false} aria-current={a.id === actId ? "true" : undefined} className={cx("block w-full rounded-lg px-1.5 py-1 text-left transition", a.id === actId ? "bg-brand/10 text-brand" : "hover:bg-sunken")}>{inner}</Link>
                        : <span className="block w-full rounded-lg px-1.5 py-1 text-left">{inner}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {d.kids.map((k) => {
                const off = d.absent.has(k.id);
                return (
                  <tr key={k.id} className="border-b border-line/60 last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2 font-medium whitespace-nowrap text-left">{k.fullName}{off && <span className="text-bad text-[11.5px] font-semibold"> · absent</span>}</th>
                    {d.acts.map((a) => {
                      const l = off ? null : a.logs.find((x) => x.studentId === k.id);
                      return <td key={a.id} className="px-1.5 py-1.5">{l ? <span title={l.note ?? undefined} className={cx("inline-block rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", needsCare(l.value) ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok")}>{l.value}{l.note ? " *" : ""}</span> : <span className="text-ink3">—</span>}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-line"><Empty icon={CalendarPlus} title="Nothing assigned for today" body={writer ? "Assign today’s activities: meals, nap, water and learning activities." : `${sec.teacher ?? "The class teacher"} has not assigned activities for today yet.`}
          action={writer ? <ButtonLink variant="secondary" icon={CalendarPlus} href={here({ do: "assign" })} scroll={false}>Assign activities</ButtonLink> : undefined} /></div>
      )}
    </Card>
  );

  const history = (
    <Card>
      <CardHeader title="Diaries sent" description={`${sec.label} · ${vp.label} · ${spanWords(range.from, range.to)}`} icon={History} />
      <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback="last7" /></div>
      <ul className="px-2 pb-2 max-h-72 overflow-y-auto scroll-thin">
        {!sentToday && range.from <= today && today <= range.to && d.acts.length > 0 && <Row icon={NotebookPen} iconTone="brand" title={shortDay(today)} sub="Being filled in now · not sent yet" />}
        {d.sent.map((x) => <Row key={x.id} icon={Send} iconTone="ok" title={shortDay(isoOf(x.date))} sub={`Sent ${formatTime(x.sentAt, p.tz)} · ${x.people} parents · ${x.logged}% of activities logged`} />)}
        {!d.sent.length && (sentToday || !d.acts.length || today < range.from || today > range.to) && <li className="px-3 py-3 text-[13.5px] text-ink3">No diaries sent in these dates.</li>}
      </ul>
    </Card>
  );

  const filledCard = (
    <Card>
      <CardHeader title="Diary filled in" description={`Activities logged when the diary went out · ${spanWords(range.from, range.to)}`} icon={BarChart3} />
      <div className="px-5 pb-5">
        {d.filled.size ? <HBars rows={sections.filter((s) => d.filled.has(s.id)).map((s) => ({ k: s.label.replace("Nursery", "Nur"), v: d.filled.get(s.id) ?? 0 }))} lowBelow={90} labelWidth={64} /> : <p className="text-[13.5px] text-ink3">No diaries sent in these dates.</p>}
      </div>
    </Card>
  );

  return (
    <div>
      <EvHead pageName="Daily Activities" href={HREF} sub="The pre-primary daily diary: meals, nap, water and activities for each child. Parents get it in the afternoon."
        actions={writer && <>
          <ButtonLink variant="secondary" icon={CalendarPlus} className="hidden md:inline-flex" href={here({ do: "assign" })} scroll={false}>Assign activities</ButtonLink>
          <ButtonLink variant="primary" icon={Send} href={here({ do: "send" })} scroll={false}>{sentToday ? "Send again" : "Send today’s diary"}</ButtonLink>
        </>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {writer ? (
          <>
            {sections.length > 1 && <Chips label="Class" value={sectionId} options={sections.map((s) => ({ value: s.id, label: s.label, count: s.students, href: qs(HREF, { section: s.id, ...vp.keep }) }))} />}
            <p className="text-[13.5px] text-ink3 -mt-2">{subLine}<b className="font-semibold text-ink2">{present.length} present</b>{absentKids.length ? `, ${absentKids.length} absent (${absentKids.map((k) => k.fullName).join(", ")})` : ", no one absent"}</p>
            <Split side={340}>
              {diaryTable}
              <Col>
                {act ? (
                  <Card>
                    <CardHeader title={`Log: ${act.label}`} description={`${clock(act.startMin)} · tick the children, then save once`} icon={CheckCheck}
                      action={act.logs.length === 0 ? <ActButton action={removeActivityAction} fields={{ activityId: act.id }} label="Take off" variant="ghost" /> : undefined} />
                    <DailyLog activityId={act.id} label={act.label} time={clock(act.startMin)} options={act.options} present={present.map((k) => ({ id: k.id, name: k.fullName }))} />
                  </Card>
                ) : null}
                {history}
                {filledCard}
              </Col>
            </Split>
          </>
        ) : (
          <>
            <Card>
              <CardHeader title="Today in each class" description={`Activities due by now (${clock(now)}) and logged by the class teacher · tap a class to read its diary`} icon={Baby} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 px-4 pb-4">
                {d.progress.map((c) => {
                  const on = c.id === sectionId;
                  const behind = c.logged < c.due;
                  return (
                    <div key={c.id} className={cx("rounded-xl border p-3 flex flex-col gap-2 min-w-0", on ? "border-brand bg-brand/10" : "border-line")}>
                      <Link href={qs(HREF, { section: c.id === sections[0].id ? null : c.id, ...vp.keep })} scroll={false} aria-current={on ? "true" : undefined} className="text-left min-w-0 block">
                        <span className="flex items-baseline justify-between gap-2"><span className="font-semibold text-[14.5px]">{c.label}</span><span className="text-[12.5px] text-ink2 tnum shrink-0"><b className="text-ink">{c.present}</b> of {c.students} in</span></span>
                        <span className="block text-[12.5px] text-ink3 truncate">{c.teacher ?? "No class teacher"}</span>
                        <Progress value={c.due ? (c.logged / c.due) * 100 : c.sentAt ? 100 : 0} tone={behind ? "warn" : "ok"} className="mt-2" />
                        <span className={cx("block text-[12.5px] mt-1.5", behind ? "text-warn font-semibold" : "text-ink3")}>
                          {c.sentAt ? `Diary sent ${formatTime(c.sentAt, p.tz)}` : behind ? `${c.missing.join(" and ")} not logged yet` : c.due ? `${c.logged} of ${c.due} logged` : "Nothing due yet"}
                        </span>
                      </Link>
                      {behind && !c.sentAt && (c.reminded
                        ? <span className="text-[12.5px] text-ok font-semibold flex items-center gap-1"><Check size={14} aria-hidden="true" />Reminded</span>
                        : c.teacher && <ActButton action={remindDiaryAction} fields={{ sectionId: c.id }} label={<><Bell size={15} aria-hidden="true" />Remind {c.teacher.split(" ")[0]}</>} />)}
                    </div>
                  );
                })}
              </div>
            </Card>
            {diaryTable}
            <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start [&>*]:min-w-0">
              {history}
              {filledCard}
            </div>
          </>
        )}
      </div>
      {doing === "assign" && (
        <AssignSheet closeHref={here({ do: null })} sections={sections.map((s) => ({ value: s.id, label: s.label }))} sectionId={sectionId} types={p.settings.dailyTypes} today={today}
          dayLabel="That day only" weekLabel="Six school days" />
      )}
      {doing === "send" && <SendDiarySheet closeHref={here({ do: null })} sectionId={sectionId} label={sec.label} parents={present.length} preview={preview} notLogged={notLogged} />}
    </div>
  );
}
