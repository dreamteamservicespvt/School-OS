"use client";

// Counting a stock audit (14 Items & Stock): type what is on the shelf; the
// difference from the system shows as each count is typed. Save as you go;
// "Send for approval" posts nothing until an approver agrees (14 §5).

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { FormResultProvider } from "@/components/ui/url-sheet";
import { Words } from "@/lib/i18n/client";

export type CountLine = { itemId: string; name: string; code: string; unit: string; system: number; counted: string; note: string; pricePaise: number };
type Act = (p: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

const rupees = (paise: number) => `₹${Math.abs(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function AuditCounts({ action, auditId, lines, editable }: { action: Act; auditId: string; lines: CountLine[]; editable: boolean }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  const typed = state && !state.ok ? state.values : undefined;
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.itemId, typed?.[`count-${l.itemId}`] ?? l.counted])));
  const diffs = lines.map((l) => {
    const raw = counts[l.itemId] ?? "";
    const n = raw === "" ? null : Number(raw);
    return { l, diff: n === null || !Number.isFinite(n) ? null : n - l.system };
  });
  const changed = diffs.filter((x) => x.diff !== null && x.diff !== 0);
  const counted = diffs.filter((x) => x.diff !== null).length;
  const value = changed.reduce((a, x) => a + x.diff! * x.l.pricePaise, 0);
  return (
    <FormResultProvider value={state?.ok ? null : state}>
      <form action={run} noValidate className="flex flex-col">
        <input type="hidden" name="auditId" value={auditId} />
        <div className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] border-b border-line" aria-live="polite">
          <span><b className="font-semibold tnum">{counted}</b> <Words k="of" /> {lines.length} <Words k="counted" /></span>
          <span className={changed.length ? "text-warn font-semibold" : "text-ink3"}>{changed.length} <Words k="difference" />{changed.length === 1 ? "" : "s"}</span>
          {changed.length > 0 && <span className="text-ink3"><Words k="Value" /> {value < 0 ? "short" : "over"}: {rupees(value)}</span>}
        </div>
        <ul className="divide-y divide-line">
          {diffs.map(({ l, diff }) => {
            const err = state?.errors?.[`count-${l.itemId}`];
            return (
              <li key={l.itemId} className="px-5 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_110px_90px] gap-x-3 gap-y-2 items-center">
                <span className="min-w-0 text-[14px]"><b className="font-semibold">{l.name}</b><span className="block text-[12px] text-ink3 font-mono">{l.code}</span></span>
                <span className="text-[13px] text-ink3 tnum text-right"><Words k="System" /> {l.system}</span>
                <span>
                  <label className="sr-only" htmlFor={`count-${l.itemId}`}><Words k="Counted" /> {l.name}</label>
                  <input id={`count-${l.itemId}`} name={`count-${l.itemId}`} inputMode="numeric" disabled={!editable} value={counts[l.itemId] ?? ""} placeholder="Count"
                    onChange={(e) => setCounts((c) => ({ ...c, [l.itemId]: e.target.value.replace(/[^\d]/g, "") }))}
                    aria-invalid={err ? true : undefined}
                    className={cx("h-10 w-full rounded-xl border bg-surface px-3 text-right tnum text-[14.5px]", err ? "border-bad" : "border-line", !editable && "opacity-70")} />
                </span>
                <span className={cx("text-[13.5px] font-semibold tnum text-right", diff === null ? "text-ink3" : diff === 0 ? "text-ok" : "text-bad")}>
                  {diff === null ? "Not counted" : diff === 0 ? "Matches" : `${diff > 0 ? "+" : ""}${diff}`}
                </span>
                {diff !== null && diff !== 0 && editable && (
                  <span className="col-span-full">
                    <label className="sr-only" htmlFor={`note-${l.itemId}`}><Words k="Why" /> {l.name} <Words k="differs" /></label>
                    <input id={`note-${l.itemId}`} name={`note-${l.itemId}`} defaultValue={typed?.[`note-${l.itemId}`] ?? l.note} maxLength={200} placeholder="Why it differs (optional)"
                      className="h-9 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px]" />
                  </span>
                )}
                {err && <span className="col-span-full text-[12.5px] text-bad">{err}</span>}
              </li>
            );
          })}
        </ul>
        {state && !state.ok && state.message && !Object.keys(state.errors ?? {}).length && <p className="mx-5 mt-3 rounded-xl bg-bad/10 text-bad px-3.5 py-2.5 text-[13.5px]" role="alert">{state.message}</p>}
        {editable && (
          <div className="px-5 py-4 flex flex-wrap gap-2 justify-end border-t border-line mt-1">
            <Button type="submit" variant="secondary" loading={pending} name="submit" value="0"><Words k="Save counts" /></Button>
            <Button type="submit" variant="primary" loading={pending} name="submit" value="1">{changed.length ? `Send ${changed.length} difference${changed.length === 1 ? "" : "s"} for approval` : "Finish audit"}</Button>
          </div>
        )}
      </form>
    </FormResultProvider>
  );
}
