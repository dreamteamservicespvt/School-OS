import { Bell, CalendarClock, CalendarPlus, Check, CirclePlay, ClipboardCheck, Paperclip, Video } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { rangeWords } from "@/lib/periods";
import { JOIN_OPENS_MIN, listSessions, materialKey, REMIND_BEFORE_MIN, type Material, type SessionRow } from "@/lib/homework/online";
import { sectionStudents } from "@/lib/homework/homework";
import { mayWork, workSections, workSubjects } from "@/lib/homework/scope";
import { momentWords, OC_TONE, plural } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { ActionButton } from "@/components/students/confirm-action";
import { Banner, DataList, DL, Empty, Stack } from "@/components/money/kit";
import { UrlSegmented } from "@/components/money/url-filters";
import { HomeworkHead } from "../_components/homework-head";
import { FileRow, SubIcon } from "../_components/bits";
import { BASE, homeworkGuard, homeworkPeriod, localInput, one, qs, UUID, type HomeworkPage, type SearchParams } from "../_lib/page";
import { remindMeAction, removeMaterialAction, removeRecordingAction } from "./actions";
import { ConfirmButton } from "@/components/ui/confirm";
import { AttendanceSheet, CancelSheet, CopyLink, MaterialSheet, RecordingBox, ScheduleSheet, type OcSection } from "./sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Online Classes") };
}

const HREF = `${BASE}/online-classes`;
type Sp = Record<string, string | string[] | undefined>;

const upcoming = (x: SessionRow) => x.word === "Scheduled" || x.word === "Live";
const repeatWords = (x: SessionRow) => (x.seriesId ? " · repeats weekly" : "");

/** Online Classes (17 §2): the schedule with meeting links, who joined, materials and recordings. */
export default async function OnlineClassesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("online-classes");
  const sp = await searchParams;
  if (p.student) return <StudentOnline p={p} sp={sp} />;
  return <StaffOnline p={p} sp={sp} />;
}

