"use client";

// The one Search box (00-global.md §1.1), as the approved design's command palette:
// students, staff and pages, plus recent and pinned pages and the person's quick actions.

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/display";
import type { PageLink } from "./nav-data";
import type { Quick } from "./nav-config";
import { readList, recordRecent, storageKey } from "./local-lists";
import { typedKey } from "./typed-key";
import { askHref, closestQuestions, isQuestionKey, looksLikeQuestion, matchIntent, questionTitle, type QuestionKey } from "@/lib/ask/questions";

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

type Person = { id: string; name: string; sub: string; href: string };
type Row = { sec: string; label: string; sub?: string; href: string; icon?: LucideIcon; avatar?: string };

/** Remembers the pages this person opens, for "Recent". */
export function RecentPages({ userId, pages }: { userId: string; pages: PageLink[] }) {
  const pathname = usePathname();
  useEffect(() => {
    const page = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
    if (page && pathname === page.href) recordRecent(userId, page);
  }, [pathname, pages, userId]);
  return null;
}

type PaletteProps = {
  open: boolean; onClose: () => void; userId: string; pages: PageLink[]; shortcuts: PageLink[]; quick: Quick[];
  /** Ready-made questions for the person's role (gap list G27), and every question they may ask. */
  questions?: PageLink[]; askKeys?: QuestionKey[];
  /** Ask and Do with the AI service is on for this person; off, nothing AI shows (00-global.md §2.1 rule 8). */
  ai?: boolean;
};

export function CommandPalette(props: PaletteProps) {
  // Mounted fresh each time it opens, so it always starts empty.
  return props.open ? <Palette {...props} /> : null;
}

const NO_KEYS: QuestionKey[] = [];
const NO_LINKS: PageLink[] = [];

