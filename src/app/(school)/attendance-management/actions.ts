"use server";

// Take Attendance: saving a class (online, or later from the phone's
// offline queue). Every rule is checked again here on the server.

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { UUID_RE } from "@/lib/staff/act";
import { actionContext } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { problemState } from "@/lib/attendance/act";
import { saveClassAttendance, type Entry } from "@/lib/attendance/marks";
import { formatTime } from "@/lib/format";
import { flash } from "@/lib/flash";

export type SheetPayload = {
  sectionId: string;
  date: string;
  periodNo: number;
  entries: Entry[];
  clientId: string;
  /** Present when the save comes from the phone's offline queue. */
  offline?: { takenAt: string; clientNow: string } | null;
};

export type SheetResult = {
  ok: boolean;
  message: string;
  outcome?: "saved" | "correction" | "unchanged";
  link?: { href: string; label: string };
  /** The problem will not go away by trying again (for the offline queue). */
  final?: boolean;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function readPayload(p: SheetPayload) {
  if (!p || typeof p !== "object") return null;
  if (!UUID_RE.test(String(p.sectionId)) || !ISO_DAY.test(String(p.date))) return null;
  const periodNo = Number(p.periodNo);
  if (!Number.isInteger(periodNo) || periodNo < 0 || periodNo > 20) return null;
  if (typeof p.clientId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(p.clientId)) return null;
  if (!Array.isArray(p.entries) || p.entries.length > 400) return null;
  const entries: Entry[] = [];
  for (const e of p.entries) {
    if (!e || !UUID_RE.test(String(e.studentId)) || typeof e.statusKey !== "string" || e.statusKey.length > 40) return null;
    if (e.reason != null && (typeof e.reason !== "string" || e.reason.length > 40)) return null;
    entries.push({
      studentId: e.studentId, statusKey: e.statusKey, note: typeof e.note === "string" ? e.note.slice(0, 300) : null,
      // Absence reason: optional; older phones' offline saves have none.
      reason: typeof e.reason === "string" && e.reason ? e.reason : null,
      reasonNote: typeof e.reasonNote === "string" ? e.reasonNote.slice(0, 100) : null,
    });
  }
  let offline: { takenAt: Date; clientNow: Date } | null = null;
  if (p.offline) {
    const takenAt = new Date(p.offline.takenAt);
    const clientNow = new Date(p.offline.clientNow);
    if (Number.isNaN(takenAt.getTime()) || Number.isNaN(clientNow.getTime())) return null;
    offline = { takenAt, clientNow };
  }
  return { sectionId: p.sectionId, date: new Date(`${p.date}T00:00:00Z`), periodNo, entries, clientId: p.clientId, offline };
}

/** Saves one class's attendance. A double tap or a resend counts once (same clientId). */
export async function saveSheet(payload: SheetPayload): Promise<SheetResult> {
  const input = readPayload(payload);
  if (!input) return { ok: false, final: true, message: "This attendance could not be read. Reload the page and take it again." };
  try {
    const { current } = await requireAction("attendance-management", "create");
    const { access, features } = await actionContext(current);
    if (input.offline && !features.has("attendance-offline")) {
      return { ok: false, final: true, message: "Offline attendance is switched off for this school. Take the attendance again while online." };
    }
    const tz = current.school.timeZone;
    const now = new Date();
    const result = await withSchool(current.ctx, (tx) => saveClassAttendance(tx, current.ctx, access, {
      sectionId: input.sectionId, date: input.date, periodNo: input.periodNo, entries: input.entries, now, timeZone: tz,
      clientId: input.offline ? null : input.clientId,
      offline: input.offline ? { clientId: input.clientId, takenAt: input.offline.takenAt, clientNow: input.offline.clientNow } : null,
    }), { timeout: 30_000 });
    revalidatePath(BASE, "layout");
    if (result.outcome === "correction") {
      if (!input.offline) await flash({ message: result.summary, tone: "info", link: result.correctionId ? { href: `${BASE}/register/corrections/${result.correctionId}`, label: "See the correction" } : undefined });
      return { ok: true, outcome: "correction", message: result.summary, link: result.correctionId ? { href: `${BASE}/register/corrections/${result.correctionId}`, label: "See the correction" } : undefined };
    }
    if (result.outcome === "unchanged") return { ok: true, outcome: "unchanged", message: result.summary === "Already received." ? "Already saved." : "Saved. Nothing had changed." };
    const parts = [result.summary];
    const absent = result.counts.absent ?? 0;
    if (result.messagesAt && absent) parts.push(`Parents of ${absent} absent ${absent === 1 ? "student" : "students"} get a message at ${formatTime(result.messagesAt, tz)}.`);
    else if (result.held && absent) parts.push("No absence message goes to parents yet: messages start when your school goes live on School OS.");
    else if (result.noChannel && absent) parts.push("No absence message goes to parents: WhatsApp or SMS is not connected yet (Settings, Messaging).");
    else if (result.ruleOff && absent) parts.push("No absence message goes to parents: the \"Absent today\" message is switched off in Communication, Message Settings.");
    else if (!absent && !input.offline) parts.push("Everyone is in today.");
    if (result.clockFlagged) parts.push("The phone's clock was wrong, so the school's time was used.");
    const message = parts.join(" ");
    if (!input.offline) await flash({ message });
    return { ok: true, outcome: "saved", message };
  } catch (e) {
    const s = problemState(e);
    const link = (s.data as { link?: { href: string; label: string } } | undefined)?.link;
    const known = s.message !== "That did not save because of a problem on our side. Nothing was changed. Please try again.";
    return { ok: false, final: known, message: s.message ?? "That did not save. Please try again.", link };
  }
}
