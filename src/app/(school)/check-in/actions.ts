"use server";

// QR and mobile check-in (05 §2 Devices & QR). The person checks in for
// themselves; every check is in src/lib/attendance/qr.ts.

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { hitLimit } from "@/lib/rate-limit";
import { checkIn } from "@/lib/attendance/qr";

export type CheckInAnswer = { ok: boolean; message: string };

export async function checkInAction(input: { method: "qr" | "mobile"; code?: string | null; schoolId?: string | null; location?: { lat: number; lng: number; accuracy?: number | null } | null }): Promise<CheckInAnswer> {
  const current = await requireCurrent();
  if (input.method === "qr" && input.schoolId && input.schoolId !== current.ctx.schoolId) {
    return { ok: false, message: "This QR belongs to another school. Switch to that school from the top bar, then scan again." };
  }
  const limit = await hitLimit(`check-in:${current.user.id}`, 10, 60);
  if (!limit.ok) return { ok: false, message: "Too many tries. Wait a minute and scan again." };
  const loc = input.location && Number.isFinite(input.location.lat) && Number.isFinite(input.location.lng) && Math.abs(input.location.lat) <= 90 && Math.abs(input.location.lng) <= 180
    ? { lat: input.location.lat, lng: input.location.lng, accuracy: Number.isFinite(input.location.accuracy ?? NaN) ? input.location.accuracy : null }
    : null;
  try {
    const r = await withSchool(current.ctx, (tx) => checkIn(tx, current.ctx, { method: input.method === "mobile" ? "mobile" : "qr", code: typeof input.code === "string" ? input.code.slice(0, 120) : null, location: loc, now: new Date(), timeZone: current.school.timeZone }));
    if (r.ok) revalidatePath("/attendance-management", "layout");
    return { ok: r.ok, message: r.message };
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "check-in-failed", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, message: "Check-in did not work because of a problem on our side. Please try again." };
  }
}
