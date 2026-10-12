"use client";

// Export what is on screen as Excel, CSV or PDF (P8), in the approved button
// look. Plain links with `download`, so the file comes from the route handler.

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Sheet } from "lucide-react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

export function ExportMenu({ href, label = "Export", size = "md", print, className }: { href: string; label?: string; size?: ButtonSize; print?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const join = href.includes("?") ? "&" : "?";
  const items = [
    { f: "xlsx", l: "Excel", icon: FileSpreadsheet },
    { f: "csv", l: "CSV", icon: Sheet },
    { f: "pdf", l: "PDF", icon: FileText },
  ];
  const cls = "w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken focus:bg-sunken outline-none text-[14px]";
  return (
    <div className={cx("relative", className)} ref={ref}>
      <Button variant="secondary" size={size} icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}</Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" aria-label={label} className="absolute right-0 top-12 z-40 w-52 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
            {items.map(({ f, l, icon: Ic }) => (
              <a key={f} role="menuitem" href={`${href}${join}format=${f}`} download className={cls} onClick={() => setOpen(false)}>
                <Ic size={17} className="text-ink3" aria-hidden="true" />{l}
              </a>
            ))}
            {print && (
              <a role="menuitem" href={`${href}${join}format=pdf&print=1`} target="_blank" rel="noopener" className={cls} onClick={() => setOpen(false)}>
                <Printer size={17} className="text-ink3" aria-hidden="true" />Print
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
