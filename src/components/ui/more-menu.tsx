"use client";

// The "..." menu on a record (design/ui-prototype/src/kit.jsx MoreMenu). Each item
// opens a page or a file, or (from a browser component) runs onClick, for example
// to open a sheet; risky changes are confirmed on the page or sheet they open.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { cx } from "./cx";
import { buttonClass, type ButtonSize } from "./button";
import { Floating } from "./floating";
import { useT } from "@/lib/i18n/client";

export type MenuItem = { label: string; href?: string; /** Runs instead of opening a page; only from a browser component. */ onClick?: () => void; icon?: React.ReactNode; /** A file (PDF): opened directly. */ file?: boolean; tone?: "bad" };

export function MoreMenu({ items, label: said = "More actions", size = "md", className }: { items: MenuItem[]; label?: string; size?: ButtonSize; className?: string }) {
  const t = useT();
  const label = t.any(said);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    // The menu is drawn in front of the page (./floating.tsx), so a click inside it is not inside `ref`.
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") { setOpen(false); ref.current?.querySelector("button")?.focus(); }
        return;
      }
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  // Arrow keys, Home and End move between the items; Tab closes the menu and goes back to its button.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") { e.preventDefault(); setOpen(false); ref.current?.querySelector("button")?.focus(); }
  };
  const itemCls = (tone?: "bad") => cx("w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken focus:bg-sunken outline-none text-[14px] text-left [&>svg]:shrink-0", tone === "bad" ? "text-bad" : "[&>svg]:text-ink3");
  return (
    <div ref={ref} className={cx("relative", className)}>
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className={buttonClass("secondary", size, "!px-3")}>
        <Ellipsis size={size === "sm" ? 15 : 17} aria-hidden="true" />
      </button>
      {open && (
        <Floating anchor={ref} panel={panel} focusFirst="[role=menuitem]" id={id} role="menu" aria-label={label} onKeyDown={onKeyDown} className="w-60 max-w-[calc(100vw-2rem)] bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
          {items.map((it) => !it.href
            ? <button key={it.label} type="button" role="menuitem" className={itemCls(it.tone)} onClick={() => { setOpen(false); it.onClick?.(); }}>{it.icon}{t.any(it.label)}</button>
            : it.file
              ? <a key={it.label} role="menuitem" href={it.href} className={itemCls(it.tone)} onClick={() => setOpen(false)}>{it.icon}{t.any(it.label)}</a>
              : <Link key={it.label} role="menuitem" href={it.href} className={itemCls(it.tone)} onClick={() => setOpen(false)}>{it.icon}{t.any(it.label)}</Link>)}
        </Floating>
      )}
    </div>
  );
}
