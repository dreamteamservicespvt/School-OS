// Transport Settings (12 §6): alerts, geofences, bus messages to parents,
// the location update interval, the driver app options, transport change
// approvals, how the transport fee goes on the student's fees, and live
// tracking on or off (a School Feature, so it can be switched school by school).
import "server-only";

import type { TransportSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { LIVE_FEATURE } from "./words";
import { TransportProblem } from "./problem";

export type TrSettings = TransportSetting;

export async function transportSettings(tx: Tx, ctx: SchoolContext): Promise<TrSettings> {
  const row = await tx.transportSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (row) return row;
  return tx.transportSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId }, update: {} });
}

export async function liveTrackingOn(tx: Tx, ctx: SchoolContext) {
  const f = await tx.schoolFeature.findFirst({ where: { schoolId: ctx.schoolId, featureKey: LIVE_FEATURE } });
  return Boolean(f?.isOn);
}

export async function setLiveTracking(tx: Tx, ctx: SchoolContext, on: boolean) {
  const before = await liveTrackingOn(tx, ctx);
  if (before === on) return;
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: LIVE_FEATURE } },
    create: { schoolId: ctx.schoolId, featureKey: LIVE_FEATURE, isOn: on },
    update: { isOn: on },
  });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { [LIVE_FEATURE]: before }, after: { [LIVE_FEATURE]: on } });
}

/** The fields a person may change on Transport Settings. */
export const SETTING_FIELDS = [
  "locationIntervalSec", "staleAfterSec", "offlineAfterMin", "overSpeedKmh", "deviationMeters", "schoolGeofenceMeters", "stopGeofenceMeters",
  "schoolLat", "schoolLng", "arrivingMinutes", "tripLeftRunningMin", "lateAfterMin", "delaySuggestion", "alertRoleKeys", "boardingRequired",
  "showParentPhones", "changeApproval", "feeFrequency", "feeDueDay", "noFeeMonths", "expiryReminderDays", "gpsProvider",
] as const;

const RANGES: Record<string, [number, number, string]> = {
  locationIntervalSec: [10, 120, "The location interval must be between 10 and 120 seconds."],
  staleAfterSec: [60, 600, "A location is marked old after 1 to 10 minutes."],
  offlineAfterMin: [2, 30, "Offline after must be between 2 and 30 minutes."],
  overSpeedKmh: [20, 100, "The over-speed limit must be between 20 and 100 km/h."],
  deviationMeters: [100, 3000, "Route deviation must be between 100 and 3,000 metres."],
  schoolGeofenceMeters: [25, 1000, "The circle around the school must be between 25 and 1,000 metres."],
  stopGeofenceMeters: [25, 500, "The circle around each stop must be between 25 and 500 metres."],
  arrivingMinutes: [1, 30, "Minutes before arrival must be between 1 and 30."],
  tripLeftRunningMin: [10, 180, "Trip left running must be between 10 and 180 minutes."],
  lateAfterMin: [3, 60, "Late after must be between 3 and 60 minutes."],
  feeDueDay: [1, 28, "The fee due day must be between 1 and 28."],
  expiryReminderDays: [7, 90, "Reminders can start 7 to 90 days before expiry."],
};

/** Saves part of the settings (each card saves its own fields), with the before and after in the audit log. */
export async function saveSettings(tx: Tx, ctx: SchoolContext, input: Record<string, unknown>) {
  const before = await transportSettings(tx, ctx);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (!(SETTING_FIELDS as readonly string[]).includes(k)) throw new Error(`Not a transport setting: ${k}`);
    if (RANGES[k]) {
      const [lo, hi, msg] = RANGES[k];
      if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) throw new TransportProblem(msg, k);
    }
    if (k === "changeApproval" && !["ALL", "ROUTE", "NONE"].includes(String(v))) throw new TransportProblem("Choose which transport changes need approval.", k);
    if (k === "feeFrequency" && !["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"].includes(String(v))) throw new TransportProblem("Choose how often the transport fee is due.", k);
    if (k === "noFeeMonths" && (!Array.isArray(v) || v.some((m) => !Number.isInteger(m) || m < 1 || m > 12) || v.length > 11)) throw new TransportProblem("Choose the months with no transport fee (at most 11).", k);
    if ((k === "schoolLat" && v !== null && (typeof v !== "number" || Math.abs(v) > 90)) || (k === "schoolLng" && v !== null && (typeof v !== "number" || Math.abs(v) > 180))) throw new TransportProblem("Enter the school's location as a latitude and longitude, or use your current location.", k);
    data[k] = v;
  }
  if (data.staleAfterSec !== undefined || data.offlineAfterMin !== undefined) {
    const stale = Number(data.staleAfterSec ?? before.staleAfterSec);
    const off = Number(data.offlineAfterMin ?? before.offlineAfterMin) * 60;
    if (off <= stale) throw new TransportProblem("Offline must come after a location is marked old.", "offlineAfterMin");
  }
  const after = await tx.transportSetting.update({ where: { schoolId: ctx.schoolId }, data: { ...data, updatedById: ctx.userId } });
  const changed = Object.keys(data).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
  if (changed.length) {
    await writeAudit(tx, ctx, {
      action: "updated", recordType: "Transport Setting", recordId: null,
      before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k] as never])),
      after: Object.fromEntries(changed.map((k) => [k, (after as Record<string, unknown>)[k] as never])),
    });
  }
  return { settings: after, changed };
}

/** Transport is switched on for this school (Settings, Modules On/Off). Timed work and the driver API check it. */
export async function transportOn(tx: Tx, ctx: SchoolContext) {
  const row = await tx.schoolModule.findUnique({ where: { schoolId_moduleKey: { schoolId: ctx.schoolId, moduleKey: "transport-management" } } });
  return Boolean(row?.isOn);
}
