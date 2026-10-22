"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Plus, Scale, X } from "lucide-react";
import { SheetForm, useSheetResult } from "@/components/ui/url-sheet";
import { SArea, SDate } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { inputCls, type Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { journalAction } from "./actions";
import { KeepSelect } from "@/components/ui/keep-select";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
type L = { k: number; head: string; side: "Dr" | "Cr"; amt: string };

/** Journal entry (mod-finance.jsx JournalSheet): debits must equal credits. */
export function JournalSheet({ closeHref, today, heads }: { closeHref: string; today: string; heads: Option[] }) {
  const [lines, setLines] = useState<L[]>([{ k: 1, head: "", side: "Dr", amt: "" }, { k: 2, head: "", side: "Cr", amt: "" }]);
  const state = useSheetResultSafe();
  const dr = lines.filter((l) => l.side === "Dr").reduce((s, l) => s + num(l.amt), 0);
  const cr = lines.filter((l) => l.side === "Cr").reduce((s, l) => s + num(l.amt), 0);
  const set = (k: number, x: Partial<L>) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...x } : l)));
  return (
    <SheetForm wide title="Journal entry" sub="Debits must equal credits. Posted entries are never edited, only reversed." closeHref={closeHref} action={journalAction} submitLabel="Post entry" pendingText="Posting…">
      <SDate name="date" label="Date" required start={today} max={today} className="max-w-[220px]" />
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink2">Lines</p>
        {lines.map((l, i) => (
          <div key={l.k} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_140px_auto] gap-2 items-center">
            <KeepSelect name="lineHead" aria-label={`Account, line ${i + 1}`} value={l.head} onChange={(e) => set(l.k, { head: e.target.value })} className={cx(inputCls(), "h-11")}>
              <option value="">Choose an account</option>
              {heads.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </KeepSelect>
            <input type="hidden" name="lineSide" value={l.side} />
            <Segmented label={`Side, line ${i + 1}`} value={l.side} onChange={(v) => set(l.k, { side: v as "Dr" | "Cr" })} options={[{ value: "Dr", label: "Debit" }, { value: "Cr", label: "Credit" }]} />
            <input name="lineAmount" inputMode="decimal" aria-label={`Amount, line ${i + 1}`} value={l.amt} onChange={(e) => set(l.k, { amt: e.target.value })} placeholder="₹" className={cx(inputCls(), "h-11 tnum")} />
            <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.k !== l.k))}
              className="w-10 h-10 grid place-items-center rounded-xl text-ink3 hover:bg-sunken disabled:opacity-30"><X size={16} aria-hidden="true" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" icon={Plus} className="self-start" onClick={() => setLines((ls) => [...ls, { k: Date.now(), head: "", side: "Dr", amt: "" }])}>Add line</Button>
        <div className={cx("rounded-xl px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 tnum", dr === cr && dr ? "bg-ok/10 text-ok" : "bg-sunken text-ink2")}>
          {dr === cr && dr ? <CircleCheck size={16} aria-hidden="true" /> : <Scale size={16} aria-hidden="true" />}
          <span>Debits <b>{inr(dr)}</b> · Credits <b>{inr(cr)}</b>{dr !== cr && <> · difference {inr(Math.abs(dr - cr))}</>}</span>
        </div>
        {state?.errors?.lines && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} aria-hidden="true" />{state.errors.lines}</p>}
      </div>
      <SArea name="narration" label="Narration" required rows={2} placeholder="Example: Depreciation for October on computers" />
    </SheetForm>
  );
}

function useSheetResultSafe() {
  const s = useSheetResult();
  return s && !s.ok ? s : null;
}
