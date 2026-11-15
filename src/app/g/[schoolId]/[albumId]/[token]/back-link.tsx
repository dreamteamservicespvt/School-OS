"use client";

// "Back" on a shared album opened from Parent Link (the album link carries no Parent Link token,
// so it goes back in this browser's history). Hidden when the album was opened on its own.
import { useSyncExternalStore } from "react";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const noChanges = () => () => {};

export function BackLink() {
  const t = useT();
  // False on the server and in the first paint, then whether this tab has a page to go back to.
  const show = useSyncExternalStore(noChanges, () => window.history.length > 1, () => false);
  if (!show) return null;
  return (
    <button type="button" onClick={() => window.history.back()} className="self-start inline-flex h-10 items-center gap-1 rounded-xl bg-surface border border-line px-3 text-[13.5px] font-semibold text-brand shadow-card">
      <ChevronLeft size={16} aria-hidden="true" />{t("Back")}
    </button>
  );
}
