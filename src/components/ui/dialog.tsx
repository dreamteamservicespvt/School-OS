"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "@/components/icons";

/** A panel over the page for a short form. Full height on phones. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose}
      className={`m-auto max-h-[100dvh] w-full rounded-none border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-overlay sm:max-h-[90dvh] sm:rounded-2xl ${wide ? "sm:w-[min(44rem,calc(100vw-2rem))]" : "sm:w-[min(32rem,calc(100vw-2rem))]"}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-lg hover:bg-surface-2"><CloseIcon /></button>
      </div>
      <div className="p-5">{open && children}</div>
    </dialog>
  );
}
