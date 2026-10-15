import { CalendarDays, MapPin, Share2, ShieldCheck, Tag, Users } from "lucide-react";
import { feedUrl } from "@/lib/events/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Col } from "@/components/money/kit";
import { EvHead } from "../_components/head";
import { FeedForm, GalleryRuleForm, ListEditor, PtmDefaultsForm, WeekendsForm } from "../_components/settings-forms";
import { BASE, evGuard } from "../_lib/page";

export const metadata = { title: "Events Settings" };

/** Events Settings (18 §6, mod-events.jsx EventsSettings): weekends, event types, venues, PTM defaults, calendar sharing and photo consent. */
export default async function EventsSettingsPage() {
  const p = await evGuard("settings");
  const s = p.settings;
  const can = p.can.settings;
  const sid = p.current.ctx.schoolId;
  return (
    <div>
      <EvHead pageName="Events Settings" href={`${BASE}/settings`} sub="Event types, venues, weekends, calendar sharing, PTM defaults and photo consent." />
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
        </Col>
        <Col>
          <Card>
            <CardHeader icon={Users} title="PTM defaults" />
            <PtmDefaultsForm slot={s.ptmSlotMinutes} hour={s.ptmReminderHour} canEdit={can} />
          </Card>
          <Card>
            <CardHeader icon={Share2} title="Calendar sharing" description="A read-only feed for Google or Outlook" />
            <FeedForm on={s.feedOn} canEdit={can} links={[
              { label: "Whole school (holidays, exams, events, PTMs)", url: feedUrl(sid, "school", s.feedVersion) },
              { label: "Staff (also staff meetings and staff-only entries)", url: feedUrl(sid, "staff", s.feedVersion) },
            ]} />
          </Card>
          <Card>
            <CardHeader icon={ShieldCheck} title="Gallery photo consent" description="For students whose guardians have not given photo consent" />
            <GalleryRuleForm rule={s.galleryRule} canEdit={can} />
          </Card>
        </Col>
      </div>
    </div>
  );
}
