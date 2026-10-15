// Timed work for Transport Management. Each runs for every school and does
// nothing where Transport is switched off. All are safe to run twice.
//   transport-watch (every 2 minutes): running trips with no location go
//     offline; a trip still running long after its last stop alerts.
//   transport-daily (hourly): today's trips from the schedule, places whose
//     last day has passed, and A15 reminders for driver licences, bus papers
//     and vehicle service.
// Imported by src/lib/job-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineSchedule } from "../jobs";
import { notify } from "../notifications";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { loginsWithRole } from "../front-office/people";
import { todayDate } from "../front-office/time";
import { transportOn, transportSettings } from "./settings";
import { ensureTrips, watchTrips } from "./trips";
import { endFinishedPlaces } from "./places";
import { serviceDue } from "./fleet";
import { paperLabel, showPlate, vehicleName } from "./words";

const DAY = 86_400_000;

async function zoneOf(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  return s?.timeZone ?? "Asia/Kolkata";
}

/** Writes the once-key; false when this reminder was already sent. */
async function once(tx: Tx, ctx: SchoolContext, onceKey: string, text: string) {
  const r = await tx.transportReminderLog.createMany({ data: [{ schoolId: ctx.schoolId, onceKey, text }], skipDuplicates: true });
  return r.count > 0;
}

/** Who gets transport reminders: the Transport In-charge, or the Principal when nobody has that role. */
export async function reminderPeople(tx: Tx, ctx: SchoolContext) {
  const inCharge = await loginsWithRole(tx, ctx, "transport-in-charge");
  return inCharge.length ? inCharge : loginsWithRole(tx, ctx, "principal");
}

/**
 * A15 for Transport (Done when 8): a licence or bus paper ending within the
 * reminder days (default 30) and again 7 days before gives one reminder each
 * time; an expired one gives one more.
 */
export async function sendTransportReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const s = await transportSettings(tx, ctx);
  const windows = [...new Set([s.expiryReminderDays, 7, 0])].filter((d) => d >= 0).sort((a, b) => b - a);
  const until = new Date(today.getTime() + windows[0] * DAY);
  const people = await reminderPeople(tx, ctx);
  let sent = 0;
  const windowOf = (left: number) => (left < 0 ? -1 : windows.filter((w) => left <= w).at(-1)!);
  const when = (left: number) => (left < 0 ? "has expired" : left === 0 ? "expires today" : `expires in ${left} day${left === 1 ? "" : "s"}`);

  const drivers = await tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE", role: "DRIVER", licenceExpiry: { not: null, lte: until } } });
  for (const d of drivers) {
    const left = Math.round((d.licenceExpiry!.getTime() - today.getTime()) / DAY);
    if (left < -30) continue;
    const key = `licence:${d.id}:${d.licenceExpiry!.toISOString().slice(0, 10)}:${windowOf(left)}`;
    const text = left < 0 ? `Licence of ${d.name} expired on ${formatDate(d.licenceExpiry!)}. Upload the renewed licence or change the driver.` : `Licence of ${d.name} ${when(left)} (${formatDate(d.licenceExpiry!)}). Upload the renewed licence.`;
    if (!(await once(tx, ctx, key, text))) continue;
    for (const to of people) await notify(tx, ctx, { to, type: "transport-reminder", text, link: "/transport-management/vehicles?view=people", groupKey: "transport-reminder", mergedText: (n) => `${n} driver licences and bus papers need renewing` });
    if (d.userLoginId) await notify(tx, ctx, { to: d.userLoginId, type: "transport-reminder", text: left < 0 ? `Your driving licence expired on ${formatDate(d.licenceExpiry!)}. Give the renewed licence to the Transport in-charge.` : `Your driving licence ${when(left)} (${formatDate(d.licenceExpiry!)}). Give the renewed licence to the Transport in-charge.`, link: "/driver" });
    sent++;
  }

  const papers = await tx.vehicleDocument.findMany({ where: { replacedAt: null, expiresOn: { lte: until }, vehicle: { archivedAt: null, status: { not: "INACTIVE" } } }, include: { vehicle: { select: { label: true, number: true } } } });
  for (const p of papers) {
    const left = Math.round((p.expiresOn.getTime() - today.getTime()) / DAY);
    if (left < -30) continue;
    const key = `paper:${p.id}:${windowOf(left)}`;
    const text = `${paperLabel(p.kind)} of ${vehicleName(p.vehicle)} ${when(left)} (${formatDate(p.expiresOn)}). Upload the renewed paper.`;
    if (!(await once(tx, ctx, key, text))) continue;
    for (const to of people) await notify(tx, ctx, { to, type: "transport-reminder", text, link: "/transport-management/vehicles?view=papers", groupKey: "transport-reminder", mergedText: (n) => `${n} driver licences and bus papers need renewing` });
    sent++;
  }

  const vehicles = await tx.vehicle.findMany({ where: { archivedAt: null, status: { not: "INACTIVE" }, OR: [{ serviceEveryKm: { not: null } }, { serviceEveryDays: { not: null } }] } });
  for (const v of vehicles) {
    const due = serviceDue(v, today);
    if (!due.due) continue;
    const key = `service:${v.id}:${v.lastServiceOn?.toISOString().slice(0, 10) ?? "never"}:${v.lastServiceKm ?? 0}`;
    const text = `${v.label ?? showPlate(v.number)} is due for service${due.kmLeft != null && due.kmLeft <= 0 ? ` (${Math.abs(due.kmLeft)} km over)` : ""}${due.daysLeft != null && due.daysLeft <= 0 ? ` (${Math.abs(due.daysLeft)} days over)` : ""}.`;
    if (!(await once(tx, ctx, key, text))) continue;
    for (const to of people) await notify(tx, ctx, { to, type: "transport-reminder", text, link: "/transport-management/vehicles?view=costs", groupKey: "transport-service", mergedText: (n) => `${n} vehicles are due for service` });
    sent++;
  }
  if (sent) await writeAudit(tx, { ...ctx, userId: null }, { action: "expiry-reminders-sent", recordType: "Transport Reminder", recordId: null, after: { reminders: sent } });
  return sent;
}

/** The hourly work, also used by tests. */
export async function transportDaily(tx: Tx, ctx: SchoolContext, now: Date) {
  if (!(await transportOn(tx, ctx))) return null;
  const today = todayDate(await zoneOf(tx, ctx), now);
  const trips = await ensureTrips(tx, ctx, today);
  const ended = await endFinishedPlaces(tx, today);
  const reminders = await sendTransportReminders(tx, ctx, today);
  return { trips, ended, reminders };
}

defineSchedule("transport-watch", 2, async (tx, ctx, now) => {
  if (!(await transportOn(tx, ctx))) return;
  await watchTrips(tx, ctx, now, await zoneOf(tx, ctx));
});

defineSchedule("transport-daily", 60, (tx, ctx, now) => transportDaily(tx, ctx, now));