function Palette({ onClose, userId, pages, shortcuts, quick, questions = NO_LINKS, askKeys = NO_KEYS }: Omit<PaletteProps, "open">) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [found, setFound] = useState<{ q: string; collect: Person[]; students: Person[]; staff: Person[]; parents: Person[]; receipts: Person[]; problem: string | null }>({ q: "", collect: [], students: [], staff: [], parents: [], receipts: [], problem: null });
  const [lists] = useState(() => ({ recent: readList(storageKey(userId, "recent")), pinned: readList(storageKey(userId, "pinned")) }));
  const inp = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // The box takes the keys at once (QA SEARCH-01): focus it before the browser paints, and any
  // letter pressed while focus is still elsewhere (the search bar just clicked) goes into the box.
  useLayoutEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (document.activeElement !== inp.current) inp.current?.focus(); }, 40);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const early = (e: KeyboardEvent) => {
      const ch = typedKey(e);
      // Only while focus is still outside the palette; inside it, keys do what they normally do.
      if (!ch || !inp.current || box.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setQ((v) => v + ch);
      setSel(0);
      inp.current.focus();
    };
    window.addEventListener("keydown", k);
    window.addEventListener("keydown", early, true);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); window.removeEventListener("keydown", early, true); };
  }, [onClose]);

  // People come from the server, only those this person may open.
  const typed = q.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(typed)}`, { signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok) setFound({ q: typed, collect: [], students: [], staff: [], parents: [], receipts: [], problem: body.problem ?? "Search did not work. Try again." });
        else setFound({ q: typed, collect: body.collect ?? [], students: body.students ?? [], staff: body.staff ?? [], parents: body.parents ?? [], receipts: body.receipts ?? [], problem: null });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFound({ q: typed, collect: [], students: [], staff: [], parents: [], receipts: [], problem: "Search needs the internet. Check the connection and try again." });
      }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [typed]);
  const loading = typed.length >= 2 && found.q !== typed;
  const people = useMemo(() => (found.q === typed ? found : { collect: [] as Person[], students: [] as Person[], staff: [] as Person[], parents: [] as Person[], receipts: [] as Person[] }), [found, typed]);
  const problem = found.q === typed ? found.problem : null;

  const results = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (typed.length < 2) {
      quick.slice(0, 4).forEach((x) => out.push({ sec: "Quick actions", label: x.label, sub: x.sub, href: x.href, icon: (I as unknown as Record<string, LucideIcon>)[x.icon] }));
      lists.pinned.forEach((p) => out.push({ sec: "Pinned", label: p.label, href: p.href, icon: I.Pin }));
      lists.recent.filter((r) => !lists.pinned.some((p) => p.href === r.href)).slice(0, 5).forEach((p) => out.push({ sec: "Recent", label: p.label, href: p.href, icon: I.Clock }));
      shortcuts.filter((s) => !quick.some((x) => x.label === s.label)).forEach((s) => out.push({ sec: "Shortcuts", label: s.label, href: s.href, icon: I.CornerDownRight }));
      // Below the shortcuts: questions for the person's role, each answered from its own list (00-global.md §2).
      questions.forEach((x) => out.push({ sec: "Questions", label: x.label, href: x.href, icon: I.CircleHelp }));
      return out;
    }
    // Search by intent (gap list G27): "absent today", "fees due class 5", "late staff" open a ready-made
    // question with its class and dates filled in, answered from the list itself.
    const asked = typed.length >= 3 ? matchIntent(typed, askKeys).slice(0, 3) : [];
    asked.forEach((m) => out.push({ sec: "Questions", label: m.title, href: m.href, icon: I.CircleHelp }));
    // "fee Ravi": Collect Fee for each Ravi, first.
    people.collect.forEach((s) => out.push({ sec: "Collect fee", label: s.name, sub: s.sub, href: s.href, icon: I.IndianRupee }));
    people.students.forEach((s) => out.push({ sec: "Students", label: s.name, sub: s.sub, href: s.href, avatar: s.name }));
    people.staff.forEach((s) => out.push({ sec: "Staff", label: s.name, sub: s.sub, href: s.href, avatar: s.name }));
    people.parents.forEach((s) => out.push({ sec: "Parents", label: s.name, sub: s.sub, href: s.href, avatar: s.name }));
    people.receipts.forEach((s) => out.push({ sec: "Receipts", label: s.name, sub: s.sub, href: s.href, icon: I.ReceiptText }));
    quick.filter((x) => matches(x.label, typed)).forEach((x) => out.push({ sec: "Quick actions", label: x.label, sub: x.sub, href: x.href, icon: (I as unknown as Record<string, LucideIcon>)[x.icon] }));
    pages.filter((p) => matches(p.label, typed)).slice(0, 8).forEach((p) => out.push({ sec: "Pages", label: p.label, sub: p.hint ?? "Open", href: p.href, icon: I.FileText }));
    // A question no ready-made one matches: the closest ones the person may ask.
    if (!asked.length && askKeys.length && looksLikeQuestion(typed)) {
      const ready = questions.map((x) => new URLSearchParams(x.href.split("?")[1] ?? "").get("q")).filter(isQuestionKey);
      closestQuestions(typed, askKeys, ready).forEach((k) => out.push({ sec: "Closest questions", label: questionTitle(k), href: askHref(k), icon: I.CircleHelp }));
    }
    return out;
  }, [typed, people, pages, shortcuts, quick, lists, questions, askKeys]);

  const choose = useCallback((r: Row) => { onClose(); router.push(r.href); }, [onClose, router]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[sel]) { e.preventDefault(); choose(results[sel]); }
  };

  let lastSec: string | null = null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start md:pt-[10vh]">
      <div className="absolute inset-0 bg-shade/45 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden="true" />
      <div ref={box} role="dialog" aria-modal="true" aria-label="Search"
        className="relative w-full h-full md:h-auto md:max-w-2xl bg-surface md:rounded-2xl shadow-pop animate-rise flex flex-col md:max-h-[70vh] md:mx-6">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line shrink-0">
          {loading ? <I.LoaderCircle size={20} className="text-ink3 animate-spin" aria-hidden="true" /> : <I.Search size={20} className="text-ink3" aria-hidden="true" />}
          <input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} type="search"
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="Search"
            aria-activedescendant={results[sel] ? `cmdk-${sel}` : undefined}
            placeholder="Search a student, parent, staff member, receipt or page"
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-ink3 min-w-0 [&::-webkit-search-cancel-button]:hidden" />
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink2 px-2 h-8 rounded-lg hover:bg-sunken">
            <span className="md:hidden">Cancel</span><span className="hidden md:inline"><Kbd>Esc</Kbd></span>
          </button>
        </div>
        <div id="cmdk-list" role="listbox" aria-label="Search results" className="overflow-y-auto scroll-thin p-2 flex-1">
          {problem && <p role="alert" className="mx-3 my-2 rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{problem}</p>}
          {typed.length >= 2 && !loading && results.length === 0 && !problem && (
            <div className="text-center py-12 px-6">
              <p className="font-semibold">Nothing found for “{typed}”</p>
              <p className="text-sm text-ink3 mt-1">Check the spelling, or search by admission number or parent phone.</p>
            </div>
          )}
          {typed.length < 2 && results.length === 0 && (
            <p className="text-center py-12 px-6 text-sm text-ink3">Type at least two letters of a name, an admission number, a phone number or a page.</p>
          )}
          {results.map((r, i) => {
            const head = r.sec !== lastSec ? (lastSec = r.sec) : null;
            const Ic = r.icon ?? I.Circle;
            return (
              <Fragment key={`${r.sec}-${r.href}-${r.label}`}>
                {head && <p className="eyebrow text-ink3 px-3 pt-3 pb-1.5">{head}</p>}
                <button id={`cmdk-${i}`} type="button" role="option" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => choose(r)}
                  className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", sel === i && "bg-sunken")}>
                  {r.avatar ? <Avatar name={r.avatar} size={34} /> : (
                    <span className={cx("w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0", sel === i ? "bg-brand text-brandink" : "bg-sunken text-ink2")}><Ic size={17} aria-hidden="true" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold truncate">{r.label}</span>
                    {r.sub && <span className="block text-[12.5px] text-ink3 truncate">{r.sub}</span>}
                  </span>
                  {sel === i && <I.CornerDownLeft size={16} className="text-ink3 hidden md:block" aria-hidden="true" />}
                </button>
              </Fragment>
            );
          })}
        </div>
        <div className="hidden md:flex items-center gap-4 px-4 h-11 border-t border-line text-xs text-ink3 shrink-0">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> open</span>
          <span className="ml-auto">Only shows what your role is allowed to see</span>
        </div>
      </div>
    </div>
  );
}
