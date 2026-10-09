"use client";

// The one Search box (00-global.md §1.1). This first version finds pages and
// shows recent pages, pinned pages and shortcuts for the person's role.
// Students, staff, parents and receipts join the results as each module is built.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClockIcon, CloseIcon, PinIcon, SearchIcon } from "@/components/icons";
import type { PageLink } from "./nav-data";
import { readList, recordRecent, storageKey } from "./local-lists";

export const OPEN_SEARCH_EVENT = "sos:open-search";

/** One letter wrong, missing or extra still matches (inferred: forgiving search). */
function nearlyStartsWith(word: string, typed: string) {
  if (word.startsWith(typed)) return true;
  if (typed.length < 4) return false;
  const a = word.slice(0, typed.length + 1);
  // Edit distance of at most 1 between typed and a prefix of word.
  const prev = Array.from({ length: a.length + 1 }, (_, j) => j);
  for (let i = 1; i <= typed.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= a.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (typed[i - 1] === a[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return Math.min(...prev.slice(Math.max(1, typed.length - 1))) <= 1;
}

/** Every typed word must start a word of the label, e.g. "fee man" finds Fee Management. */
export function matches(label: string, query: string) {
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => words.some((w) => nearlyStartsWith(w, t)));
}

type Props = { userId: string; pages: PageLink[]; shortcuts: PageLink[] };

export function SearchBox(props: Props) {
  // A new page starts with an empty, closed box.
  return <SearchBoxInner key={usePathname()} {...props} />;
}

function SearchBoxInner({ userId, pages, shortcuts }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [recent, setRecent] = useState<PageLink[]>([]);
  const [pinned, setPinned] = useState<PageLink[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const listId = useId();

  // Remember the pages this person opens.
  useEffect(() => {
    const page = pages.find((p) => p.href === pathname);
    if (page) recordRecent(userId, page);
  }, [pathname, pages, userId]);

  const refreshLists = useCallback(() => {
    setRecent(readList(storageKey(userId, "recent")));
    setPinned(readList(storageKey(userId, "pinned")));
  }, [userId]);

  // "/" puts the cursor in the box on computers (inferred).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const openPhone = () => { setPhone(true); setOpen(true); refreshLists(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, openPhone);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, openPhone); };
  }, [refreshLists]);

  useEffect(() => {
    if (!open || phone) return;
    const onClick = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, phone]);

  useEffect(() => { if (phone) inputRef.current?.focus(); }, [phone]);

  const typed = query.trim();
  const results = useMemo(() => (typed.length >= 2 ? pages.filter((p) => matches(p.label, typed)) : []), [pages, typed]);
  const groups: { title: string; icon?: React.ReactNode; items: PageLink[] }[] =
    typed.length >= 2
      ? [{ title: "Pages", items: results }]
      : [
          { title: "Pinned", icon: <PinIcon className="size-4" />, items: pinned },
          { title: "Recent", icon: <ClockIcon className="size-4" />, items: recent.filter((r) => !pinned.some((p) => p.href === r.href)).slice(0, 5) },
          { title: "Shortcuts", items: shortcuts },
        ].filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && flat[active]) { e.preventDefault(); router.push(flat[active].href); }
    else if (e.key === "Escape") { setOpen(false); setPhone(false); inputRef.current?.blur(); }
  }

  const panel = open && (
    <div id={listId} role="listbox" aria-label="Search results"
      className={phone ? "flex-1 overflow-y-auto p-3" : "absolute left-0 right-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg"}>
      {typed.length > 0 && typed.length < 2 && <p className="px-3 py-2 text-sm text-ink-2">Keep typing…</p>}
      {typed.length >= 2 && results.length === 0 && (
        <p className="px-3 py-2 text-sm text-ink-2">Nothing matches “{typed}”. Try a page name, such as Fee Management.</p>
      )}
      {typed.length === 0 && groups.length === 0 && <p className="px-3 py-2 text-sm text-ink-2">Type a page name to find it.</p>}
      {groups.map((g) => (
        <div key={g.title} className="mb-1">
          <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-2">{g.icon}{g.title}</p>
          {g.items.map((item) => {
            const index = flat.indexOf(item);
            return (
              <Link key={`${g.title}-${item.href}-${item.label}`} href={item.href} role="option" aria-selected={index === active}
                className={`flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 ${index === active ? "bg-brand-soft" : "hover:bg-surface-2"}`}
                onMouseEnter={() => setActive(index)}>
                <span>{item.label}</span>
                {item.hint && <span className="text-sm text-ink-2">{item.hint}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  const input = (
    <div className="relative flex items-center">
      <SearchIcon className="pointer-events-none absolute left-3 size-5 text-ink-2" />
      <input ref={inputRef} type="search" value={query} placeholder={phone ? "Search pages" : "Search pages, or press /"}
        aria-label="Search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        onFocus={() => { setOpen(true); refreshLists(); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-base placeholder:text-ink-2 focus:bg-surface" />
    </div>
  );

  if (phone) {
    // Rendered on the page body, so the top bar's blur cannot shrink it.
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Search">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="flex-1">{input}</div>
          <button type="button" onClick={() => { setPhone(false); setOpen(false); }} className="grid size-11 place-items-center rounded-lg hover:bg-surface-2" aria-label="Close search">
            <CloseIcon />
          </button>
        </div>
        {panel}
      </div>,
      document.body,
    );
  }

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-xl sm:block">
      {input}
      {panel}
    </div>
  );
}
