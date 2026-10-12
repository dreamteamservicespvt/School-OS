"use client";

// A toast raised in the page itself (for example "cannot move on yet"), in the
// same dark pill as the saved-message toast.

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "./cx";

export type Notice = { title: string; body?: string; tone?: "ok" | "bad" | "info" };

const ICON = { ok: CircleCheck, bad: TriangleAlert, info: Info };
const TONE = { ok: "text-ok", bad: "text-bad", info: "text-info" };

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const show = useCallback((n: Notice) => setNotice(n), []);
  const view = notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null;
  return { show, view };
}

function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const tone = notice.tone ?? "ok";
  const I = ICON[tone];
  return (
    <div className="no-print fixed z-[60] inset-x-0 bottom-24 lg:bottom-6 flex justify-center px-4 pointer-events-none" role={tone === "bad" ? "alert" : "status"} aria-live="polite">
      <div className="pointer-events-auto animate-rise flex items-start gap-3 max-w-md w-full md:w-auto bg-ink text-bg rounded-2xl pl-4 pr-2 py-2.5 shadow-pop">
        <I size={19} className={cx("shrink-0 mt-0.5 brightness-[1.4]", TONE[tone])} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{notice.title}</p>
          {notice.body && <p className="text-[13px] opacity-80 mt-0.5">{notice.body}</p>}
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-bg/10 opacity-75"><X size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
