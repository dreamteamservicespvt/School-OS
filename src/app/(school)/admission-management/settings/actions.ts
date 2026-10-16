"use server";

// Admission Settings (02 §6). Every save checks the role on the server and
// needs full reach; each change is written to the Audit Log with before and after.
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/forms";
import { AdmissionProblem, optionalId, rupeesOf, str } from "@/lib/admission/act";
import { admissionAct } from "@/lib/admission/server";
import { loadSettings, DOC_TYPES, CATEGORIES, classRule, type ClassDoc, type Quota } from "@/lib/admission/settings";
import { saveClassRule, saveList, saveOwnerRule, saveRules, saveStages, type ListKind, type RulesInput } from "@/lib/admission/settings-save";

const PATH = "/admission-management";
const done = <T,>(s: FormState<T>) => { if (s?.ok) revalidatePath(PATH, "layout"); return s; };

/** Stage switches and approval ticks, saved as soon as they change. */
export async function saveStagesAction(stages: { key: string; label: string; on: boolean; needsApproval: boolean }[]) {
  return done(await admissionAct("edit", undefined, (w) => saveStages(w.tx, w.ctx, w.v, stages), () => "Stages saved. Recorded in the audit log."));
}

const RULE_KEYS = ["allowOverCapacity", "admitWithPapersPending", "waitingListOn", "siblingPriorityOn", "quotaOn", "onlineOn", "applicationFeeOn", "offerLettersOn", "campaignsOn"] as const;
type RuleSwitch = (typeof RULE_KEYS)[number];

/** One on/off rule, saved as soon as it changes. */
export async function setRuleAction(key: RuleSwitch, on: boolean) {
  if (!RULE_KEYS.includes(key)) return { ok: false, message: "This setting was not found." } as FormState<unknown>;
  return done(await admissionAct("edit", undefined, async (w) => {
    const s = await loadSettings(w.tx, w.ctx);
    return saveRules(w.tx, w.ctx, w.v, { ...rulesOf(s), [key]: on });
  }, () => "Saved. Recorded in the audit log."));
}

function rulesOf(s: Awaited<ReturnType<typeof loadSettings>>): RulesInput {
  return {
    admissionYearId: s.admissionYearId, applicationPrefix: s.applicationPrefix, allowOverCapacity: s.allowOverCapacity, admitWithPapersPending: s.admitWithPapersPending,
    waitingListOn: s.waitingListOn, siblingPriorityOn: s.siblingPriorityOn, siblingWeight: s.siblingWeight, quotaOn: s.quotaOn, quotas: s.quotaList,
    onlineOn: s.onlineOn, applicationFeeOn: s.applicationFeeOn, offerLettersOn: s.offerLettersOn, campaignsOn: s.campaignsOn,
  };
}

/** Admission year, number format, sibling points and quota shares (the sheet). */
export async function saveNumbersAction(_: FormState<unknown>, fd: FormData) {
  return done(await admissionAct("edit", fd, async (w) => {
    const s = await loadSettings(w.tx, w.ctx);
    const weight = Number.parseInt(str(fd, "siblingWeight") || String(s.siblingWeight), 10);
    if (!Number.isFinite(weight)) throw new AdmissionProblem("Type the sibling points as a number.", "siblingWeight");
    const quotas: Quota[] = [];
    for (const c of CATEGORIES) {
      const raw = str(fd, `quota_${c}`);
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new AdmissionProblem(`The share for ${c} must be between 0 and 100.`, `quota_${c}`);
      if (n > 0) quotas.push({ category: c, sharePct: Math.round(n * 10) / 10 });
    }
    return saveRules(w.tx, w.ctx, w.v, {
      ...rulesOf(s),
      admissionYearId: optionalId(fd, "admissionYearId"),
      applicationPrefix: str(fd, "applicationPrefix") || s.applicationPrefix,
      siblingWeight: weight,
      quotas: fd.has("quotasShown") ? quotas : s.quotaList,
    });
  }, () => "Saved. Recorded in the audit log."));
}

export async function saveOwnerRuleAction(_: FormState<unknown>, fd: FormData) {
  return done(await admissionAct("edit", fd, (w) => saveOwnerRule(w.tx, w.ctx, w.v, {
    rule: str(fd, "rule"),
    defaultOwnerStaffId: optionalId(fd, "defaultOwnerStaffId"),
    turnStaffIds: fd.getAll("turnStaffIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
  }), () => "Who gets new enquiries is saved."));
}

export async function saveListAction(kind: ListKind, items: { key: string | null; label: string; archived: boolean }[]) {
  if (!["enquiryStatuses", "sources", "lossReasons"].includes(kind)) return { ok: false, message: "This list was not found." } as FormState<unknown>;
  return done(await admissionAct("edit", undefined, (w) => saveList(w.tx, w.ctx, w.v, kind, items.slice(0, 60)), () => "List saved. Recorded in the audit log."));
}

/** One cell of the papers table: required, optional or not needed for a class. */
export async function setPaperAction(classId: string, docType: string, need: "required" | "optional" | "none") {
  if (!DOC_TYPES.some((d) => d.key === docType)) return { ok: false, message: "This paper was not found." } as FormState<unknown>;
  return done(await admissionAct("edit", undefined, async (w) => {
    const r = await classRule(w.tx, classId);
    const docs: ClassDoc[] = r.documents.filter((d) => d.type !== docType);
    if (need !== "none") docs.push({ type: docType, required: need === "required" });
    docs.sort((a, b) => DOC_TYPES.findIndex((d) => d.key === a.type) - DOC_TYPES.findIndex((d) => d.key === b.type));
    return saveClassRule(w.tx, w.ctx, w.v, { ...r, classId, documents: docs });
  }, () => "Saved. Recorded in the audit log."));
}

/** Application fee, online form, age rule and owner for one class (the sheet). */
export async function saveClassAction(_: FormState<unknown>, fd: FormData) {
  return done(await admissionAct("edit", fd, async (w) => {
    const classId = optionalId(fd, "classId");
    if (!classId) throw new AdmissionProblem("This class was not found.");
    const r = await classRule(w.tx, classId);
    const fee = rupeesOf(fd, "fee", "Application fee");
    const age = (k: string, label: string) => {
      const t = str(fd, k);
      if (!t) return null;
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n)) throw new AdmissionProblem(`Type the ${label} as a number of years.`, k);
      return n;
    };
    return saveClassRule(w.tx, w.ctx, w.v, {
      ...r, classId,
      feePaise: fee,
      onlineOpen: fd.get("onlineOpen") === "on",
      minAge: age("minAge", "lowest age"),
      maxAge: age("maxAge", "highest age"),
      ownerStaffId: optionalId(fd, "ownerStaffId"),
    });
  }, () => "Class rules saved."));
}
