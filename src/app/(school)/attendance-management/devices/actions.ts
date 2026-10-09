"use server";

// Devices & QR (05 §2): devices with their own keys (only the hash is kept),
// user mapping, re-running rejected punches, QR sessions and the campus area.

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { writeAudit } from "@/lib/audit";
import { FieldProblem, id, optionalId, str } from "@/lib/staff/act";
import { act } from "@/lib/attendance/act";
import { actionContext } from "@/lib/attendance/page";
import { AttendanceProblem } from "@/lib/attendance/access";
import { addDevice, autoMatch, mapUser, regenerateKey, reprocessRejected, setDeviceState, unmapUser, updateDevice, type DeviceInput } from "@/lib/attendance/devices";
import { instantAt } from "@/lib/attendance/time";
import { createQrSession, POSTER_THEMES, saveGeoFence, setQrSessionState } from "@/lib/attendance/qr";

async function admin(action: "create" | "edit" | "archive") {
  const { current } = await requireAction("attendance-management", action);
  const { access } = await actionContext(current);
  if (!access.admin) throw new AttendanceProblem("Only the School Admin or the Principal can change devices and QR check-in.");
  return { current, access };
}

function deviceInput(fd: FormData): DeviceInput {
  return {
    name: str(fd, "name").slice(0, 80), serialNo: str(fd, "serialNo").slice(0, 60), location: str(fd, "location").slice(0, 120) || null,
    campusId: id(fd, "campusId", "campus"), deviceType: str(fd, "deviceType"), allowedUsers: str(fd, "allowedUsers") || "both",
    ipAddress: str(fd, "ipAddress").slice(0, 100) || null, connectionNote: str(fd, "connectionNote").slice(0, 500) || null,
  };
}

/** Adds a device. The key is returned once, to be shown with a Copy button; it is never stored. */
export async function addDeviceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("create");
    const r = await withSchool(current.ctx, (tx) => addDevice(tx, current.ctx, access, deviceInput(fd)));
    return { id: r.device.id, name: r.device.name, key: r.key };
  }, (r) => `Device "${r.name}" added. Copy its key now; it is shown only once.`, { toast: false });
}

export async function updateDeviceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    await withSchool(current.ctx, (tx) => updateDevice(tx, current.ctx, access, id(fd, "deviceId", "device"), deviceInput(fd)));
    return {};
  }, () => "Device saved.");
}

/** Replaces the key; the old one stops working at once. Returned once. */
export async function regenerateKeyAction(deviceId: string): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  try {
    const { current, access } = await admin("edit");
    const r = await withSchool(current.ctx, (tx) => regenerateKey(tx, current.ctx, access, deviceId));
    return { ok: true, key: r.key };
  } catch (e) {
    return { ok: false, message: e instanceof AttendanceProblem ? e.message : "The key was not changed because of a problem on our side. Please try again." };
  }
}

export async function deviceStateAction(_: FormState<unknown>, fd: FormData) {
  const change = str(fd, "change") as "activate" | "deactivate" | "archive" | "restore";
  return act(fd, async () => {
    if (!["activate", "deactivate", "archive", "restore"].includes(change)) throw new FieldProblem("Choose what to do.");
    const { current, access } = await admin(change === "archive" ? "archive" : "edit");
    const d = await withSchool(current.ctx, (tx) => setDeviceState(tx, current.ctx, access, id(fd, "deviceId", "device"), change));
    return { name: d.name };
  }, (r) => ({ activate: `${r.name} is active. Its punches count again.`, deactivate: `${r.name} is inactive. Its punches are rejected until it is active again.`, archive: `${r.name} archived. Its key no longer works.`, restore: `${r.name} restored. Make it active to use it.` })[change] ?? "Saved.");
}

export async function mapUserAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    const p = await withSchool(current.ctx, (tx) => mapUser(tx, current.ctx, access, { deviceId: id(fd, "deviceId", "device"), deviceUserNo: str(fd, "deviceUserNo"), who: str(fd, "who") }));
    return { name: p.name, no: str(fd, "deviceUserNo") };
  }, (r) => `Device user ${r.no} is now ${r.name}. Re-run the sync to count their rejected punches.`);
}

export async function unmapUserAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    await withSchool(current.ctx, (tx) => unmapUser(tx, current.ctx, access, id(fd, "mapId", "mapping")));
    return {};
  }, () => "Mapping removed. New punches from that number will be rejected as unknown.");
}

