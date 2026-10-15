"use client";

// Early Warnings sheets (mod-reports.jsx ReviewSheet and the marks-drop rule).
// A review needs a note; "Action planned" needs the action, which makes a
// Task or a counselling referral. Checked again on the server.

import { useState } from "react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SText } from "@/components/ui/sheet-fields";
import { FieldShell } from "@/components/ui/field";
import { Segmented } from "@/components/ui/controls";
import { dropRuleAction, reviewAction } from "../actions";

type Decision = "REVIEWED" | "ACTION_PLANNED" | "NOT_A_CONCERN";
const DECISIONS: { value: Decision; label: string }[] = [
  { value: "REVIEWED", label: "Reviewed" }, { value: "ACTION_PLANNED", label: "Action planned" }, { value: "NOT_A_CONCERN", label: "Not a concern" },
];
type ActionOption = { key: string; label: string; fees: boolean };

export function ReviewSheet({ flagId, name, fee, preset, actions, closeHref, teacher, counsellor, dueWords }: {
  flagId: string; name: string; fee: boolean; preset: Decision; actions: ActionOption[]; closeHref: string;
  teacher: string | null; counsellor: string | null; dueWords: string;
}) {
  const [dec, setDec] = useState<Decision>(preset);
  return (
    <SheetForm title={`Review: ${name}`} sub="Your name, the time and your note are saved with the flag" closeHref={closeHref} action={reviewAction}
      hidden={{ flagId }} submitLabel={dec === "NOT_A_CONCERN" ? "Close the flag" : dec === "ACTION_PLANNED" ? "Save and plan action" : "Mark reviewed"}>
      <ReviewFields fee={fee} dec={dec} setDec={setDec} actions={actions} teacher={teacher} counsellor={counsellor} dueWords={dueWords} />
    </SheetForm>
  );
}

function ReviewFields({ fee, dec, setDec, actions, teacher, counsellor, dueWords }: { fee: boolean; dec: Decision; setDec: (d: Decision) => void; actions: ActionOption[]; teacher: string | null; counsellor: string | null; dueWords: string }) {
  const t = useTyped("decision", dec);
  const a = useTyped("action", dec === "ACTION_PLANNED" ? (fee ? "fee-follow-up" : "call-parent") : "");
  const [action, setAction] = useState(a.value);
  const hint = action
    ? action === "counsellor" ? `Sends a counselling referral${counsellor ? ` to ${counsellor}` : ""}`
      : action === "fee-follow-up" ? `Creates a task for you to follow up with accounts, due ${dueWords}`
        : `Creates a task for you${teacher ? ` (class teacher ${teacher})` : ""}, due ${dueWords}`
    : "Creates a task or a counselling referral";
  return (
    <>
      <FieldShell label="Decision" id="rv-dec" required error={t.error}>
        <Segmented value={dec} label="Decision" className="w-full" options={DECISIONS}
          onChange={(v) => { setDec(v as Decision); if (v === "ACTION_PLANNED" && !action) setAction(fee ? "fee-follow-up" : "call-parent"); }} />
        <input type="hidden" name="decision" value={dec} />
      </FieldShell>
      <SArea name="note" label="Note" required rows={3} placeholder={dec === "NOT_A_CONCERN" ? "Was unwell on the exam day; doctor’s note seen" : "Spoke to the student after class…"} />
      {dec !== "NOT_A_CONCERN" && (
        <FieldShell label={dec === "ACTION_PLANNED" ? "Action" : "Action (optional)"} id="rv-act" required={dec === "ACTION_PLANNED"} error={a.error} help={hint}>
          <select id="rv-act" name="action" value={action} onChange={(e) => setAction(e.target.value)} aria-invalid={a.error ? true : undefined}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">
            <option value="">No action yet</option>
            {actions.filter((x) => fee || !x.fees).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </FieldShell>
      )}
    </>
  );
}

export function DropRuleSheet({ value, closeHref }: { value: number; closeHref: string }) {
  return (
    <SheetForm title="Marks-drop rule" sub="A student is flagged when marks fall this much from one test to the next" closeHref={closeHref} action={dropRuleAction} submitLabel="Save rule">
      <SText name="drop" label="Flag when marks fall by (%)" required start={value} inputMode="numeric" maxLength={2} className="tnum"
        help="Default 15%. The other thresholds come from Attendance, Exam and Fee Settings." />
    </SheetForm>
  );
}
