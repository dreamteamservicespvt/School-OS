"use server";

// Actions shared by every Academic Management page: corrections to a
// closed year (04 §5) and switching optional parts on or off.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { parseForm, type FormState } from "@/lib/forms";
import { flash } from "@/lib/flash";
import { CORRECTION_COOKIE } from "./_lib/server";
import { sealCorrection } from "@/lib/academic/correction-cookie";
import { inCampus } from "@/lib/campus";

const correctionSchema = z.object({
  yearId: z.string().uuid("Choose the year."),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters. It is kept in the Audit Log.").max(300, "The reason can be at most 300 characters."),
});

/** Starts a 30-minute correction to a closed year. Only the Principal or School Admin. */
export async function startCorrection(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(correctionSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { current } = await requireAction("academic-management", "edit");
  if (!current.roles.some((r) => r.key === "principal" || r.key === "school-admin")) {
    return { ok: false, message: "Only the Principal or School Admin can correct a closed year." };
  }
  const year = await withSchool(current.ctx, async (tx) => {
    // One campus: only that campus's years (another campus's year is "not closed" here, as if unknown).
    const y = await tx.academicYear.findFirst({ where: { id: parsed.data.yearId, archivedAt: null, ...inCampus(current) } });
    if (y?.status === "CLOSED") await writeAudit(tx, current.ctx, { action: "correction-started", recordType: "Academic Year", recordId: y.id, after: { reason: parsed.data.reason } });
    return y;
  });
  if (!year || year.status !== "CLOSED") return { ok: false, message: "This year is not closed, so no correction is needed." };
  (await cookies()).set(CORRECTION_COOKIE, sealCorrection({ yearId: year.id, reason: parsed.data.reason, userId: current.user.id, until: Date.now() + 30 * 60_000 }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 60, secure: process.env.NODE_ENV === "production" });
  await flash({ message: `Correction to ${year.name} started for 30 minutes. Every change is logged with your reason.`, tone: "info" });
  revalidatePath("/academic-management", "layout");
  return { ok: true };
}

export async function stopCorrection() {
  await requireAction("academic-management", "view");
  (await cookies()).delete(CORRECTION_COOKIE);
  await flash({ message: "Correction finished. The year is read-only again.", tone: "info" });
  revalidatePath("/academic-management", "layout");
}
