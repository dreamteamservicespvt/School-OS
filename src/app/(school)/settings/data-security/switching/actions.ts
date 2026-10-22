"use server";

// Switching to School OS (workflow 15): the move-in plan and the go-live
// check. Each checks the person's role on the server, works inside the
// school's own transaction and explains a refusal in plain words. The
// changes made on each file are shared by every import page:
// src/app/(school)/_imports/file-actions.ts.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireSettingsAction } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import type { FormState } from "@/lib/forms";
import { AcademicRuleError } from "@/lib/academic/common";
import { ParentLinkProblem, sendToFamilies } from "@/lib/parent-link/links";
import { MessagingProblem } from "@/lib/messaging";
import { MoveInProblem, goLive, liveGuardianIds, saveExpected } from "@/lib/move-in/service";

const BASE = "/settings/data-security/switching";
const PAGE = "data-security" as const;

const KNOWN = [MoveInProblem, AcademicRuleError, ParentLinkProblem];
function problem(e: unknown): string {
  unstable_rethrow(e);
  if (KNOWN.some((K) => e instanceof K)) return (e as Error).message;
  console.error(JSON.stringify({ level: "error", event: "move-in-failed", error: e instanceof Error ? e.message : String(e) }));
  return "That did not work, and nothing was changed. Try again.";
}

async function run(fn: () => Promise<unknown>): Promise<string | void> {
  try {
    await fn();
  } catch (e) {
    return problem(e);
  }
}

const refresh = () => { revalidatePath(BASE); };

// ── The go-live check ─────────────────────────────────────────────────────

const count = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").replace(/[,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : NaN;
};

export async function expectedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const errors: Record<string, string> = {};
  const expected = { students: count(fd.get("students")), staff: count(fd.get("staff")), guardians: count(fd.get("guardians")) };
  for (const [k, v] of Object.entries(expected)) if (Number.isNaN(v)) errors[k] = "Write a whole number, like 318.";
  const oldSoftware = String(fd.get("oldSoftware") ?? "").trim().slice(0, 100) || null;
  const rawDate = String(fd.get("goLiveDate") ?? "");
  const goLiveDate = rawDate ? new Date(`${rawDate}T00:00:00Z`) : null;
  if (rawDate && (!goLiveDate || Number.isNaN(goLiveDate.getTime()))) errors.goLiveDate = "Choose a real date.";
  if (Object.keys(errors).length) return { ok: false, message: "Check the numbers marked below.", errors, values };
  await withSchool(current.ctx, (tx) => saveExpected(tx, current.ctx, { oldSoftware, expected, goLiveDate }));
  refresh();
  revalidatePath(`${BASE}/check`);
  return { ok: true, message: "Saved. The numbers are compared below." };
}

export async function goLiveAction(sendLinks: boolean): Promise<string | void> {
  const { current } = await requireSettingsAction(PAGE, "edit");
  let linkNote = "";
  const r = await run(() => withSchool(current.ctx, (tx) => goLive(tx, current.ctx), { timeout: 60_000 }));
  if (r) return r;
  if (sendLinks) {
    try {
      const sent = await withSchool(current.ctx, async (tx) => sendToFamilies(tx, current.ctx, await liveGuardianIds(tx), { audienceLabel: "All parents, on going live" }), { timeout: 300_000 });
      linkNote = ` Parent Links are going to ${sent.made} ${sent.made === 1 ? "parent" : "parents"}.`;
    } catch (e) {
      unstable_rethrow(e);
      linkNote = e instanceof ParentLinkProblem || e instanceof MessagingProblem ? ` Parent Links were not sent: ${e.message} You can send them later from Communication, Parent Link.` : " Parent Links were not sent. You can send them from Communication, Parent Link.";
    }
  }
  await flash({ message: `Your school is live on School OS.${linkNote}` });
  refresh();
  revalidatePath(`${BASE}/check`);
}
