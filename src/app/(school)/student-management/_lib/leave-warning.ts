"use client";

// Asks before leaving a half-filled form (known issue B10: Add student lost what was typed when
// the clerk pressed a menu link). Same rule as the marks grid and the document designer: the
// browser asks on reload or close (beforeunload); a link inside the app asks with a plain
// question, since moving between pages does not raise beforeunload.
import { useEffect, type RefObject } from "react";
import { readForm } from "@/components/ui/form-draft";

export function useLeaveWarning(formRef: RefObject<HTMLFormElement | null>, question: string, formKey: string) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const start = JSON.stringify(readForm(form));
    const dirty = () => form.isConnected && JSON.stringify(readForm(form)) !== start;
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty()) e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("href")?.startsWith("#")) return;
      if (!dirty()) return;
      if (!window.confirm(question)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [formRef, question, formKey]);
}
