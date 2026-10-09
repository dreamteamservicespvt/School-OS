"use server";

// Year-end promotion (A13): review the batch, confirm, and undo while nothing
// is recorded for those students in the new year.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import type { FormState } from "@/lib/forms";
import { confirmPromotion, undoPromotion, type DecisionInput } from "@/lib/students/promotion";
import { BASE, attempt, attemptForm, studentAction } from "../_lib/page";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const KINDS = new Set(["PROMOTE", "DETAIN", "LEAVING"]);

export async function confirmPromotionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await studentAction("edit", { manage: true });
  const fromSectionId = String(fd.get("fromSectionId") ?? "");
  const toYearId = String(fd.get("toYearId") ?? "");
  const toClassId = String(fd.get("toClassId") ?? "");
  if (!isId(fromSectionId) || !isId(toYearId)) return { ok: false, message: "Choose the class to promote and the new year again." };
  let decisions: DecisionInput[] = [];
  try {
    const raw = JSON.parse(String(fd.get("decisions") ?? "[]")) as unknown[];
    decisions = raw.flatMap((d) => {
      const x = d as Record<string, unknown>;
      if (!isId(x.studentId) || !KINDS.has(String(x.decision))) return [];
      return [{ studentId: x.studentId, decision: String(x.decision) as DecisionInput["decision"], toSectionId: isId(x.toSectionId) ? x.toSectionId : null, reason: typeof x.reason === "string" ? x.reason.slice(0, 300) : null }];
    });
  } catch {
    return { ok: false, message: "The decisions could not be read. Reload the page and try again." };
  }
  let batchId = "";
  let summary = "";
  const r = await attemptForm({}, async () => {
    const out = await withSchool(current.ctx, (tx) => confirmPromotion(tx, current.ctx, { fromSectionId, toYearId, toClassId: isId(toClassId) ? toClassId : null, decisions }), { timeout: 120_000 });
    batchId = out.batch.id;
    summary = out.batch.summary;
  });
  if (!r?.ok) return r;
  await flash({ message: `Saved: ${summary}. Last year's record stays unchanged.` });
  revalidatePath(`${BASE}/promotion`);
  redirect(`${BASE}/promotion/${batchId}`);
}

export async function undoPromotionAction(fd: FormData) {
  const { current } = await studentAction("edit", { manage: true });
  const id = String(fd.get("batchId") ?? "");
  const r = await attempt(() => withSchool(current.ctx, (tx) => undoPromotion(tx, current.ctx, id), { timeout: 120_000 }));
  if (r) return r;
  await flash({ message: "Promotion undone. The students are back in their class, and the batch is kept in the history." });
  revalidatePath(`${BASE}/promotion`);
}
