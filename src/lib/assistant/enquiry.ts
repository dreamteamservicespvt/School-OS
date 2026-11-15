// The assistant's one prepared change (docs/assistant/plan.md Layer 3): add
// an admission enquiry. The model never changes anything. It only names the
// fields it heard; the code checks them, fills the phone from the person's
// own words (the model never sees it), and shows a card with every field the
// form would save. Nothing changes until the person presses "Yes". Then the
// same checks run as on the Enquiries form, as the person: requireAction
// ("admission-management", "create") through inSchool(), the campus and year
// rules, the school's own required extra fields, the duplicate check, and
// createEnquiry() with its Audit Log entry; in the same transaction the
// Audit Log also gets "prepared by AI, confirmed by <person>" (00-global.md
// §2.1 rule 6).
import "server-only";

import { randomUUID } from "node:crypto";
import type { Tx } from "../db";
import type { Viewer } from "../dashboard/types";
import { writeAudit } from "../audit";
import { aiConfirmedNote } from "../ai/audit";
import { personCampusId } from "../campus";
import { moduleOpen } from "../reports/access";
import { classKey, readClass } from "../ask/questions";
import { AdmissionProblem, checkMobile, instantToLocal, todayIn, zonedToInstant } from "../admission/act";
import { admissionYear, live, loadSettings } from "../admission/settings";
import { customFrom, type Work } from "../admission/server";
import { createEnquiry, DuplicateProblem } from "../admission/enquiries";
import type { AssistantLang } from "./language";
import { words } from "./words";

/** What the model may name for an enquiry. The phone is never among them. */
export type EnquiryHeard = { childName?: string | null; parentName?: string | null; className?: string | null; source?: string | null; followUp?: string | null };

/** The checked plan kept on the conversation until the person says yes or no. */
export type EnquiryPlan = {
  childName: string | null;
  parentName: string | null;
  phone: string | null;
  classId: string | null;
  classLabel: string | null;
  source: string | null;
  sourceLabel: string | null;
  /** "YYYY-MM-DDTHH:mm" in the school's time zone. */
  followUp: string;
};

export type Prepared = { id: string; kind: "add-enquiry"; plan: EnquiryPlan; at: string };

export type CardRow = { label: string; value: string };
export type ConfirmCard = { id: string; title: string; rows: CardRow[]; missing: string[]; also: string; yes: string; no: string; ready: boolean; form: { href: string; label: string } };

export const ENQUIRY_FORM = "/admission-management/enquiries";

/** May this person add enquiries (the same rule the Enquiries form's server action checks)? */
export const mayAddEnquiry = (who: Viewer) => moduleOpen(who, "admission-management") && who.permissions["admission-management"].change !== "none";

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,119}$/u;
const cleanName = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s && NAME.test(s) ? s : null;
};

/** An Indian mobile number in the person's own words (the model is never sent it), or null. */
export function phoneIn(text: string): string | null {
  const m = String(text ?? "").match(/(?<!\d)(?:\+?91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?!\d)/);
  if (!m) return null;
  try { return checkMobile(m[0], "phone"); } catch { return null; }
}

/** The follow-up the model heard ("2026-11-16" or "2026-11-16T15:00"), else tomorrow at 10:00. Never in the past. */
function followUpOf(heard: string | null | undefined, tz: string, now: Date): string {
  const today = todayIn(tz, now);
  const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const h = (heard ?? "").trim();
  const v = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(h) ? h : /^\d{4}-\d{2}-\d{2}$/.test(h) ? `${h}T10:00` : `${tomorrow}T10:00`;
  return zonedToInstant(v, tz).getTime() < now.getTime() ? `${tomorrow}T10:00` : v;
}

/**
 * Checks what the model heard, adds what an earlier card already held, and
 * returns the plan. Fields that do not check out are left empty (and the card
 * says they are still needed); nothing is guessed.
 */
export async function planEnquiry(tx: Tx, who: Viewer, heard: EnquiryHeard, said: string, earlier: EnquiryPlan | null, now: Date): Promise<EnquiryPlan> {
  const s = await loadSettings(tx, who.ctx);
  const tz = who.school.timeZone;
  let classId = earlier?.classId ?? null;
  let classLabel = earlier?.classLabel ?? null;
  const wanted = heard.className ? readClass(heard.className) : null;
  if (wanted) {
    const campusId = who.campusId ?? null;
    // campus: a person limited to one campus picks only that campus's classes.
    const classes = await tx.schoolClass.findMany({ where: { archivedAt: null, ...(campusId ? { campusId } : {}) }, select: { id: true, name: true } });
    const hit = classes.filter((c) => classKey(c.name) === wanted.cls);
    if (hit.length === 1) { classId = hit[0].id; classLabel = hit[0].name; }
  }
  let source = earlier?.source ?? null;
  let sourceLabel = earlier?.sourceLabel ?? null;
  const said_ = (heard.source ?? "").trim().toLowerCase();
  if (said_) {
    const found = live(s.sourceList).find((x) => x.key.toLowerCase() === said_ || x.label.toLowerCase() === said_ || x.label.toLowerCase().replace(/[^a-z]/g, "") === said_.replace(/[^a-z]/g, ""));
    if (found) { source = found.key; sourceLabel = found.label; }
  }
  return {
    childName: cleanName(heard.childName) ?? earlier?.childName ?? null,
    parentName: cleanName(heard.parentName) ?? earlier?.parentName ?? null,
    phone: phoneIn(said) ?? earlier?.phone ?? null,
    classId, classLabel, source, sourceLabel,
    followUp: heard.followUp ? followUpOf(heard.followUp, tz, now) : earlier?.followUp ?? followUpOf(null, tz, now),
  };
}

