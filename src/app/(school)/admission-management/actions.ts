"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE, problemState } from "@/lib/admission/act";
import { inSchool } from "@/lib/admission/server";
import { moveStage, loadApplication } from "@/lib/admission/applications";
import { boardColumns } from "@/lib/admission/dashboard";

/**
 * A pipeline card moves one column on, with the same checks as the buttons.
 * Steps that need a form (convert, interview booking, decision) say where to do them.
 */
export async function moveCard(id: string, from: string, to: string): Promise<{ ok: boolean; title: string; body?: string }> {
  if (!UUID_RE.test(id)) return { ok: false, title: "This card was not found." };
  try {
    return await inSchool("edit", async ({ tx, ctx, v, s }) => {
      const cols = boardColumns(s).map((c) => c.key as string);
      if (cols[cols.indexOf(from) + 1] !== to) return { ok: false, title: "Move one step at a time" };
      if (from === "enq") {
        const e = await tx.enquiry.findFirst({ where: { id, archivedAt: null }, select: { childName: true } });
        return { ok: false, title: `${e?.childName ?? "This enquiry"} has no application yet`, body: "Open the enquiry and use Convert to application, so the form can be filled." };
      }
      const app = await loadApplication(tx, id);
      if (to === "int") return { ok: false, title: `${app.fullName} cannot move on yet`, body: "Book an interview slot in Test & Interview first." };
      if (to === "done") {
        return { ok: false, title: `${app.fullName} cannot move on yet`, body: app.stage === "APPROVED" ? "Confirm the admission from Admission Decision." : "The admission must be approved first, in Admission Decision." };
      }
      if (from === "test" && s.stageList.find((x) => x.key === "test")?.on) {
        const open = await tx.admissionTestBooking.findFirst({ where: { applicationId: id, archivedAt: null, marks: null, absent: false }, include: { test: true } });
        if (open) return { ok: false, title: `${app.fullName} cannot move on yet`, body: `The test "${open.test.title}" has no score yet. Record the score first.` };
      }
      if (from === "int") {
        const open = await tx.interviewSlot.findFirst({ where: { applicationId: id, cancelledAt: null, outcome: null } });
        if (open) return { ok: false, title: `${app.fullName} cannot move on yet`, body: "The interview has no outcome yet. Record the outcome first." };
      }
      const stage = to === "docs" ? "DOCUMENTS" : to === "test" ? "TEST_INTERVIEW" : "DECISION";
      await moveStage(tx, ctx, v, s, id, stage);
      const label = boardColumns(s).find((c) => c.key === to)?.label ?? "the next step";
      return { ok: true, title: `${app.fullName} moved to ${label}`, body: "Logged in the application history." };
    });
  } catch (e) {
    return { ok: false, title: problemState(e)?.message ?? "That did not work." };
  } finally {
    revalidatePath("/admission-management");
  }
}
