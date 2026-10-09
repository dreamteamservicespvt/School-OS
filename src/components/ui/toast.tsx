"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";

type Flash = { message: string; tone?: "success" | "info" | "danger"; link?: { href: string; label: string }; undo?: { kind: string; id: string } };

const TONE = { success: "border-success/40", info: "border-line", danger: "border-danger/40" };

/** Shows the last saved change for a few seconds; Undo stays for 10 seconds (P5). */
export function Toast({ flash, undoAction }: { flash: Flash | null; undoAction?: (kind: string, id: string) => Promise<void> }) {
  const [shown, setShown] = useState<Flash | null>(flash);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    document.cookie = "sos_flash=; Max-Age=0; path=/";
    if (!flash) return;
    const t = setTimeout(() => setShown(null), flash.undo ? 10000 : 6000);
    return () => clearTimeout(t);
  }, [flash]);

  if (!shown) return null;
  return (
    <div className="no-print fixed inset-x-3 bottom-20 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[26rem]" role="status" aria-live="polite">
      <div className={`toast-in flex items-start gap-3 rounded-xl border bg-surface p-4 shadow-pop ${TONE[shown.tone ?? "success"]}`}>
        <p className="flex-1">
          {shown.message}
          {shown.link && <> <Link href={shown.link.href} className="font-medium text-brand-text underline">{shown.link.label}</Link></>}
        </p>
        {shown.undo && undoAction && (
          <button type="button" disabled={undoing} className="min-h-9 rounded-lg px-2 font-semibold text-brand-text hover:bg-surface-2"
            onClick={async () => { setUndoing(true); await undoAction(shown.undo!.kind, shown.undo!.id); setShown(null); }}>
            Undo
          </button>
        )}
        <button type="button" aria-label="Close" onClick={() => setShown(null)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><CloseIcon className="size-4" /></button>
      </div>
    </div>
  );
}