/** Shows "2026-11-16T10:00" as "16-11-2026, 10:00 AM". */
function followUpWords(v: string) {
  const [d, t] = v.split("T");
  const [y, m, dd] = d.split("-");
  const [hh, mm] = t.split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${dd}-${m}-${y}, ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

/** The card the person checks: every field the form would save, in the conversation language. */
export function cardOf(p: Prepared, lang: AssistantLang): ConfirmCard {
  const w = (k: Parameters<typeof words>[1]) => words(lang, k);
  const rows: CardRow[] = [
    { label: w("fieldChild"), value: p.plan.childName ?? "" },
    { label: w("fieldParent"), value: p.plan.parentName ?? "" },
    { label: w("fieldPhone"), value: p.plan.phone ?? "" },
    { label: w("fieldClass"), value: p.plan.classLabel ?? "" },
    { label: w("fieldSource"), value: p.plan.sourceLabel ?? "" },
    { label: w("fieldFollowUp"), value: followUpWords(p.plan.followUp) },
  ];
  const needed: [boolean, Parameters<typeof words>[1]][] = [[!p.plan.childName, "fieldChild"], [!p.plan.parentName, "fieldParent"], [!p.plan.phone, "fieldPhone"], [!p.plan.source, "fieldSource"]];
  const missing = needed.filter(([m]) => m).map(([, k]) => w(k));
  return { id: p.id, title: w("cardTitle"), rows, missing, also: w("cardAlso"), yes: w("cardYes"), no: w("cardNo"), ready: missing.length === 0, form: { href: ENQUIRY_FORM, label: w("openForm") } };
}

export const newPrepared = (plan: EnquiryPlan, now: Date): Prepared => ({ id: randomUUID(), kind: "add-enquiry", plan, at: now.toISOString() });

export type Confirmed = { ok: true; id: string; childName: string } | { ok: false; problem: string; duplicate?: boolean };

/**
 * Adds the enquiry the person confirmed, in the transaction of `w` (made by
 * inSchool("create"), so the role was checked on the server first), with the
 * same campus, year, extra-field and duplicate rules as the Enquiries form.
 */
export async function confirmEnquiry(w: Work, plan: EnquiryPlan, lang: AssistantLang, now = new Date()): Promise<Confirmed> {
  try {
    if (!plan.childName || !plan.parentName || !plan.phone || !plan.source) return { ok: false, problem: words(lang, "missing", { fields: cardOf({ id: "", kind: "add-enquiry", plan, at: "" }, lang).missing.join(", ") }) };
    const cls = plan.classId ? await w.tx.schoolClass.findFirst({ where: { id: plan.classId, archivedAt: null }, select: { campusId: true } }) : null;
    const campusId = cls?.campusId ?? (await personCampusId(w.tx, w.ctx, w.v));
    if (!campusId) throw new AdmissionProblem("Add a campus in Settings first.");
    const year = await admissionYear(w.tx, w.ctx, w.s, campusId);
    if (!year) throw new AdmissionProblem("Set up an academic year in Academic Management first.");
    // The school's own extra fields: a required one the card cannot fill stops here, and the form is offered.
    const customFields = await customFrom(w, "enquiry", new FormData(), {});
    const e = await createEnquiry(w.tx, w.ctx, w.v, w.s, {
      childName: plan.childName, parentName: plan.parentName, phone: checkMobile(plan.phone, "phone"), email: null,
      classId: plan.classId, source: plan.source, ownerStaffId: null,
      nextFollowUpAt: zonedToInstant(plan.followUp, w.tz), nextAction: null, childDob: null, currentSchool: null, referredBy: null, notes: null, customFields,
    }, { yearId: year.id, campusId, today: todayIn(w.tz, now), now });
    await writeAudit(w.tx, w.ctx, { action: "confirmed from the assistant", recordType: "Enquiry", recordId: e.id, after: { prepared: "add an enquiry", followUp: instantToLocal(e.nextFollowUpAt ?? zonedToInstant(plan.followUp, w.tz), w.tz) }, actorNote: await aiConfirmedNote(w.tx, w.ctx) });
    return { ok: true, id: e.id, childName: e.childName };
  } catch (err) {
    if (err instanceof DuplicateProblem) return { ok: false, problem: words(lang, "duplicate"), duplicate: true };
    if (err instanceof AdmissionProblem) return { ok: false, problem: err.message };
    throw err;
  }
}
