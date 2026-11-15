"use client";

// A toast raised in the page itself (for example "cannot move on yet"), in the
// same dark pill as the saved-message toast.

import { useCallback, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "./cx";
import { useT } from "@/lib/i18n/client";
import { TOAST_PILL_CLS, ToastSlot, useAutoHide } from "./toast-stack";

export type Notice = { title: string; body?: string; tone?: "ok" | "bad" | "info" };

const ICON = { ok: CircleCheck, bad: TriangleAlert, info: Info };
const TONE = { ok: "text-ok", bad: "text-bad", info: "text-info" };

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const hide = useCallback(() => setNotice(null), []);
  const hold = useAutoHide(notice, 6000, hide);
  const show = useCallback((n: Notice) => setNotice(n), []);
  const view = notice ? <NoticeToast notice={notice} onClose={hide} hold={hold} /> : null;
  return { show, view };
}

function NoticeToast({ notice, onClose, hold }: { notice: Notice; onClose: () => void; hold: ReturnType<typeof useAutoHide> }) {
  const tr = useT();
  const tone = notice.tone ?? "ok";
  const I = ICON[tone];
  return (
    <ToastSlot>
      <div role={tone === "bad" ? "alert" : "status"} aria-live="polite" className={cx(TOAST_PILL_CLS, "items-start")} {...hold}>
        <I size={19} className={cx("shrink-0 mt-0.5 brightness-[1.4]", TONE[tone])} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{notice.title}</p>
          {notice.body && <p className="text-[13px] opacity-80 mt-0.5">{notice.body}</p>}
        </div>
        <button type="button" aria-label={tr.any("Close")} onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-bg/10 active:bg-bg/15 transition opacity-75"><X size={16} aria-hidden="true" /></button>
      </div>
    </ToastSlot>
  );
}