export async function autoMatchAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    const n = await withSchool(current.ctx, (tx) => autoMatch(tx, current.ctx, access, id(fd, "deviceId", "device")));
    return { n };
  }, (r) => (r.n ? `${r.n} device ${r.n === 1 ? "user" : "users"} matched by staff ID or admission number. Re-run the sync to count their punches.` : "No new matches. Map the remaining numbers by hand."));
}

export async function reprocessAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    return withSchool(current.ctx, (tx) => reprocessRejected(tx, current.ctx, access, id(fd, "deviceId", "device"), new Date(), current.school.timeZone), { timeout: 60_000 });
  }, (r) => `Sync re-run: ${r.checked} rejected ${r.checked === 1 ? "punch" : "punches"} checked again, ${r.accepted} now counted.`);
}

// ---------------------------------------------------------------- QR

export async function qrSettingsAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current } = await admin("edit");
    const theme = str(fd, "posterTheme");
    if (!POSTER_THEMES.some((t) => t.value === theme)) throw new FieldProblem("Choose a poster theme.", "posterTheme");
    const data = { qrStudentsOn: str(fd, "qrStudentsOn") === "on", qrStaffOn: str(fd, "qrStaffOn") === "on", qrRotation: str(fd, "qrRotation") === "fixed" ? "fixed" : "daily", posterTheme: theme, updatedById: current.user.id };
    await withSchool(current.ctx, async (tx) => {
      const before = await tx.attendanceSetting.findUniqueOrThrow({ where: { schoolId: current.ctx.schoolId } });
      await tx.attendanceSetting.update({ where: { schoolId: current.ctx.schoolId }, data });
      await writeAudit(tx, current.ctx, { action: "changed", recordType: "Attendance Setting", recordId: before.id, before: { qrStudentsOn: before.qrStudentsOn, qrStaffOn: before.qrStaffOn, qrRotation: before.qrRotation, posterTheme: before.posterTheme }, after: data });
    });
    return {};
  }, () => "QR check-in settings saved.");
}

export async function createQrAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("create");
    const exp = str(fd, "expiresAt");
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw new FieldProblem("Expiry is not a real date.", "expiresAt");
    const expiresAt = exp ? instantAt(new Date(`${exp}T00:00:00Z`), "23:59", current.school.timeZone) : null;
    const row = await withSchool(current.ctx, (tx) => createQrSession(tx, current.ctx, access, {
      name: str(fd, "name").slice(0, 80), forWhom: str(fd, "forWhom"), scope: str(fd, "scope"), campusId: optionalId(fd, "campusId"), rotation: str(fd, "rotation"), expiresAt, now: new Date(),
    }));
    return { id: row.id, name: row.name };
  }, (r) => ({ message: `QR "${r.name}" created. Print its poster for the entrance.`, link: { href: `/attendance-management/devices/qr/${r.id}`, label: "Open the poster" } }));
}

export async function qrStateAction(_: FormState<unknown>, fd: FormData) {
  const change = str(fd, "change") as "stop" | "start" | "archive" | "new-code";
  return act(fd, async () => {
    if (!["stop", "start", "archive", "new-code"].includes(change)) throw new FieldProblem("Choose what to do.");
    const { current, access } = await admin(change === "archive" ? "archive" : "edit");
    const row = await withSchool(current.ctx, (tx) => setQrSessionState(tx, current.ctx, access, id(fd, "qrId", "QR"), change));
    return { name: row.name };
  }, (r) => ({ stop: `QR "${r.name}" stopped. Scans are refused.`, start: `QR "${r.name}" is on again.`, archive: `QR "${r.name}" archived.`, "new-code": `QR "${r.name}" has a new code. Print the poster again; the old one stops working.` })[change] ?? "Saved.");
}

export async function geoFenceAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const { current, access } = await admin("edit");
    const num = (k: string) => Number(str(fd, k));
    await withSchool(current.ctx, (tx) => saveGeoFence(tx, current.ctx, access, {
      campusId: id(fd, "campusId", "campus"), latitude: num("latitude"), longitude: num("longitude"), radiusM: Math.round(num("radiusM")),
      studentsOn: str(fd, "studentsOn") === "on", staffOn: str(fd, "staffOn") === "on",
    }));
    return {};
  }, () => "Campus area saved. Check-ins from outside the circle are refused.");
}