async function StaffOnline({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "acyear");
  const tab = one(sp.tab) === "past" ? "past" : "upcoming";
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const doing = one(sp.do);
  const editsHere = p.edits("online-classes");
  const keep = { ...per.keep, tab: tab === "upcoming" ? null : tab };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });

  const data = await withSchool(p.current.ctx, async (tx) => {
    const list = await listSessions(tx, s, p.now, { from: per.from, to: per.to });
    const open = openId ? await tx.onlineClassSession.findFirst({ where: { id: openId, archivedAt: null }, include: { attendance: true } }) : null;
    const openRow = open ? list.find((x) => x.id === open.id) ?? (await listSessions(tx, s, p.now, {})).find((x) => x.id === open.id) ?? null : null;
    const roster = open && openRow && (openRow.word === "Done" || openRow.word === "Live") ? await sectionStudents(tx, open.academicYearId, open.sectionId) : [];
    const sections: OcSection[] = [];
    if (editsHere && doing === "schedule") {
      for (const sec of await workSections(tx, s, "online-classes")) {
        const subjects = await workSubjects(tx, s, sec.id, sec.classId, p.today);
        if (subjects.length) sections.push({ id: sec.id, label: sec.label, subjects });
      }
    }
    return { list, open: openRow ? open : null, openRow, roster, sections };
  });

  const rows = data.list.filter((x) => (tab === "upcoming" ? upcoming(x) : !upcoming(x)));
  if (tab === "past") rows.reverse();
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const x = data.openRow;
  const o = data.open;
  const canWork = !!o && editsHere && mayWork(s, o, "online-classes");
  const materials = (o && Array.isArray(o.materials) ? o.materials : []) as Material[];
  const joined = new Map((o?.attendance ?? []).map((a) => [a.studentId, a.joined]));
  const schoolId = p.current.ctx.schoolId;

  return (
    <div>
      <HomeworkHead page="online-classes" pageName="Online Classes" sub={p.own ? "Your online classes · links, who joined and recordings" : "Online class schedule, attendance and recordings"}
        actions={<ButtonLink href={here({ do: "schedule" })} scroll={false} variant="primary" icon={CalendarPlus}><Words k="Schedule a class" /></ButtonLink>} />
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-line flex flex-col md:flex-row md:items-center gap-2.5">
          <UrlSegmented param="tab" fallback="upcoming" label="Which classes" options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />
          <PeriodFilter {...p.dates} fallback="acyear" ahead className="w-full md:w-auto" />
          <span className="flex-1" />
          <ExportButton href={qs(`${HREF}/export`, keep)} />
        </div>
        <DataList rows={rows} rowKey={(r) => r.id} rowHref={(r) => here({ open: r.id })} minWidth={760} caption="Online classes"
          footer={`Showing: ${per.label}${range ? ` · ${range}` : ""} · ${plural(rows.length, "online class", "online classes")}`}
          empty={<Empty icon={Video} title="No online classes here" body="Nothing in these dates. Pick other dates, or schedule one for doubt-clearing or the holidays."
            action={editsHere ? <ButtonLink href={here({ do: "schedule" })} scroll={false} variant="primary" icon={CalendarPlus}><Words k="Schedule a class" /></ButtonLink> : undefined} />}
          columns={[
            { key: "t", label: "Class", render: (r) => <div className="flex items-center gap-3"><SubIcon subject={r.subject} size={34} /><div><p className="font-semibold leading-tight">{r.title}</p><p className="text-[12.5px] text-ink3">{r.subject} · {r.sectionLabel}{!p.own && r.teacher ? ` · ${r.teacher}` : ""}</p></div></div> },
            { key: "w", label: "Date and time", nowrap: true, render: (r) => <span className="tnum">{momentWords(r.startsAt, p.tz)}<span className="block text-[12.5px] text-ink3">{r.lengthMin} <Words k="min" />{repeatWords(r)}</span></span> },
            { key: "a", label: "Joined", render: (r) => (r.joined !== null ? <span className="tnum">{r.joined} <Words k="of" /> {r.of}</span> : <span className="text-ink3">—</span>) },
            { key: "s", label: "Status", render: (r) => <Pill tone={OC_TONE[r.word]}>{r.word}</Pill> },
          ]}
          phone={(r) => ({ icon: Video, iconTone: OC_TONE[r.word], title: r.title, sub: `${r.sectionLabel} · ${momentWords(r.startsAt, p.tz)}`, pills: <Pill tone={OC_TONE[r.word]} className="!h-[22px] !text-[11.5px]">{r.word}</Pill> })} />
      </Card>

      {x && o && !doing && (
        <UrlSheet wide closeHref={here({ open: null })} title={x.title} sub={`${x.subject} · ${x.sectionLabel}${x.teacher ? ` · ${x.teacher}` : ""} · ${momentWords(x.startsAt, p.tz)} · ${x.lengthMin} min`}
          footer={<div className="flex flex-wrap justify-end gap-2">
            {canWork && upcoming(x) && x.word !== "Live" && <ButtonLink href={here({ do: "cancel", open: x.id })} scroll={false} variant="ghost"><Words k="Cancel class" /></ButtonLink>}
            {canWork && (x.word === "Done" || x.word === "Live") && <ButtonLink href={here({ do: "attendance", open: x.id })} scroll={false} icon={ClipboardCheck}><Words k="Who joined" /></ButtonLink>}
            {upcoming(x) && <a href={x.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold bg-brand text-brandink shadow-sm hover:brightness-110"><Video size={16} aria-hidden="true" />{x.word === "Live" ? "Join" : "Start"}</a>}
          </div>}>
          {upcoming(x) && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-line p-3.5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-info/10 text-info grid place-items-center" aria-hidden="true"><Video size={19} /></span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]"><Words k="Meeting link" /></p><p className="text-[13px] text-ink3 font-mono truncate">{x.meetingLink.replace(/^https?:\/\//, "")}</p></div>
                <CopyLink link={x.meetingLink} />
              </div>
              <DL rows={[
                ["Reminder", `${REMIND_BEFORE_MIN} minutes before, to the students and you`],
                ["Join opens", `${JOIN_OPENS_MIN} minutes before the start`],
                ["Materials", materials.length ? materials.map((m) => m.name).join(", ") : "None shared yet"],
                ["Repeat", x.seriesId ? "Every week" : "No"],
              ]} />
              {canWork && <ButtonLink href={here({ do: "material", open: x.id })} scroll={false} size="sm" variant="soft" icon={Paperclip} className="self-start"><Words k="Share a material" /></ButtonLink>}
            </div>
          )}
          {x.word === "Cancelled" && <Banner tone="warn" title="Cancelled.">{x.cancelNote}</Banner>}
          {x.word === "Done" && (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-2">{x.joined !== null ? `Who joined · ${x.joined} of ${x.of}` : "Who joined · not marked yet"}</p>
                <ul className="max-h-[300px] overflow-y-auto scroll-thin divide-y divide-line/70">
                  {data.roster.map((st) => (
                    <li key={st.id} className="flex items-center gap-3 py-2"><Avatar name={st.name} size={28} /><span className="flex-1 text-[14px] truncate">{st.name}</span>
                      {joined.get(st.id) ? <span className="text-[12px] text-ok font-semibold"><Words k="Joined" /></span> : joined.has(st.id) ? <Pill tone="warn"><Words k="Did not join" /></Pill> : <span className="text-[12px] text-ink3">—</span>}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-ink2"><Words k="Recording and materials" /></p>
                <ul>
                  {o.recordingLinks.map((u, i) => <FileRow key={u} kind="link" name={`Recording${o.recordingLinks.length > 1 ? ` ${i + 1}` : ""}`} meta={u.replace(/^https?:\/\//, "").split("/")[0]} href={u}
                    remove={canWork ? <ConfirmButton trigger="Remove" triggerVariant="ghost" title="Remove this recording link?" confirmLabel="Remove link" confirmVariant="danger" onConfirm={removeRecordingAction.bind(null, o.id, u)}><Words k="Students will no longer see it in Online Classes." /></ConfirmButton> : undefined} />)}
                  {materials.map((m) => <FileRow key={m.name + (m.url ?? m.fileId)} kind={m.url ? "link" : "file"} name={m.name} meta="Shared in the class" href={m.url ?? (m.fileId ? fileLink(m.fileId, schoolId) : null)}
                    remove={canWork ? <ConfirmButton trigger="Remove" triggerVariant="ghost" title={`Remove ${m.name}?`} confirmLabel="Remove material" confirmVariant="danger" onConfirm={removeMaterialAction.bind(null, o.id, materialKey(m))}><Words k="Students will no longer see it in this class." /></ConfirmButton> : undefined} />)}
                  {!o.recordingLinks.length && !materials.length && <li className="text-[13.5px] text-ink3 px-2"><Words k="Nothing yet." /></li>}
                </ul>
                {canWork && <RecordingBox id={o.id} />}
                {canWork && <ButtonLink href={here({ do: "material", open: x.id })} scroll={false} size="sm" variant="soft" icon={Paperclip} className="self-start"><Words k="Share a material" /></ButtonLink>}
              </div>
            </div>
          )}
        </UrlSheet>
      )}
      {editsHere && doing === "schedule" && (data.sections.length
        ? <ScheduleSheet closeHref={here({ do: null })} sections={data.sections} start={localInput(new Date(Math.ceil((p.now.getTime() + 3600_000) / 1800_000) * 1800_000), p.tz)} />
        : <UrlSheet closeHref={here({ do: null })} title="No classes to schedule for"><p className="text-[14px] text-ink2"><Words k="Online classes go to your own classes and subjects. Ask the school office to add your teaching allocations for this year." /></p></UrlSheet>)}
      {canWork && x && doing === "cancel" && <CancelSheet closeHref={here({ do: null })} id={x.id} title={x.title} />}
      {canWork && x && doing === "material" && <MaterialSheet closeHref={here({ do: null })} id={x.id} title={x.title} />}
      {canWork && x && doing === "attendance" && <AttendanceSheet closeHref={here({ do: null })} id={x.id} title={x.title} roster={data.roster.map((st) => ({ id: st.id, name: st.name, joined: !!joined.get(st.id) }))} />}
    </div>
  );
}

async function StudentOnline({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "acyear");
  const data = await withSchool(p.current.ctx, async (tx) => {
    const list = await listSessions(tx, s, p.now, { from: per.from, to: per.to });
    const done = list.filter((x) => x.word === "Done");
    const [att, recs] = s.student ? await Promise.all([
      tx.onlineClassAttendance.findMany({ where: { studentId: s.student.id, sessionId: { in: done.map((x) => x.id) } } }),
      tx.onlineClassSession.findMany({ where: { id: { in: done.map((x) => x.id) } }, select: { id: true, recordingLinks: true } }),
    ]) : [[], []];
    return { list, att: new Map(att.map((a) => [a.sessionId, a.joined])), recs: new Map(recs.map((r) => [r.id, r.recordingLinks])) };
  });
  const up = data.list.filter(upcoming);
  const past = data.list.filter((x) => x.word === "Done" && (data.recs.get(x.id)?.length ?? 0) > 0).reverse();
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const label = (s.student?.label ?? "").replace(/^Class\s+/i, "");
  const joinOpen = (x: SessionRow) => x.word === "Live" || x.startsAt.getTime() - p.now.getTime() <= JOIN_OPENS_MIN * 60_000;

  return (
    <div>
      <HomeworkHead page="online-classes" pageName="Online Classes" sub={`Class ${label} · online classes from your teachers`} />
      <Stack>
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          <PeriodFilter {...p.dates} fallback="acyear" ahead className="w-full md:w-auto" />
          <p className="text-[12.5px] text-ink3 tnum">{range} · {up.length} <Words k="coming up ·" /> {plural(past.length, "recording")}</p>
        </div>
        <Card>
          <CardHeader title="Coming up" description={`Join opens ${JOIN_OPENS_MIN} minutes before the start`} icon={CalendarClock} />
          {!up.length && <Empty icon={Video} title="No online classes coming up in these dates" body="Pick other dates." />}
          <ul className="px-2 pb-2">
            {up.map((x) => (
              <li key={x.id} className="flex flex-col md:flex-row md:items-center gap-3 px-3 py-3 rounded-xl">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SubIcon subject={x.subject} />
                  <div className="min-w-0"><p className="font-semibold text-[14.5px]">{x.title}{x.word === "Live" && <Pill tone="bad" className="ml-2 !h-5 !text-[11px]"><Words k="Live" /></Pill>}</p><p className="text-[12.5px] text-ink3">{x.teacher ? `${x.teacher} · ` : ""}{momentWords(x.startsAt, p.tz)} · {x.lengthMin} <Words k="min" /></p></div>
                </div>
                <div className="flex gap-2">
                  {x.word !== "Live" && (x.reminded
                    ? <span className="h-8 px-3 rounded-lg bg-brand/10 text-brand text-[13px] font-semibold inline-flex items-center gap-1.5"><Check size={15} aria-hidden="true" /><Words k="Reminder set" /></span>
                    : <ActionButton action={remindMeAction} fields={{ id: x.id }}><Bell size={15} aria-hidden="true" /><Words k="Remind me" /></ActionButton>)}
                  {joinOpen(x)
                    ? <a href={x.meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold bg-brand text-brandink hover:brightness-110"><Video size={15} aria-hidden="true" /><Words k="Join" /></a>
                    : <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold bg-sunken text-ink3" title={`Opens ${JOIN_OPENS_MIN} minutes before the start`}><Video size={15} aria-hidden="true" /><Words k="Join opens" /> {JOIN_OPENS_MIN} <Words k="min before" /></span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recordings" description="Watch a class again" icon={CirclePlay} />
          {!past.length && <Empty icon={CirclePlay} title="No recordings in these dates" body="Pick other dates." />}
          <ul className="px-2 pb-2">
            {past.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                <SubIcon subject={x.subject} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{x.title}</p><p className="text-[12.5px] text-ink3">{x.teacher ? `${x.teacher} · ` : ""}{momentWords(x.startsAt, p.tz)}{data.att.get(x.id) ? " · you joined" : data.att.has(x.id) ? " · you missed it" : ""}</p></div>
                <ButtonLink href={data.recs.get(x.id)![0]} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary" icon={CirclePlay}><Words k="Watch" /></ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      </Stack>
    </div>
  );
}

