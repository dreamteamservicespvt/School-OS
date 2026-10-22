"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "./cx";
import { useT } from "@/lib/i18n/client";

type Flash = { message: string; tone?: "success" | "info" | "danger"; link?: { href: string; label: string }; undo?: { kind: string; id: string } };

const ICON = { success: CircleCheck, info: Info, danger: TriangleAlert };
const ICON_TONE = { success: "text-ok", info: "text-info", danger: "text-bad" };

/** The dark pill toast of the approved design. Undo stays for 10 seconds (P5). */
export function Toast({ flash, undoAction }: { flash: Flash | null; undoAction?: (kind: string, id: string) => Promise<void> }) {
  const t = useT();
  const [shown, setShown] = useState<Flash | null>(flash);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    document.cookie = "sos_flash=; Max-Age=0; path=/";
    if (!flash) return;
    const t = setTimeout(() => setShown(null), flash.undo ? 10000 : 6000);
    return () => clearTimeout(t);
  }, [flash]);

  if (!shown) return null;
  const tone = shown.tone ?? "success";
  const I = ICON[tone];
  return (
    <div className="no-print fixed z-[60] inset-x-0 bottom-24 lg:bottom-6 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      <div className="pointer-events-auto animate-rise flex items-center gap-3 max-w-md w-full md:w-auto bg-ink text-bg rounded-2xl pl-4 pr-2 py-2.5 shadow-pop">
        <I size={19} className={cx("shrink-0 brightness-[1.4]", ICON_TONE[tone])} aria-hidden="true" />
        <p className="text-sm font-semibold min-w-0 flex-1">
          {shown.message}
          {shown.link && <> <Link href={shown.link.href} className="underline underline-offset-2 opacity-90 hover:opacity-100">{shown.link.label}</Link></>}
        </p>
        {shown.undo && undoAction && (
          <button type="button" disabled={undoing} className="text-sm font-bold px-3 h-8 rounded-lg hover:bg-bg/10"
            onClick={async () => { setUndoing(true); await undoAction(shown.undo!.kind, shown.undo!.id); setShown(null); }}>
            {t("Undo")}
          </button>
        )}
        <button type="button" aria-label={t("Close")} onClick={() => setShown(null)} className="grid size-8 place-items-center rounded-lg hover:bg-bg/10 opacity-75"><X size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
