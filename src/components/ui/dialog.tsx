"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";

/** Dialog on a computer, bottom sheet on a phone (design/ui-prototype/src/ui.jsx Sheet). */
export const sheetCls = (wide?: boolean) => cx(
  "p-0 text-ink bg-surface shadow-pop outline-none backdrop:bg-shade/45 backdrop:backdrop-blur-[2px] open:animate-sheet",
  "fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[92dvh] rounded-t-3xl",
  "md:inset-0 md:m-auto md:rounded-2xl md:max-h-[88dvh]",
  wide ? "md:w-[min(42rem,calc(100vw-3rem))]" : "md:w-[min(28rem,calc(100vw-3rem))]",
);

export function SheetHead({ titleId, title, sub, onClose }: { titleId: string; title: React.ReactNode; sub?: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-line" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display font-semibold text-lg leading-tight">{title}</h2>
          {sub && <p className="text-sm text-ink3 mt-1">{sub}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          className="inline-flex items-center justify-center rounded-xl text-ink2 hover:bg-sunken hover:text-ink transition shrink-0 size-9">
          <X size={19} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

/** A panel over the page for a short form. */
/**
 * The browser fires "close" on a <dialog> however it closes: Escape, or our own
 * d.close() after the parent set open to false. Only the first is the person
 * closing it; telling the parent about the second undoes what the parent just
 * did (a two-step flow that swaps this dialog for a confirm sheet would close
 * the sheet at once).
 */
export function closedByPerson(openProp: boolean) {
  return openProp;
}

export function Dialog({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: string; sub?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const openNow = useRef(open);
  const titleId = useId();
  useEffect(() => {
    openNow.current = open;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={() => { if (closedByPerson(openNow.current)) onClose(); }} className={sheetCls(wide)}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[inherit] flex-col">
        <SheetHead titleId={titleId} title={title} sub={sub} onClose={onClose} />
        <div className="overflow-y-auto scroll-thin px-5 pb-5">{open && children}</div>
        {footer && <div className="border-t border-line px-5 py-3.5 flex gap-2 justify-end">{footer}</div>}
      </div>
    </dialog>
  );
}
