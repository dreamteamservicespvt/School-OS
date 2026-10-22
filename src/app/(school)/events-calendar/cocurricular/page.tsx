import Link from "next/link";
import { Award, BarChart3, CalendarDays, Clock, FileBadge, Flag, HeartPulse, History, Medal, Plus, Printer, Star, Timer, TrendingDown, TrendingUp, Trophy, UserPlus, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere } from "@/lib/periods";
import { LEVEL_TONE, FIXTURE_RESULTS, GROUNDS, leaderboard, membersOf, missedInARow, bmi, runWords } from "@/lib/events/cocurricular";
import { creditsFor } from "@/lib/events/settings";
import { placesOf } from "@/lib/events/places";
import { HOUSE_BG, clock, isoOf, longDay, shortDay, spanWords } from "@/lib/events/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Chips, Col, Empty, HBars, Row, Split, Stats, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill } from "@/components/ui/data-list";
import { InlineBulkBar } from "@/components/ui/list-controls";
import { Ring } from "@/components/ui/display";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { cx } from "@/components/ui/cx";
import { EvHead } from "../_components/head";
import { EvIcon } from "../_components/icons";
import { ActButton } from "../_components/bits";
import {
  AchievementSheet, ArchiveAchievementSheet, AssignHousesSheet, ClubSheet, CreditSheet, FitnessSheet, FixtureSheet, IssueSheet, MembersSheet, PointsSheet, ResultSheet, SessionSheet, TeamSheet,
} from "../_components/co-sheets";
import { archiveGroupAction, certificatesAction, removeMemberAction } from "../activity-actions";
import { achievementList, pickStudents, staffOptions } from "../_lib/co";
import { BASE, UUID, evGuard, evPeriod, one, qs, type SearchParams } from "../_lib/page";
import { DayText, Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Co-curricular & Sports") };
}

const HREF = `${BASE}/cocurricular`;
const TABS = ["ach", "houses", "clubs", "sports"] as const;
type Tab = (typeof TABS)[number];
const n = (v: number) => v.toLocaleString("en-IN");
const clubIcon = (name: string) => {
  const t = name.toLowerCase();
  if (/eco|green|nature/.test(t)) return "Leaf";
  if (/robot|code|computer|tech/.test(t)) return "Cpu";
  if (/liter|read|book|debate/.test(t)) return "BookOpen";
  if (/music|band|choir/.test(t)) return "Music";
  if (/art|paint|craft/.test(t)) return "Palette";
  if (/chess/.test(t)) return "Crown";
  if (/science|math/.test(t)) return "FlaskConical";
  return "Users";
};
const teamIcon = (sport: string) => {
  const t = sport.toLowerCase();
  if (/athlet|run|track/.test(t)) return "Timer";
  if (/cricket|gym|weight/.test(t)) return "Dumbbell";
  if (/football|hockey|basket/.test(t)) return "Trophy";
  return "Medal";
};

