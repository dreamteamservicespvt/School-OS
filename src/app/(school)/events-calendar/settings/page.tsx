import { Baby, CalendarDays, Flag, ListChecks, MapPin, Plus, Share2, ShieldCheck, Star, Tag, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { DAILY_BUILT_IN, feedUrl } from "@/lib/events/settings";
import { HOUSE_COLOURS, leaderboard } from "@/lib/events/cocurricular";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SettingRow } from "@/components/ui/blocks";
import { Col } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { EvHead } from "../_components/head";
import { CreditsForm, FeatureSwitch, FeedForm, GalleryRuleForm, ListEditor, PtmDefaultsForm, WeekendsForm } from "../_components/settings-forms";
import { HouseSheet } from "../_components/co-sheets";
import { HOUSE_BG } from "@/lib/events/words";
import { pickStudents } from "../_lib/co";
import { BASE, UUID, evGuard, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Events Settings") };
}

const HREF = `${BASE}/settings`;

/** Events Settings (18 §6, mod-events.jsx EventsSettings): weekends, event types, venues, houses, PTM defaults, calendar sharing, activity credits, photo consent, Daily Activities and lists. */
export default async function EventsSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("settings");
  const sp = await searchParams;
  const s = p.settings;
  const can = p.can.settings;
  const sid = p.current.ctx.schoolId;
  const doing = can ? one(sp.do) : "";
  const houseId = UUID.test(one(sp.id)) ? one(sp.id) : "";
  const d = await withSchool(p.current.ctx, async (tx) => {
    const [houses, clubs, teams] = await Promise.all([
      p.year ? leaderboard(tx, p.year.id) : tx.house.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }).then((h) => h.map((x) => ({ ...x, points: 0, students: 0, captain: null as string | null }))),
      tx.club.count({ where: { archivedAt: null } }),
      tx.sportsTeam.count({ where: { archivedAt: null } }),
    ]);
    const students = doing === "house" && p.year ? await pickStudents(tx, p.year.id) : [];
    return { houses: [...houses].sort((a, b) => a.sortOrder - b.sortOrder), clubs, teams, students };
  });
  const editing = doing === "house" && houseId ? d.houses.find((h) => h.id === houseId) : undefined;
  return (
    <div>
      <EvHead pageName="Events Settings" href={HREF} sub="Event types, weekends, houses, calendar sharing, PTM defaults, activity credits and photo consent." />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHeader icon={CalendarDays} title="Weekends" description="Shown on the calendar; attendance is off" />
            <WeekendsForm second={s.secondSaturdayOff} fourth={s.fourthSaturdayOff} canEdit={can} />
          </Card>
          <Card>
            <CardHeader icon={Tag} title="Event types" description="Offered when creating an event" />
            <ListEditor list="eventTypes" items={s.eventTypes} canEdit={can} addLabel="Add type" placeholder="For example: Exhibition" />
          </Card>
          <Card>
            <CardHeader icon={MapPin} title="Venues" description="Offered when creating an event; two events at one venue at the same time get a warning" />
            <ListEditor list="venues" items={s.venues} canEdit={can} addLabel="Add venue" placeholder="For example: Music room" />
          </Card>
          <Card>
            <CardHeader icon={Flag} title="Houses" description="Names, colours and captains" action={<FeatureSwitch name="housesOn" on={s.housesOn} label="Houses" canEdit={can} />} />
            {s.housesOn && (
              <div className="divide-y divide-line/70 border-t border-line/70">
                {d.houses.map((h) => (
                  <SettingRow key={h.id} title={h.name} sub={`${h.students} students${h.captain ? ` · Captain ${h.captain}` : " · No captain yet"}`}>
                    <span className="flex items-center gap-2"><span className={cx("w-6 h-6 rounded-full", HOUSE_BG[h.colour])} aria-hidden="true" />{can && <ButtonLink size="sm" variant="ghost" href={qs(HREF, { do: "house", id: h.id })} scroll={false}><Words k="Change" /></ButtonLink>}</span>
                  </SettingRow>
                ))}
                {!d.houses.length && <p className="px-5 py-3 text-[13.5px] text-ink3"><Words k="No houses yet." /></p>}
                {can && <div className="px-5 py-3"><ButtonLink size="sm" variant="soft" icon={Plus} href={qs(HREF, { do: "house" })} scroll={false}><Words k="Add a house" /></ButtonLink></div>}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader icon={Users} title="PTM defaults" />
            <PtmDefaultsForm slot={s.ptmSlotMinutes} hour={s.ptmReminderHour} parentBooking={s.ptmParentBooking} canEdit={can} />
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHeader icon={Share2} title="Calendar sharing" description="A read-only feed for Google or Outlook" />
            <FeedForm on={s.feedOn} canEdit={can} links={[
              { label: "Whole school (holidays, exams, events, PTMs)", url: feedUrl(sid, "school", s.feedVersion) },
              { label: "Staff (also staff meetings and staff-only entries)", url: feedUrl(sid, "staff", s.feedVersion) },
            ]} />
          </Card>
          <Card>
            <CardHeader icon={Star} title="Activity credits" description="Points a student earns for taking part or winning" />
            <CreditsForm on={s.creditsOn} levels={s.levels} take={s.creditsTakePart} win={s.creditsWin} canEdit={can} />
          </Card>
          <Card>
            <CardHeader icon={ShieldCheck} title="Gallery photo consent" description="For students whose guardians have not given photo consent" />
            <GalleryRuleForm rule={s.galleryRule} canEdit={can} />
          </Card>
          <Card>
            <CardHeader icon={Baby} title="Daily Activities" description="Activity types for pre-primary" action={<FeatureSwitch name="dailyOn" on={s.dailyOn} label="Daily Activities" canEdit={can} />} />
            {s.dailyOn && <ListEditor list="dailyTypes" items={s.dailyTypes} fixed={DAILY_BUILT_IN} canEdit={can} addLabel="Add type" placeholder="For example: Toilet training" />}
          </Card>
          <Card>
            <CardHeader icon={ListChecks} title="Lists" />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Achievement levels"><span className="text-[13.5px] text-ink2 text-right">{s.levels.join(", ")}</span></SettingRow>
              <SettingRow title="Clubs" sub="Shown in Co-curricular & Sports"><span className="flex items-center gap-3"><span className="text-[13.5px] text-ink2 tnum">{d.clubs} {d.clubs === 1 ? "club" : "clubs"}</span><FeatureSwitch name="clubsOn" on={s.clubsOn} label="Clubs" canEdit={can} /></span></SettingRow>
              <SettingRow title="Sports teams" sub="Teams, training, fixtures and fitness"><span className="flex items-center gap-3"><span className="text-[13.5px] text-ink2 tnum">{d.teams} {d.teams === 1 ? "team" : "teams"}</span><FeatureSwitch name="sportsOn" on={s.sportsOn} label="Sports teams" canEdit={can} /></span></SettingRow>
            </div>
            <div className="px-5 pt-3"><p className="text-[13px] font-semibold text-ink2"><Words k="Kinds of activity" /></p><p className="text-[12.5px] text-ink3"><Words k="Offered when recording an achievement" /></p></div>
            <div className="pt-2"><ListEditor list="activityKinds" items={s.activityKinds} canEdit={can} addLabel="Add kind" placeholder="For example: Robotics" /></div>
          </Card>
        </Col>
      </div>
      {doing === "house" && (!houseId || editing) && (
        <HouseSheet closeHref={HREF} house={editing ? { id: editing.id, name: editing.name, colour: editing.colour, captainStudentId: editing.captainStudentId } : undefined}
          students={d.students} colours={HOUSE_COLOURS.map((c) => ({ value: c.value, label: c.label }))} />
      )}
    </div>
  );
}
