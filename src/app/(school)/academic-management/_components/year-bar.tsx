"use client";

// The year being viewed, and the yellow strip for a closed year with
// "Make a correction" for the Principal (00-global.md §1.2, P18).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { FormDialog, err, v } from "./form-dialog";
import { startCorrection, stopCorrection } from "../actions";
import { Words } from "@/lib/i18n/client";

export type YearOption = { id: string; name: string; status: string };

const STATUS_WORDS: Record<string, string> = { ACTIVE: "active", UPCOMING: "upcoming", OPEN: "open, not active", CLOSED: "closed" };

/** `defaultId`: the year shown with no ?year= (the person's own campus's); another campus's active year stays in the address. */
export function YearPicker({ years, current, defaultId }: { years: YearOption[]; current: string | null; defaultId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  if (years.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-2"><Words k="Academic year" /></span>
      <select value={current ?? ""} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px]"
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          const chosen = years.find((y) => y.id === e.target.value);
          if (!chosen || (chosen.status === "ACTIVE" && (defaultId === undefined || chosen.id === defaultId))) next.delete("year"); else next.set("year", e.target.value);
          next.delete("page");
          start(() => router.push(next.toString() ? `${pathname}?${next}` : pathname));
        }}>
        {years.map((y) => <option key={y.id} value={y.id}>{y.name} ({STATUS_WORDS[y.status] ?? y.status.toLowerCase()})</option>)}
      </select>
      {pending && <Spinner className="size-4 text-ink-2" />}
    </label>
  );
}

export function ClosedYearStrip({ yearId, yearName, canCorrect, correction }: { yearId: string; yearName: string; canCorrect: boolean; correction: string | null }) {
  if (correction) {
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-text">
        <p><strong><Words k="Correcting" /> {yearName}.</strong> <Words k="Reason:" /> {correction}<Words k=". Every change is logged with this reason." /></p>
        <form action={stopCorrection}><Button type="submit" size="sm" variant="secondary"><Words k="Finish correction" /></Button></form>
      </div>
    );
  }
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-text">
      <p><Words k="You are viewing" /> {yearName}<Words k=". This year is closed. Changes are not allowed." /></p>
      {canCorrect && (
        <FormDialog trigger="Make a correction" triggerSize="sm" title={`Correct ${yearName}`} action={startCorrection} submitLabel="Start correction" hidden={{ yearId }}>
          {(state) => (
            <>
              <p className="text-ink-2"><Words k="For 30 minutes you can change records of" /> {yearName}<Words k=". Each change is written to the Audit Log with your name and this reason." /></p>
              <TextArea label="Reason" name="reason" required rows={3} defaultValue={v(state, "reason")} error={err(state, "reason")} help="For example: Ravi's section was entered wrongly in March." />
            </>
          )}
        </FormDialog>
      )}
    </div>
  );
}