/** Co-curricular & Sports (18 §2, mod-events.jsx Cocurricular): achievements and certificates, houses, clubs and sports. */
export default async function CocurricularPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("cocurricular");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const s = p.settings;
  const canEdit = p.can.cocurricular;
  const tabs = TABS.filter((t) => t === "ach" || (t === "houses" ? s.housesOn : t === "clubs" ? s.clubsOn : s.sportsOn));
  const tab: Tab = (tabs as readonly string[]).includes(one(sp.t)) ? (one(sp.t) as Tab) : "ach";
  const q = one(sp.q).trim().slice(0, 60);
  const level = s.levels.includes(one(sp.level)) ? one(sp.level) : "all";
  const vp = evPeriod(sp, p.dates, "acyear");
  const range = vp.range!;
  const g = UUID.test(one(sp.g)) ? one(sp.g) : "";
  const keep = { t: tab === "ach" ? null : tab, q: q || null, level: level === "all" ? null : level, g: g || null, ...vp.keep };
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...over });
  const doing = canEdit ? one(sp.do) : "";
  const pick = UUID.test(one(sp.id)) ? one(sp.id) : "";
  const tickIds = one(sp.ids).split(",").filter((x) => UUID.test(x)).slice(0, 300);
  const year = p.year;

  const d = await withSchool(ctx, async (tx) => {
    const needStudents = ["add", "points-assign", "credit", "members", "fitness", "captain"].includes(doing) && year;
    const students = needStudents ? await pickStudents(tx, year.id) : [];
    const staff = ["club", "team"].includes(doing) ? await staffOptions(tx) : [];
    const teamsAll = await tx.sportsTeam.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });

    if (tab === "ach") {
      const rows = await achievementList(tx, range, { level, q });
      const yearRows = year ? await tx.achievement.findMany({ where: { archivedAt: null, academicYearId: year.id }, select: { kind: true, studentId: true } }) : [];
      const kinds = new Map<string, Set<string>>();
      for (const r of yearRows) kinds.set(r.kind, (kinds.get(r.kind) ?? new Set()).add(r.studentId));
      const events = doing === "add" ? await tx.event.findMany({ where: { archivedAt: null, cancelledAt: null, date: { lte: new Date(`${p.today}T00:00:00Z`) } }, orderBy: { date: "desc" }, take: 30, select: { id: true, name: true } }) : [];
      const issue = doing === "issue" && tickIds.length ? await achievementList(tx, range, { ids: tickIds }) : [];
      const archive = doing === "archive" && pick ? (await achievementList(tx, range, { ids: [pick] }))[0] : null;
      return { kind: "ach" as const, students, rows, taking: [...kinds].map(([k, v]) => ({ k, v: v.size })).sort((a, b) => b.v - a.v).slice(0, 8), events, issue, archive, teamsAll };
    }
    if (tab === "houses") {
      const board = year ? await leaderboard(tx, year.id) : [];
      const log = year ? await tx.housePointsEntry.findMany({ where: { academicYearId: year.id, date: dateWhere(range) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 30 }) : [];
      const givers = await tx.userLogin.findMany({ where: { id: { in: [...new Set(log.map((l) => l.givenById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } });
      const studying = year ? await tx.enrolment.count({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING" } }) : 0;
      const housed = year ? await tx.houseMember.count({ where: { academicYearId: year.id, archivedAt: null } }) : 0;
      return { kind: "houses" as const, students, board, log, givers: new Map(givers.map((x) => [x.id, x.displayName])), without: Math.max(0, studying - housed) };
    }
    if (tab === "clubs") {
      const clubs = await tx.club.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
      const counts = year ? await tx.clubMember.groupBy({ by: ["clubId"], where: { academicYearId: year.id, archivedAt: null }, _count: { _all: true } }) : [];
      const inCharge = await tx.staff.findMany({ where: { id: { in: clubs.map((c) => c.inChargeId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
      const meetings = await tx.clubMeeting.findMany({ where: { date: dateWhere(range), clubId: { in: clubs.map((c) => c.id) } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 40 });
      const open = g ? clubs.find((c) => c.id === g) ?? null : null;
      const members = open && year ? await pickStudents(tx, year.id, await membersOf(tx, "club", open.id, year.id)) : [];
      const sheetGroup = ["members", "session", "club"].includes(doing) && pick ? clubs.find((c) => c.id === pick) ?? null : null;
      const sheetMembers = sheetGroup && year && doing === "session" ? await pickStudents(tx, year.id, await membersOf(tx, "club", sheetGroup.id, year.id)) : [];
      return { kind: "clubs" as const, students, staff, clubs, counts: new Map(counts.map((c) => [c.clubId, c._count._all])), inCharge: new Map(inCharge.map((x) => [x.id, x.fullName])), meetings, open, members, sheetGroup, sheetMembers };
    }
    // Sports
    const teams = teamsAll;
    const counts = year ? await tx.teamMember.groupBy({ by: ["teamId"], where: { academicYearId: year.id, archivedAt: null }, _count: { _all: true } }) : [];
    const coaches = await tx.staff.findMany({ where: { id: { in: teams.map((t) => t.coachId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
    const fixtures = await tx.fixture.findMany({ where: { archivedAt: null, date: dateWhere(range) }, orderBy: [{ date: "asc" }, { startMin: "asc" }], take: 60 });
    const sessions = await tx.trainingSession.findMany({ where: { date: dateWhere(range) }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    const todays = sessions.filter((x) => isoOf(x.date) === p.today);
    const fitness = await tx.fitnessRecord.findMany({ where: { date: dateWhere(range) }, orderBy: { date: "desc" }, take: 3000 });
    const fitPlaces = year ? await placesOf(tx, [...new Set(fitness.map((f) => f.studentId))], year.id) : new Map();
    const classSizes = year ? await tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, status: "STUDYING" }, _count: { _all: true } }) : [];
    const recent = await tx.fitnessRecord.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 6 });
    const recentNames = await tx.student.findMany({ where: { id: { in: recent.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    const open = g ? teams.find((t) => t.id === g) ?? null : null;
    const members = open && year ? await pickStudents(tx, year.id, await membersOf(tx, "team", open.id, year.id)) : [];
    const sheetGroup = ["members", "session", "team"].includes(doing) && pick ? teams.find((t) => t.id === pick) ?? null : null;
    const sheetMembers = sheetGroup && year && doing === "session" ? await pickStudents(tx, year.id, await membersOf(tx, "team", sheetGroup.id, year.id)) : [];
    const resultFor = doing === "result" && pick ? fixtures.find((f) => f.id === pick) ?? (await tx.fixture.findFirst({ where: { id: pick, archivedAt: null } })) : null;
    return {
      kind: "sports" as const, students, staff, teams, counts: new Map(counts.map((c) => [c.teamId, c._count._all])), coaches: new Map(coaches.map((x) => [x.id, x.fullName])),
      fixtures, sessions, todays, fitness, fitPlaces, classSizes, recent, recentNames: new Map(recentNames.map((x) => [x.id, x.fullName])), open, members, sheetGroup, sheetMembers, resultFor,
    };
  });

  const tabOptions = tabs.map((t) => ({ value: t, label: t === "ach" ? "Activities and achievements" : t === "houses" ? "Houses" : t === "clubs" ? "Clubs" : "Sports", href: qs(HREF, { t: t === "ach" ? null : t, ...vp.keep }) }));
  const credits = { take: s.creditsTakePart, win: s.creditsWin };

  return (
    <div>
      <EvHead pageName="Co-curricular & Sports" href={HREF} sub="Activities, achievements and certificates, houses, clubs and sports teams. Achievements also show on the student’s profile."
        actions={canEdit && <ButtonLink href={here({ t: null, do: "add" })} scroll={false} variant="primary" icon={Plus}><Words k="Record achievement" /></ButtonLink>} />
      <Chips label="Co-curricular sections" className="mb-5" value={tab} options={tabOptions} />

      {d.kind === "ach" && (() => {
        const rows = d.rows;
        const issued = rows.filter((a) => a.certificateNo).length;
        const given = rows.reduce((x, a) => x + Math.max(0, a.credits), 0);
        return (
          <div className="flex flex-col gap-5 lg:gap-6">
            <Stats items={[
              { label: "Achievements", value: n(rows.length), icon: Award, sub: spanWords(range.from, range.to) },
              { label: "District level or above", value: n(rows.filter((a) => a.level !== "School").length), icon: Medal, tone: "ok" },
              { label: "Certificates issued", value: n(issued), icon: FileBadge },
              s.creditsOn
                ? { label: "Activity credits given", value: n(given), icon: Star, sub: "Shown on each profile" }
                : { label: "Students", value: n(new Set(rows.map((a) => a.studentId)).size), icon: Users, sub: "With an achievement here" },
            ]} />
            <Split side={300}>
              <Card className="overflow-hidden min-w-0">
                <Toolbar>
                  <UrlSearch placeholder="Student, activity or class" id="ach-search" />
                  <PeriodFilter {...p.dates} fallback="acyear" />
                  <UrlSelect param="level" id="ach-lvl" label="Level" className="md:w-40" options={[{ value: "", label: "All levels" }, ...s.levels.map((l) => ({ value: l, label: l }))]} />
                  {p.can.export && <ExportButton href={qs(`${HREF}/export`, keep)} />}
                </Toolbar>
                {canEdit && <InlineBulkBar form="ach-bulk" actions={[
                  { label: "Issue certificates", href: here({ do: "issue" }), icon: <FileBadge size={15} aria-hidden="true" /> },
                  { label: "Print certificates", href: qs(`${HREF}/certificates`, {}), file: true, icon: <Printer size={15} aria-hidden="true" /> },
                ]} />}
                <DataList rows={rows} rowKey={(a) => a.id} minWidth={760} caption="Achievements" scroll={false}
                  select={canEdit ? { form: "ach-bulk", label: (a) => `Select ${a.student}, ${a.activity}`, allLabel: "Select every achievement shown" } : undefined}
                  footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing:" /> {vp.label} · {spanWords(range.from, range.to)} · {rows.length} <Words k="achievements" /></p>}
                  empty={<Empty icon={Award} title="No achievements in these dates" body="Pick other dates or another level." />}
                  columns={[
                    { key: "s", label: "Student", render: (a) => <div className="flex items-center gap-2.5"><Avatar name={a.student} size={32} /><div><p className="font-semibold leading-tight">{a.student}</p><p className="text-[12.5px] text-ink3">{a.place}</p></div></div> },
                    { key: "act", label: "Activity or competition", render: (a) => <div className="max-w-[240px]"><p className="leading-snug">{a.activity}</p><p className="text-[12.5px] text-ink3">{a.won ? a.position || "Won" : "Took part"} · <DayText text={longDay(isoOf(a.date)).replace(/^\w+ /, "")} /></p></div> },
                    { key: "level", label: "Level", render: (a) => <Pill tone={LEVEL_TONE[a.level] ?? "neutral"}>{a.level}</Pill> },
                    ...(s.creditsOn ? [{ key: "cr", label: "Credits", align: "right" as const, render: (a: (typeof rows)[number]) => <span className="tnum">{a.credits ? `+${a.credits}` : "—"}</span> }] : []),
                    { key: "cert", label: "Certificate", render: (a) => (
                      <div className="flex flex-col items-start gap-0.5">
                        {a.certificateNo ? <span className="flex items-center gap-1"><Pill tone="ok" dot><Words k="Issued" /></Pill><a href={qs(`${HREF}/certificates`, { ids: a.id })} target="_blank" rel="noopener" className="relative z-[1] text-[12.5px] font-semibold text-brand px-1 h-7 inline-flex items-center gap-1"><Printer size={14} aria-hidden="true" /><Words k="Print" /></a></span>
                          : canEdit ? <ActButton action={certificatesAction} fields={{ achievementIds: a.id }} label="Issue" icon="FileBadge" variant="soft" /> : <span className="text-ink3 text-[13px]"><Words k="Not yet" /></span>}
                        {canEdit && <Link href={here({ do: "archive", id: a.id })} scroll={false} className="relative z-[1] text-[12.5px] text-ink3 hover:text-bad px-1 h-6 inline-flex items-center"><Words k="Take off" /></Link>}
                      </div>
                    ) },
                  ]}
                  mobile={(a) => ({ title: `${a.student} · ${a.won ? a.position || "Won" : "Took part"}`, sub: `${a.activity} · ${shortDay(isoOf(a.date))}`, avatar: a.student,
                    pills: [<Pill key="l" tone={LEVEL_TONE[a.level] ?? "neutral"} className={cardPill}>{a.level}</Pill>, <Pill key="c" tone={a.certificateNo ? "ok" : "neutral"} className={cardPill}>{a.certificateNo ? "Certificate issued" : "No certificate yet"}</Pill>] })} />
              </Card>
              <Col>
                <Card>
                  <CardHeader title="Taking part this year" description="Students in each activity" icon={Users} />
                  <div className="px-5 pb-5">
                    {d.taking.length ? <HBars rows={d.taking} max={Math.max(...d.taking.map((x) => x.v))} unit="" labelWidth={86} /> : <p className="text-[13.5px] text-ink3"><Words k="Nothing recorded this year yet." /></p>}
                  </div>
                </Card>
                {s.creditsOn && (
                  <Card>
                    <CardHeader title="Activity credits" description="Added with each achievement, by level" icon={Star} action={canEdit && <ButtonLink size="sm" variant="ghost" href={here({ do: "credit" })} scroll={false}><Words k="Correct" /></ButtonLink>} />
                    <ul className="px-5 pb-5 flex flex-col gap-1.5 text-[13.5px]">
                      {s.levels.map((l) => <li key={l} className="flex justify-between"><span className="text-ink2">{l}</span><span className="tnum text-ink3">+{creditsFor(s, l, false)} <Words k="taking part ·" /> <b className="font-semibold text-ink">+{creditsFor(s, l, true)}</b> <Words k="winning" /></span></li>)}
                    </ul>
                  </Card>
                )}
              </Col>
            </Split>
            {doing === "add" && year && (
              <AchievementSheet closeHref={here({ do: null })} students={d.students} kinds={s.activityKinds} levels={s.levels} credits={credits} creditsOn={s.creditsOn} today={p.today}
                teams={d.teamsAll.map((t) => ({ value: t.id, label: t.name }))} events={d.events.map((e) => ({ value: e.id, label: e.name }))} />
            )}
            {doing === "issue" && d.issue.length > 0 && <IssueSheet closeHref={here({ do: null, ids: null })} ids={d.issue.filter((a) => !a.certificateNo).map((a) => a.id)} names={d.issue.filter((a) => !a.certificateNo).map((a) => `${a.student} · ${a.activity}`)} />}
            {doing === "archive" && d.archive && <ArchiveAchievementSheet closeHref={here({ do: null, id: null })} achievementId={d.archive.id} what={`${d.archive.student} · ${d.archive.activity}`} credits={d.archive.credits} />}
            {doing === "credit" && s.creditsOn && <CreditSheet closeHref={here({ do: null })} students={d.students} />}
          </div>
        );
      })()}

      {d.kind === "houses" && (
        <div className="flex flex-col gap-5 lg:gap-6">
          {d.board.length ? (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {d.board.map((h, i) => (
                  <Card key={h.id} className="p-4 relative overflow-hidden">
                    <span className={cx("absolute left-0 top-0 bottom-0 w-1.5", HOUSE_BG[h.colour])} aria-hidden="true" />
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[14.5px] truncate">{h.name}</p><span className={cx("text-[12px] font-bold tnum px-2 h-6 rounded-full grid place-items-center", i === 0 ? "bg-brand text-brandink" : "bg-sunken text-ink2")}>#{i + 1}</span></div>
                    <p className="font-display text-[26px] font-semibold tnum leading-tight mt-1">{n(h.points)}</p>
                    <p className="text-[12.5px] text-ink3 truncate">{h.students} <Words k="students" />{h.captain ? ` · Captain ${h.captain}` : ""}</p>
                  </Card>
                ))}
              </div>
              <Split side={340}>
                <Card className="min-w-0">
                  <CardHeader title="House points" description="Every change needs a reason and is kept" icon={BarChart3}
                    action={canEdit && <div className="flex gap-2 flex-wrap justify-end"><ButtonLink size="sm" variant="ghost" icon={UserPlus} href={here({ do: "points-assign" })} scroll={false}><Words k="Assign students" /></ButtonLink><ButtonLink size="sm" variant="soft" icon={Plus} href={here({ do: "points" })} scroll={false}><Words k="Add or remove points" /></ButtonLink></div>} />
                  <ul className="px-5 pb-5 flex flex-col gap-3">
                    {d.board.map((h) => {
                      const top = Math.max(1, ...d.board.map((x) => x.points));
                      return (
                        <li key={h.id} className="grid grid-cols-[minmax(0,110px)_1fr_52px] items-center gap-3 text-[13.5px]">
                          <span className="font-semibold truncate">{h.name.replace(/ House$/, "")}</span>
                          <span className="h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true"><span className={cx("block h-full rounded-full", HOUSE_BG[h.colour])} style={{ width: `${Math.max(0, (h.points / top) * 92)}%` }} /></span>
                          <span className="text-right font-semibold tnum">{n(h.points)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {d.without > 0 && <p className="px-5 pb-5 -mt-2 text-[13px] text-warn">{n(d.without)} <Words k="students have no house this year." /></p>}
                </Card>
                <Card className="min-w-0">
                  <CardHeader title="Latest changes" icon={History} />
                  <div className="px-5 pb-2"><PeriodFilter {...p.dates} fallback="acyear" /></div>
                  <ul className="px-2 pb-2">
                    {d.log.map((l) => {
                      const h = d.board.find((x) => x.id === l.houseId);
                      return <Row key={l.id} icon={l.points > 0 ? TrendingUp : TrendingDown} iconTone={l.points > 0 ? "ok" : "bad"} title={`${l.points > 0 ? "+" : "−"}${Math.abs(l.points)} ${(h?.name ?? "House").replace(/ House$/, "")}`} sub={`${l.reason} · ${d.givers.get(l.givenById ?? "") ?? "Staff"} · ${shortDay(isoOf(l.date)).replace(/^\w+ /, "")}`} />;
                    })}
                    {!d.log.length && <li className="px-3 py-3 text-[13.5px] text-ink3"><Words k="No changes in these dates." /></li>}
                  </ul>
                </Card>
              </Split>
            </>
          ) : (
            <Card><Empty icon={Flag} title="No houses yet" body="Add the houses, with their colours and captains, in Events Settings." action={p.can.settings ? <ButtonLink variant="secondary" href={`${BASE}/settings`}><Words k="Open Events Settings" /></ButtonLink> : undefined} /></Card>
          )}
          {doing === "points" && d.board.length > 0 && <PointsSheet closeHref={here({ do: null })} houses={d.board.map((h) => ({ value: h.id, label: h.name }))} />}
          {doing === "points-assign" && d.board.length > 0 && <AssignHousesSheet closeHref={here({ do: null })} houses={d.board.map((h) => ({ value: h.id, label: h.name }))} students={d.students} without={d.without} />}
        </div>
      )}

      {d.kind === "clubs" && (
        <div className="flex flex-col gap-5 lg:gap-6">
          {canEdit && <div className="flex justify-end -mt-2"><ButtonLink size="sm" variant="secondary" icon={Plus} href={here({ do: "club", id: null })} scroll={false}><Words k="New club" /></ButtonLink></div>}
          {d.clubs.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {d.clubs.map((c) => (
                <Card key={c.id} className={cx("p-4 flex flex-col gap-3", g === c.id && "ring-2 ring-brand/40")}>
                  <Link href={here({ g: g === c.id ? null : c.id })} scroll={false} className="flex items-center gap-3 group">
                    <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><EvIcon name={clubIcon(c.name)} size={20} /></span>
                    <span className="min-w-0"><span className="block font-semibold text-[15px] group-hover:text-brand">{c.name}</span><span className="block text-[12.5px] text-ink3">{c.inChargeId ? `In-charge ${d.inCharge.get(c.inChargeId) ?? ""}` : "No in-charge yet"}</span></span>
                  </Link>
                  <p className="text-[13.5px] text-ink2 flex items-center gap-4 flex-wrap"><span className="flex items-center gap-1.5"><Users size={15} className="text-ink3" aria-hidden="true" /><b className="font-semibold tnum">{d.counts.get(c.id) ?? 0}</b> <Words k="members" /></span>{c.meets && <span className="flex items-center gap-1.5"><Clock size={15} className="text-ink3" aria-hidden="true" />{c.meets}</span>}</p>
                  {canEdit && <div className="flex gap-2 flex-wrap"><ButtonLink size="sm" variant="secondary" icon={UserPlus} href={here({ do: "members", id: c.id })} scroll={false}><Words k="Add members" /></ButtonLink><ButtonLink size="sm" variant="ghost" href={here({ do: "session", id: c.id })} scroll={false}><Words k="Record meeting" /></ButtonLink></div>}
                </Card>
              ))}
            </div>
          ) : <Card><Empty icon={Users} title="No clubs yet" body="Add a club with its in-charge and meeting time." action={canEdit ? <ButtonLink variant="secondary" icon={Plus} href={here({ do: "club" })} scroll={false}><Words k="New club" /></ButtonLink> : undefined} /></Card>}
          {d.open && <GroupMembers kind="club" id={d.open.id} name={d.open.name} members={d.members} canEdit={canEdit} closeHref={here({ g: null })} editHref={here({ do: "club", id: d.open.id })} />}
          <Card className="overflow-hidden">
            <CardHeader title="Meetings" description="Who came to each meeting" icon={CalendarDays} />
            <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback="acyear" /></div>
            <DataList rows={d.meetings} rowKey={(m) => m.id} minWidth={560} caption="Club meetings" scroll={false}
              footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing:" /> {vp.label} · {spanWords(range.from, range.to)} · {d.meetings.length} <Words k="meetings" /></p>}
              empty={<Empty icon={CalendarDays} title="No meetings in these dates" body="Pick other dates." />}
              columns={[
                { key: "c", label: "Club", render: (m) => <span className="font-semibold">{d.clubs.find((c) => c.id === m.clubId)?.name}</span> },
                { key: "d", label: "Date", nowrap: true, render: (m) => <span className="tnum text-[13px]"><DayText text={longDay(isoOf(m.date))} /></span> },
                { key: "t", label: "Topic", render: (m) => <span className="text-[13px] text-ink2">{m.topic ?? "—"}</span> },
                { key: "p", label: "Present", align: "right", render: (m) => <span className="tnum">{m.presentIds.length} <Words k="of" /> {m.memberIds.length}</span> },
              ]}
              mobile={(m) => ({ title: d.clubs.find((c) => c.id === m.clubId)?.name ?? "Club", sub: `${shortDay(isoOf(m.date))}${m.topic ? ` · ${m.topic}` : ""}`, icon: CalendarDays, right: <span className="tnum text-[13px]">{m.presentIds.length}/{m.memberIds.length}</span> })} />
          </Card>
          {doing === "club" && <ClubSheet closeHref={here({ do: null, id: null })} staff={d.staff} club={d.sheetGroup ?? undefined} />}
          {doing === "members" && d.sheetGroup && <MembersSheet closeHref={here({ do: null, id: null })} kind="club" groupId={d.sheetGroup.id} name={d.sheetGroup.name} students={d.students} members={d.counts.get(d.sheetGroup.id) ?? 0} />}
          {doing === "session" && d.sheetGroup && <SessionSheet closeHref={here({ do: null, id: null })} kind="club" groupId={d.sheetGroup.id} name={d.sheetGroup.name} members={d.sheetMembers} today={p.today} />}
        </div>
      )}

      {d.kind === "sports" && (() => {
        const avg = d.sessions.length ? Math.round((d.sessions.reduce((x, t) => x + (t.memberIds.length ? t.presentIds.length / t.memberIds.length : 0), 0) / d.sessions.length) * 100) : null;
        const missing = d.teams.reduce((x, t) => x + missedInARow(d.sessions.filter((z) => z.teamId === t.id)).length, 0);
        const byClass = new Map<string, { label: string; sort: number; tested: Set<string>; size: number }>();
        for (const f of d.fitness) {
          const pl = d.fitPlaces.get(f.studentId);
          if (!pl) continue;
          const row = byClass.get(pl.classId) ?? { label: pl.className, sort: pl.classSort, tested: new Set<string>(), size: d.classSizes.find((c) => c.classId === pl.classId)?._count._all ?? 0 };
          row.tested.add(f.studentId);
          byClass.set(pl.classId, row);
        }
        const fitRows = [...byClass.values()].sort((a, b) => a.sort - b.sort).map((r) => ({ k: r.label.replace(/^Class /, "Class "), v: r.size ? Math.round((r.tested.size / r.size) * 100) : 0 }));
        const today = d.todays[0];
        const todayTeam = today ? d.teams.find((t) => t.id === today.teamId) : null;
        return (
          <div className="flex flex-col gap-5 lg:gap-6">
            {canEdit && <div className="flex justify-end -mt-2"><ButtonLink size="sm" variant="secondary" icon={Plus} href={here({ do: "team", id: null })} scroll={false}><Words k="New team" /></ButtonLink></div>}
            {d.teams.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {d.teams.map((t) => (
                  <Card key={t.id} className={cx("p-4 flex flex-col", g === t.id && "ring-2 ring-brand/40")}>
                    <Link href={here({ g: g === t.id ? null : t.id })} scroll={false} className="group">
                      <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center"><EvIcon name={teamIcon(t.sport)} size={19} /></span>
                      <span className="block font-semibold text-[14.5px] mt-2.5 group-hover:text-brand">{t.name}</span>
                      <span className="block text-[12.5px] text-ink3">{d.counts.get(t.id) ?? 0} <Words k="players · coach" /> {t.coachId ? d.coaches.get(t.coachId) ?? "" : `${t.coachName ?? ""} (visiting coach)`}</span>
                    </Link>
                    {canEdit && <div className="flex gap-2 flex-wrap mt-3"><ButtonLink size="sm" variant="secondary" icon={UserPlus} href={here({ do: "members", id: t.id })} scroll={false}><Words k="Add players" /></ButtonLink><ButtonLink size="sm" variant="ghost" href={here({ do: "session", id: t.id })} scroll={false}><Words k="Mark attendance" /></ButtonLink></div>}
                  </Card>
                ))}
              </div>
            ) : <Card><Empty icon={Trophy} title="No sports teams yet" body="Add a team with its sport and coach." action={canEdit ? <ButtonLink variant="secondary" icon={Plus} href={here({ do: "team" })} scroll={false}><Words k="New team" /></ButtonLink> : undefined} /></Card>}
            {d.open && <GroupMembers kind="team" id={d.open.id} name={d.open.name} members={d.members} canEdit={canEdit} closeHref={here({ g: null })} editHref={here({ do: "team", id: d.open.id })} />}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
              <Card>
                <CardHeader title="Fixtures and results" icon={Trophy} action={canEdit && <ButtonLink size="sm" variant="soft" icon={Plus} href={here({ do: "fixture" })} scroll={false}><Words k="Add fixture" /></ButtonLink>} />
                <div className="px-5 pb-2"><PeriodFilter {...p.dates} fallback="acyear" ahead /></div>
                <ul className="px-2 pb-2">
                  {d.fixtures.map((f) => {
                    const r = FIXTURE_RESULTS.find((x) => x.value === f.result);
                    const tone = f.result === "WON" || f.result === "PLACED" ? "ok" : f.result === "LOST" ? "bad" : "neutral";
                    const when = `${shortDay(isoOf(f.date))}${f.startMin != null ? ` · ${clock(f.startMin)}` : ""}`;
                    const sub = f.result ? `${f.score ? f.score : r?.label} · ${shortDay(isoOf(f.date)).replace(/^\w+ /, "")}` : `${when} · ${(GROUNDS.find((x) => x.value === f.ground)?.label ?? "").toLowerCase()}${f.venue ? ` · ${f.venue}` : ""}`;
                    const due = !f.result && isoOf(f.date) <= p.today;
                    return <Row key={f.id} icon={f.result ? (tone === "ok" ? Trophy : Flag) : CalendarDays} iconTone={tone} title={f.title} sub={sub}
                      right={canEdit && due ? <ButtonLink size="sm" variant="soft" href={here({ do: "result", id: f.id })} scroll={false}><Words k="Record result" /></ButtonLink> : undefined} />;
                  })}
                  {!d.fixtures.length && <li className="px-3 py-3 text-[13.5px] text-ink3"><Words k="No fixtures in these dates." /></li>}
                </ul>
              </Card>
              <Col>
                <Card>
                  <CardHeader title={today ? "Training today" : "Training"} description={today && todayTeam ? `${todayTeam.sport}${today.startMin != null ? `, ${clock(today.startMin)}` : ""}${today.venue ? ` · ${today.venue}` : ""}` : `${vp.label} · ${d.sessions.length} sessions`} icon={Timer}
                    action={canEdit && d.teams.length > 0 && <ButtonLink size="sm" variant="secondary" href={here({ do: "session", id: (todayTeam ?? d.teams[0]).id })} scroll={false}><Words k="Mark attendance" /></ButtonLink>} />
                  <div className="px-5 pb-5 flex items-center gap-4">
                    <Ring value={avg ?? 0} size={64} stroke={7} tone={avg != null && avg < 75 ? "warn" : "ok"}><span className="text-[13px] font-bold tnum">{avg != null ? `${avg}%` : "—"}</span></Ring>
                    <p className="text-[13.5px] text-ink2">{avg != null ? `Average training attendance in these dates.${missing ? ` ${missing} ${missing === 1 ? "player has" : "players have"} missed 3 sessions in a row.` : ""}` : "No training recorded in these dates."}</p>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Fitness records" description="BMI, 600 m run, sit-and-reach" icon={HeartPulse} action={canEdit && <ButtonLink size="sm" variant="ghost" icon={Plus} href={here({ do: "fitness" })} scroll={false}><Words k="Record test" /></ButtonLink>} />
                  <div className="px-5 pb-5">
                    {fitRows.length ? <><HBars rows={fitRows} lowBelow={85} labelWidth={64} /><p className="text-[12.5px] text-ink3 mt-3"><Words k="Tests done in these dates, by class" /></p></> : <p className="text-[13.5px] text-ink3"><Words k="No fitness tests in these dates." /></p>}
                    {d.recent.length > 0 && (
                      <ul className="mt-4 flex flex-col divide-y divide-line/60 text-[13px]">
                        {d.recent.map((r) => <li key={r.id} className="py-2 flex justify-between gap-3"><span className="truncate"><b className="font-semibold">{d.recentNames.get(r.studentId)}</b><span className="text-ink3"> · {shortDay(isoOf(r.date)).replace(/^\w+ /, "")}</span></span><span className="tnum text-ink2 shrink-0"><Words k="BMI" /> {bmi(r.heightCm, r.weightKg) ?? "—"} · {runWords(r.runSeconds)} · {r.reachCm ?? "—"} <Words k="cm" /></span></li>)}
                      </ul>
                    )}
                  </div>
                </Card>
              </Col>
            </div>
            {doing === "team" && <TeamSheet closeHref={here({ do: null, id: null })} staff={d.staff} team={d.sheetGroup ?? undefined} />}
            {doing === "members" && d.sheetGroup && <MembersSheet closeHref={here({ do: null, id: null })} kind="team" groupId={d.sheetGroup.id} name={d.sheetGroup.name} students={d.students} members={d.counts.get(d.sheetGroup.id) ?? 0} />}
            {doing === "session" && d.sheetGroup && <SessionSheet closeHref={here({ do: null, id: null })} kind="team" groupId={d.sheetGroup.id} name={d.sheetGroup.name} members={d.sheetMembers} today={p.today} />}
            {doing === "fixture" && <FixtureSheet closeHref={here({ do: null })} teams={d.teams.map((t) => ({ value: t.id, label: t.name }))} today={p.today} />}
            {doing === "result" && d.resultFor && <ResultSheet closeHref={here({ do: null, id: null })} fixtureId={d.resultFor.id} title={d.resultFor.title} />}
            {doing === "fitness" && <FitnessSheet closeHref={here({ do: null })} students={d.students} today={p.today} />}
          </div>
        );
      })()}
    </div>
  );
}

/** The members of one club or team, with Take off for those who may change it. */
function GroupMembers({ kind, id, name, members, canEdit, closeHref, editHref }: { kind: "club" | "team"; id: string; name: string; members: { id: string; name: string; place: string }[]; canEdit: boolean; closeHref: string; editHref: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`${kind === "club" ? "Members" : "Players"} of ${name}`} description={`${members.length} this year`} icon={Users}
        action={<div className="flex gap-2">{canEdit && <ButtonLink size="sm" variant="ghost" href={editHref} scroll={false}><Words k="Change" /></ButtonLink>}{canEdit && <ActButton action={archiveGroupAction} fields={{ kind, groupId: id }} label="Archive" variant="ghost" />}<ButtonLink size="sm" variant="ghost" href={closeHref} scroll={false}><Words k="Close" /></ButtonLink></div>} />
      <DataList rows={members} rowKey={(m) => m.id} minWidth={480} caption={`Members of ${name}`} scroll={false}
        empty={<Empty icon={Users} title="No members yet" body={kind === "club" ? "Add members by class." : "Add players by class."} />}
        columns={[
          { key: "n", label: "Student", render: (m) => <div className="flex items-center gap-2.5"><Avatar name={m.name} size={30} /><span className="font-semibold">{m.name}</span></div> },
          { key: "c", label: "Class", render: (m) => <span className="text-[13px] text-ink2">{m.place}</span> },
          ...(canEdit ? [{ key: "x", label: "", align: "right" as const, render: (m: { id: string }) => <ActButton action={removeMemberAction} fields={{ kind, groupId: id, studentId: m.id }} label="Take off" variant="ghost" /> }] : []),
        ]}
        mobile={(m) => ({ title: m.name, sub: m.place, avatar: m.name, right: canEdit ? <ActButton action={removeMemberAction} fields={{ kind, groupId: id, studentId: m.id }} label="Take off" variant="ghost" /> : undefined })} />
    </Card>
  );
}
