"use server";

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { todayIn } from "@/lib/staff/dates";
import { feeViewer } from "@/lib/fees/access";
import { askTeacherFollowUp } from "@/lib/fees/follow-up";
import { problemState } from "@/lib/fees/act";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fees by class: asks a section's class teacher to follow up with the families
 * who still owe (names only). Anyone who sees the whole school's fees may ask;
 * checked again on the server in askTeacherFollowUp.
 */
export async function askFollowUpAction(sectionId: string): Promise<string | null> {
  try {
    const { current } = await requireAction("fee-management", "view");
    if (typeof sectionId !== "string" || !UUID_RE.test(sectionId)) return "Choose a class.";
    const today = todayIn(current.school.timeZone);
    const r = await withSchool(current.ctx, async (tx) => askTeacherFollowUp(tx, current.ctx, await feeViewer(tx, current.ctx, current), { sectionId, today }));
    await flash({ message: `Sent to ${r.teacher}: the names of the ${r.students === 1 ? "family" : `${r.students} families`} who still owe, without amounts` });
    revalidatePath("/fee-management/dashboard", "layout");
    return null;
  } catch (e) {
    return problemState(e).message ?? "That did not go through. Please try again.";
  }
}
