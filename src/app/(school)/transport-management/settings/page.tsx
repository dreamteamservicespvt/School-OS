import { BadgeIndianRupee, Bell, ClipboardCheck, MapPinned, MessageSquare, Pencil, Radio, Satellite, Smartphone } from "lucide-react";
import { withSchool } from "@/lib/db";
import { ruleStates } from "@/lib/messaging/automatic";
import { APPROVAL_CHOICES, FEE_FREQUENCIES } from "@/lib/transport/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SettingRow } from "@/components/ui/blocks";
import { SChips, SSwitch, SText } from "@/components/ui/sheet-fields";
import { TrHead } from "../_components/head";
import { ActButton, ConfirmAct, LocationField, SegField } from "../_components/fields";
import { SettingsSheet } from "../_components/settings-sheet";
import { setLiveAction } from "../actions";
import { BASE, addQ, one, trGuard, type SearchParams } from "../_lib/page";
import { schoolRoles } from "@/lib/school-roles";

export const metadata = { title: "Transport Settings" };

const HREF = `${BASE}/settings`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const present = (k: string) => <input type="hidden" name={`${k}__present`} value="1" />;

/** Transport Settings (12 §6): live tracking, alerts, geofences, bus messages, driver app, GPS company, approvals and the fee. */
export default async function TransportSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("settings");
  const sp = await searchParams;
  const edit = p.mode === "full" ? one(sp.edit) : "";
  const s = p.settings;
  const { roles, rules, school } = await withSchool(p.current.ctx, async (tx) => ({
    roles: await schoolRoles(tx, p.current.ctx, { where: { archivedAt: null, isEnabled: true }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
    rules: (await ruleStates(tx, p.current.ctx)).filter((r) => r.key.startsWith("bus-")),
    school: await tx.school.findUniqueOrThrow({ where: { id: p.current.ctx.schoolId }, select: { name: true } }),
  }));
  const roleOpts = roles.filter((r): r is { key: string; name: string } => Boolean(r.key)).map((r) => ({ value: r.key, label: r.name }));
  const roleNames = s.alertRoleKeys.map((k) => roleOpts.find((r) => r.value === k)?.label ?? k).join(", ");
  const editBtn = (k: string) => (p.mode === "full" ? <ButtonLink size="sm" variant="ghost" href={addQ(HREF, { edit: k })} scroll={false} icon={Pencil}>Edit</ButtonLink> : undefined);
  const canComm = p.current.menu.some((m) => m.key === "communication");

  return (
    <div>
      <TrHead page="settings" sub={p.mode === "full" ? "Each change is saved in the audit log" : "Only the Transport In-charge and School Admin change these"} />
      <div className="grid lg:grid-cols-2 gap-5 lg:gap-6 items-start [&>*]:min-w-0">
        <Card>
          <CardHeader title="Live tracking" description="The map of running buses. Trips, stops and boarding work without it." icon={Radio}
            action={p.mode === "full" ? (p.v.live
              ? <ConfirmAct action={setLiveAction} fields={{ on: "0" }} trigger="Switch off" triggerVariant="ghost" title="Switch live tracking off?" confirmLabel="Switch off">Live Tracking is hidden and no more locations are kept. Trips, stops, boarding and messages keep working.</ConfirmAct>
              : <ActButton action={setLiveAction} fields={{ on: "1" }} label="Switch on" variant="primary" />) : undefined} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="Live tracking" sub="Optional for schools tracking buses by GPS"><Pill tone={p.v.live ? "ok" : "neutral"} dot>{p.v.live ? "On" : "Off"}</Pill></SettingRow>
            <SettingRow title="Location update interval" sub="Shorter uses more of the driver's phone battery and data">{`Every ${s.locationIntervalSec} seconds`}</SettingRow>
            <SettingRow title="Locations kept" sub="Decided 9 October 2026">Only between Start trip and End trip</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Alerts" description="Who is told, and when" icon={Bell} action={editBtn("alerts")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="Over-speed">{`Above ${s.overSpeedKmh} km/h`}</SettingRow>
            <SettingRow title="Route deviation">{`More than ${s.deviationMeters} m off the route`}</SettingRow>
            <SettingRow title="Location marked old" sub="Shown as “Last seen” and faded">{`After ${Math.round(s.staleAfterSec / 60)} minutes`}</SettingRow>
            <SettingRow title="Vehicle offline">{`No location for ${s.offlineAfterMin} minutes`}</SettingRow>
            <SettingRow title="Trip left running">{`${s.tripLeftRunningMin} minutes after the last stop`}</SettingRow>
            <SettingRow title="Running late" sub={s.delaySuggestion ? "Suggests a delay message to parents" : "No delay suggestion"}>{`${s.lateAfterMin} minutes behind`}</SettingRow>
            <SettingRow title="Papers and licences" sub="Reminders also at 7 days and on the day">{`${s.expiryReminderDays} days before they end`}</SettingRow>
            <SettingRow title="Who is alerted" sub="The emergency button always alerts the in-charge and the Principal">{roleNames}</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Geofences" description="Circles around the school and each stop, for ‘reached’ and ‘arriving’" icon={MapPinned} action={editBtn("geofence")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="School location">{s.schoolLat != null ? <span className="tnum">{s.schoolLat.toFixed(5)}, {s.schoolLng?.toFixed(5)}</span> : <Pill tone="warn">Not set</Pill>}</SettingRow>
            <SettingRow title="Around the school">{`${s.schoolGeofenceMeters} m`}</SettingRow>
            <SettingRow title="Around each stop" sub="Stops' own locations are set in Routes & Stops">{`${s.stopGeofenceMeters} m`}</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bus messages to parents" description="Sent through Communication, on WhatsApp with SMS where it fails" icon={MessageSquare} action={editBtn("messages")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            {rules.map((r) => <SettingRow key={r.key} title={r.label} sub={r.when}><Pill tone={r.isOn ? "ok" : "neutral"} dot>{r.isOn ? "On" : "Off"}</Pill></SettingRow>)}
            <SettingRow title="‘Bus arriving’ goes" sub="Once per student per trip">{`${s.arrivingMinutes} minutes before the stop`}</SettingRow>
            {canComm && <ButtonLink className="mt-2 self-start" size="sm" href="/communication/settings">Switch on, and the templates, in Message Settings</ButtonLink>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Driver app" description="The Android app sends the location with the screen off; the web driver page only while open" icon={Smartphone} action={editBtn("driver")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="Boarding marked per student">{s.boardingRequired ? "Yes" : "No"}</SettingRow>
            <SettingRow title="Parents' phone numbers in the app">{s.showParentPhones ? "Shown" : "Hidden"}</SettingRow>
            <SettingRow title="Phone keys" sub="Made per phone in Vehicles & Drivers, shown once">{<ButtonLink size="sm" variant="ghost" href={`${BASE}/vehicles?view=people`}>Drivers</ButtonLink>}</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="GPS tracking provider" description="A GPS device company, when the buses have trackers" icon={Satellite} action={editBtn("gps")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="Company" sub="Device IDs are linked on each vehicle">{s.gpsProvider ?? "None: the driver app sends the location"}</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Transport change approvals" description="Also in Settings, Forms & Approvals" icon={ClipboardCheck} action={editBtn("approvals")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="Changes that need approval">{APPROVAL_CHOICES.find((c) => c.value === s.changeApproval)?.label ?? s.changeApproval}</SettingRow>
          </div>
        </Card>

        <Card>
          <CardHeader title="Transport fee" description="How a stop's fee goes on the student's fees" icon={BadgeIndianRupee} action={editBtn("fees")} />
          <div className="px-5 pb-5 flex flex-col gap-1">
            <SettingRow title="How often">{FEE_FREQUENCIES.find((f) => f.value === s.feeFrequency)?.label ?? s.feeFrequency}</SettingRow>
            <SettingRow title="Due on">{`Day ${s.feeDueDay} of the month`}</SettingRow>
            <SettingRow title="Months with no fee" sub="Such as the summer holidays">{s.noFeeMonths.length ? s.noFeeMonths.map((m) => MONTHS[m - 1]).join(", ") : "None"}</SettingRow>
          </div>
        </Card>
      </div>

      {edit === "alerts" && (
        <SettingsSheet closeHref={HREF} title="Alerts" section="Alerts">
          <div className="grid grid-cols-2 gap-3">
            <SText name="overSpeedKmh" label="Over-speed above (km/h)" inputMode="numeric" required start={s.overSpeedKmh} />
            <SText name="deviationMeters" label="Off the route by (m)" inputMode="numeric" required start={s.deviationMeters} />
            <SText name="staleAfterMin" label="Mark old after (minutes)" inputMode="numeric" required start={Math.round(s.staleAfterSec / 60)} />
            <SText name="offlineAfterMin" label="Offline after (minutes)" inputMode="numeric" required start={s.offlineAfterMin} />
            <SText name="tripLeftRunningMin" label="Trip left running (minutes)" inputMode="numeric" required start={s.tripLeftRunningMin} />
            <SText name="lateAfterMin" label="Running late after (minutes)" inputMode="numeric" required start={s.lateAfterMin} />
          </div>
          <SText name="expiryReminderDays" label="Paper and licence reminder (days before)" inputMode="numeric" required start={s.expiryReminderDays} />
          {present("delaySuggestion")}
          <SSwitch name="delaySuggestion" title="Suggest a delay message" sub="When a bus runs late, Live Tracking offers a ready message to the route's parents" start={s.delaySuggestion} />
          {present("alertRoleKeys")}
          <SChips name="alertRoleKeys" label="Who is alerted" required options={roleOpts} start={s.alertRoleKeys} help="The emergency button always alerts the Transport In-charge and the Principal" />
        </SettingsSheet>
      )}
      {edit === "geofence" && (
        <SettingsSheet closeHref={HREF} title="Geofences" section="Geofences">
          <LocationField names={{ lat: "schoolLat", lng: "schoolLng" }} label="School location" help="Stand at the school gate and use your current location" start={{ lat: s.schoolLat, lng: s.schoolLng }} sketch={null} />
          <div className="grid grid-cols-2 gap-3">
            <SText name="schoolGeofenceMeters" label="Around the school (m)" inputMode="numeric" required start={s.schoolGeofenceMeters} />
            <SText name="stopGeofenceMeters" label="Around each stop (m)" inputMode="numeric" required start={s.stopGeofenceMeters} />
          </div>
        </SettingsSheet>
      )}
      {edit === "messages" && (
        <SettingsSheet closeHref={HREF} title="Bus messages" sub="Switch each message on, and choose its template, in Communication, Message Settings" section="Bus messages">
          <SText name="arrivingMinutes" label="‘Bus arriving’ minutes before the stop" inputMode="numeric" required start={s.arrivingMinutes} />
        </SettingsSheet>
      )}
      {edit === "driver" && (
        <SettingsSheet closeHref={HREF} title="Driver app" section="Driver app">
          <SText name="locationIntervalSec" label="Send the location every (seconds)" inputMode="numeric" required start={s.locationIntervalSec} help="10 to 120. About 30 is a good balance with battery and data." />
          {present("boardingRequired")}
          <SSwitch name="boardingRequired" title="Mark boarding per student" sub="The driver or attendant marks each student boarded or not" start={s.boardingRequired} />
          {present("showParentPhones")}
          <SSwitch name="showParentPhones" title="Show parents' phone numbers in the app" sub="So the attendant can call a parent at the stop" start={s.showParentPhones} />
        </SettingsSheet>
      )}
      {edit === "gps" && (
        <SettingsSheet closeHref={HREF} title="GPS tracking provider" sub="The connection itself is set up in Settings, Modules On/Off" section="GPS tracking provider">
          <SText name="gpsProvider" label="GPS device company" start={s.gpsProvider} maxLength={60} placeholder="Empty when the driver app sends the location" />
        </SettingsSheet>
      )}
      {edit === "approvals" && (
        <SettingsSheet closeHref={HREF} title="Transport change approvals" sub="A change waiting for approval goes to the Approvals list" section="Approvals">
          <SegField name="changeApproval" label="Changes that need approval" required start={s.changeApproval} options={APPROVAL_CHOICES} />
        </SettingsSheet>
      )}
      {edit === "fees" && (
        <SettingsSheet closeHref={HREF} title="Transport fee" sub={`Applies to stops given from now on at ${school.name}`} section="Transport fee">
          <SegField name="feeFrequency" label="How often" required start={s.feeFrequency} options={FEE_FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} />
          <SText name="feeDueDay" label="Due on day of the month" inputMode="numeric" required start={s.feeDueDay} />
          {present("noFeeMonths")}
          <SChips name="noFeeMonths" label="Months with no transport fee" options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} start={s.noFeeMonths.map(String)} />
        </SettingsSheet>
      )}
    </div>
  );
}
