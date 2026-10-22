"use client";

// The stock check scanner: a USB or Bluetooth scanner types each code and
// presses Enter (or the phone camera reads it); every scan is saved at once
// and shown at the top of the list, with a sound-free colour cue. Closing
// and marking missing copies lost are confirmed first.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleHelp, Copy as CopyIcon, ScanLine, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { ScanResult } from "@/lib/library/stock";
import { scanStockAction, closeStockAction, markMissingLostAction } from "../../../actions";
import { Words } from "@/lib/i18n/client";

type Line = { at: number; ok: boolean; kind: ScanResult["kind"] | "problem"; text: string };

export function StockScanner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const run = (fd: FormData) => start(async () => {
    const r = await scanStockAction(null, fd);
    setLines((l) => [{ at: Date.now(), ok: Boolean(r?.ok), kind: (r?.ok && r.data ? r.data.kind : "problem") as Line["kind"], text: r?.message ?? "" }, ...l].slice(0, 30));
    form.current?.reset();
    input.current?.focus();
    router.refresh();
  });
  const icon = { found: CheckCircle2, extra: TriangleAlert, unknown: CircleHelp, again: CopyIcon, problem: TriangleAlert };
  const tone = { found: "text-ok", extra: "text-warn", unknown: "text-warn", again: "text-ink3", problem: "text-bad" };
  return (
    <div className="flex flex-col gap-3">
      <form ref={form} action={run} className="flex gap-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <label htmlFor="stock-code" className="sr-only"><Words k="Book barcode or accession number" /></label>
        <div className="relative flex-1 min-w-0">
          <ScanLine size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input ref={input} id="stock-code" name="code" autoFocus autoComplete="off" spellCheck={false} placeholder="Scan each copy, or type its accession number"
            className={cx(inputCls(false), "h-12 pl-11 font-mono text-[15px]")} />
        </div>
        <Button type="submit" variant="primary" loading={pending} className="h-12"><Words k="Add" /></Button>
      </form>
      {lines.length > 0 && (
        <ul className="flex flex-col divide-y divide-line/70 rounded-xl border border-line" aria-live="polite" aria-label="Scanned just now">
          {lines.map((l) => {
            const I = icon[l.kind];
            return (
              <li key={l.at} className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13.5px]">
                <I size={17} className={cx("shrink-0", tone[l.kind])} aria-hidden="true" />
                <span className="min-w-0 truncate">{l.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CloseStockButton({ sessionId, notScanned }: { sessionId: string; notScanned: number }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Close stock check" triggerVariant="secondary" title="Close this stock check?" confirmLabel="Close stock check"
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("sessionId", sessionId);
        const r = await closeStockAction(null, fd);
        if (!r?.ok) return r?.message ?? "That did not work.";
        router.refresh();
      }}>
      {notScanned > 0 ? `${notScanned} cop${notScanned === 1 ? "y is" : "ies are"} not scanned yet and will be listed as missing. Nothing is marked lost until you review the list.` : "Every copy expected on the shelves has been scanned."}
    </ConfirmButton>
  );
}

export function MarkLostButton({ sessionId, count }: { sessionId: string; count: number }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Mark ${count} missing cop${count === 1 ? "y" : "ies"} lost`} triggerVariant="danger-outline" title="Mark the missing copies lost?" confirmLabel={`Mark ${count} cop${count === 1 ? "y" : "ies"} lost`} confirmVariant="danger"
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("sessionId", sessionId);
        const r = await markMissingLostAction(null, fd);
        if (!r?.ok) return r?.message ?? "That did not work.";
        router.refresh();
      }}>
      <Words k="The copies stay in the catalogue as Lost, with this stock check as the reason. No member is charged. A copy found later can be put back on the shelf from its book's page." />
    </ConfirmButton>
  );
}
