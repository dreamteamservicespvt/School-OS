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
import { MoveInProblem, askConsentAfterGoLive, goLive, liveGuardianIds, saveExpected } from "@/lib/move-in/service";
import { parseRupees } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { MONEY_KEYS, type MoneyExpected } from "@/lib/move-in/money";

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
  const counts = { students: count(fd.get("students")), staff: count(fd.get("staff")), guardians: count(fd.get("guardians")) };
  for (const [k, v] of Object.entries(counts)) if (Number.isNaN(v)) errors[k] = "Write a whole number, like 318.";
  // Money from the old software, in rupees as it shows them ("14,82,300"); kept as whole paise.
  const money: MoneyExpected = {};
  for (const key of MONEY_KEYS) {
    // A line this person may not see is not on their form: it keeps what was saved.
    if (!fd.has(key)) continue;
    try {
      const p = parseRupees(String(fd.get(key) ?? ""), "This", key);
      money[key] = p === null ? null : String(p);
    } catch (e) {
      if (!(e instanceof MoneyProblem)) throw e;
      errors[key] = "Write an amount in rupees, like 1482300 or 14,82,300.";
    }
  }
  const expected = { ...counts, ...money };
  const oldSoftware = String(fd.get("oldSoftware") ?? "").trim().slice(0, 100) || null;
  const rawDate = String(fd.get("goLiveDate") ?? "");
  const goLiveDate = rawDate ? new Date(`${rawDate}T00:00:00Z`) : null;
  if (rawDate && (!goLiveDate || Number.isNaN(goLiveDate.getTime()))) errors.goLiveDate = "Choose a real date.";
  if (Object.keys(errors).length) return { ok: false, message: "Check the numbers marked below.", errors, values };
  try {
    await withSchool(current.ctx, (tx) => saveExpected(tx, current.ctx, { oldSoftware, expected, goLiveDate }));
  } catch (e) {
    if (e instanceof MoveInProblem && e.field) return { ok: false, message: "Check the field marked below.", errors: { [e.field]: e.message }, values };
    throw e;
  }
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
    // The consent request goes with the links (workflow 15, step 10): to each parent without consent on record.
    try {
      const asked = await withSchool(current.ctx, (tx) => askConsentAfterGoLive(tx, current.ctx), { timeout: 300_000 });
      linkNote += asked === null ? " Consent was not asked: Parent Link or its consent forms are switched off in Communication, Settings."
        : asked.guardians ? ` Consent requests went to ${asked.guardians} ${asked.guardians === 1 ? "parent" : "parents"}; see who answered in Settings, Data Backup & Security, Consent.` : "";
    } catch (e) {
      unstable_rethrow(e);
      linkNote += " Consent requests were not sent. Send them from Student Management, Parents & Guardians.";
    }
  }
  await flash({ message: `Your school is live on School OS.${linkNote}` });
  refresh();
  revalidatePath(`${BASE}/check`);
}
