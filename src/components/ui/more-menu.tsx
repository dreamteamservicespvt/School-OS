"use client";

// The "..." menu on a record (design/ui-prototype/src/kit.jsx MoreMenu). Each item
// opens a page or a file; risky changes are confirmed on the page they open.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { cx } from "./cx";
import { buttonClass, type ButtonSize } from "./button";

export type MenuItem = { label: string; href: string; icon?: React.ReactNode; /** A file (PDF): opened directly. */ file?: boolean; tone?: "bad" };

export function MoreMenu({ items, label = "More actions", size = "md", className }: { items: MenuItem[]; label?: string; size?: ButtonSize; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  const itemCls = (tone?: "bad") => cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken focus:bg-sunken outline-none text-[14px] text-left [&>svg]:shrink-0", tone === "bad" ? "text-bad" : "[&>svg]:text-ink3");
  return (
    <div ref={ref} className={cx("relative", className)}>
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className={buttonClass("secondary", size, "!px-3")}>
        <Ellipsis size={size === "sm" ? 15 : 17} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className="absolute right-0 top-full mt-1.5 z-40 w-60 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
          {items.map((it) => it.file
            ? <a key={it.label} role="menuitem" href={it.href} className={itemCls(it.tone)} onClick={() => setOpen(false)}>{it.icon}{it.label}</a>
            : <Link key={it.label} role="menuitem" href={it.href} className={itemCls(it.tone)} onClick={() => setOpen(false)}>{it.icon}{it.label}</Link>)}
        </div>
      )}
    </div>
  );
}
