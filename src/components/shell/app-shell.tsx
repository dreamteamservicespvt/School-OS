"use client";

// The app frame of the approved design (design/ui-prototype/src/shell.jsx): a quiet sidebar,
// a top bar with the one Search box, the phone bar with "More", "New" quick actions,
// notifications and the profile menu.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Avatar } from "@/components/ui/avatar";
import { IconButton, IconLink } from "@/components/ui/button";
import { Kbd } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { SheetHead } from "@/components/ui/dialog";
import { markAllNotificationsRead, openNotification, setAppearance, signOut, switchSchool } from "@/app/(school)/actions";
import { Logo } from "./logo";
import { useT } from "@/lib/i18n/client";
import { NAV_GROUPS, type BarItem, type IconName, type Quick } from "./nav-config";
import { CommandPalette, OPEN_SEARCH_EVENT } from "./search-box";
import type { PageLink } from "./nav-data";
import type { QuestionKey } from "@/lib/ask/questions";

export type ShellNote = { id: string; text: string; when: string; unread: boolean };
export type ShellProps = {
  school: { id: string; name: string; place: string };
  schools: { id: string; name: string }[];
  year: { name: string; closed: boolean } | null;
  person: { id: string; name: string; role: string; photo?: string | null };
  menu: string[];
  /** Where a module's link opens when not at its own address (shellData landingFor). */
  landing?: Record<string, string>;
  bottom: BarItem[];
  quick: Quick[];
  pages: PageLink[];
  shortcuts: PageLink[];
  /** Ready-made questions for the empty Search box (gap list G27), and every question this person may ask. */
  questions?: PageLink[];
  askKeys?: QuestionKey[];
  approvals: number;
  canApprove: boolean;
  canMessage: boolean;
  unread: number;
  notes: ShellNote[];
  theme: string;
  /** While DREAM TEAM looks inside the school (07-super-admin.md §3.4): the profile menu only offers to end it. */
  support?: { ends: string } | null;
  /**
   * Ask and Do is on for this person (aiAllowed with "ai-ask-do"). Off, the box is a plain Search box and
   * no AI label shows anywhere (00-global.md §2.1 rule 8).
   */
  ai?: boolean;
  children: React.ReactNode;
};

const icon = (name: IconName | string): LucideIcon => ((I as unknown as Record<string, LucideIcon>)[name] ?? I.Circle);

const yearLabel = (name: string) => name.replace(/-/g, "–");

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Closes a popover on Escape and puts focus back where it was. */
function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); back?.focus?.(); };
  }, [open, close]);
}

/** Keeps Tab and Shift+Tab inside an open sheet or menu, as a modal should; can move focus to its first control. */
function useTrap(ref: React.RefObject<HTMLDivElement | null>, open: boolean, focusFirst = false) {
  useEffect(() => {
    if (!open) return;
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter((el) => el.offsetParent !== null);
    if (focusFirst) setTimeout(() => items()[0]?.focus(), 30);
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1], at = document.activeElement;
      if (!ref.current.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (at === first || at === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ref, open, focusFirst]);
}

/* ---------- A sheet over the page: dialog on a computer, bottom sheet on a phone ---------- */
function Sheet({ open, onClose, title, sub, children, wide }: { open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 30); }, [open]);
  useTrap(ref, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-shade/45 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("relative bg-surface w-full max-h-[92dvh] flex flex-col rounded-t-3xl md:rounded-2xl shadow-pop animate-sheet outline-none", wide ? "md:max-w-2xl" : "md:max-w-md")}>
        <SheetHead titleId={titleId} title={title} sub={sub} onClose={onClose} />
        <div className="overflow-y-auto scroll-thin px-5 pb-5" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- Sidebar (computer and tablet) ---------- */
function Sidebar({ school, schools, menu, landing = {}, quick, ai, onQuick, onSwitch, onAsk }: Pick<ShellProps, "school" | "schools" | "menu" | "landing" | "quick" | "ai"> & { onQuick: () => void; onSwitch: () => void; onAsk: () => void }) {
  const t = useT();
  const isOn = useActive();
  const visible = new Set(menu);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => visible.has(i.key)) })).filter((g) => g.items.length);
  const multi = schools.length > 1;
  return (
    <aside className="hidden md:flex flex-col shrink-0 sticky top-0 h-dvh border-r border-line bg-surface w-[76px] lg:w-[268px] z-30 no-print">
      <button type="button" onClick={multi ? onSwitch : undefined} title={multi ? t("Switch school or campus") : school.name}
        className={cx("h-16 flex items-center gap-3 px-[18px] shrink-0 text-left", !multi && "cursor-default")}>
        <Logo />
        <span className="min-w-0 hidden lg:block">
          <span className="block font-display font-semibold text-[15px] leading-tight truncate">{school.name}</span>
          {school.place && <span className="block text-xs text-ink3 truncate">{school.place}</span>}
        </span>
      </button>
      {quick.length > 0 && (
        <div className="px-3.5 pb-2 pt-1">
          <button type="button" onClick={onQuick} title={t("Quick actions")}
            className="w-full h-11 rounded-xl bg-brand text-brandink font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-sm transition">
            <I.Plus size={19} strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden lg:inline">{t("New")}</span>
            <span className="sr-only lg:hidden">{t("New")}</span>
          </button>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-4" aria-label={t("Main menu")}>
        {groups.map((g, gi) => (
          <div key={gi} className="pt-3">
            {g.group && <p className="eyebrow text-ink3 px-3 pb-1.5 hidden lg:block">{t.any(g.group)}</p>}
            {g.group && <div className="mx-3 mb-2 border-t border-line lg:hidden" aria-hidden="true" />}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const Ic = icon(it.icon);
                const href = `/${it.key}`;
                const on = isOn(href);
                return (
                  <li key={it.key}>
                    <Link href={landing[it.key] ?? href} title={t.any(it.label)} aria-current={on ? "page" : undefined}
                      className={cx("group w-full h-10 rounded-xl flex items-center gap-3 px-3 text-[14px] font-medium transition relative justify-center lg:justify-start",
                        on ? "bg-brand/10 text-brand font-semibold" : "text-ink2 hover:bg-sunken hover:text-ink")}>
                      {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand -ml-3" aria-hidden="true" />}
                      <Ic size={19} strokeWidth={on ? 2.3 : 2} className="shrink-0" aria-hidden="true" />
                      <span className="truncate hidden lg:inline">{t.any(it.label)}</span>
                      <span className="sr-only lg:hidden">{t.any(it.label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <button type="button" onClick={onAsk} className="m-3 p-3.5 rounded-2xl bg-sunken text-left hidden lg:block hover:bg-line/60 transition">
        {ai
          ? <span className="text-[13px] font-semibold flex items-center gap-2"><I.Sparkles size={15} className="text-brand" aria-hidden="true" />{t("Ask School OS")}</span>
          : <span className="text-[13px] font-semibold flex items-center gap-2"><I.Search size={15} className="text-brand" aria-hidden="true" />{t("Search")}</span>}
        <span className="block text-xs text-ink3 mt-1 leading-relaxed">{t("Type what you want, like a student's name, an admission number or a page.")}</span>
      </button>
    </aside>
  );
}

/* ---------- Top bar ---------- */
function TopBar({ school, year, person, approvals, canApprove, canMessage, unread, theme, ai, onSearch, onNotif, onProfile, title }: Pick<ShellProps, "school" | "year" | "person" | "approvals" | "canApprove" | "canMessage" | "unread" | "theme" | "ai"> & { onSearch: () => void; onNotif: () => void; onProfile: () => void; title: string }) {
  const t = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const t = document.documentElement.getAttribute("data-theme");
      setDark(t === "dark" || (t === "system" && m.matches));
    };
    read();
    m.addEventListener("change", read);
    return () => m.removeEventListener("change", read);
  }, [theme]);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setDark(!dark);
    const fd = new FormData();
    fd.set("theme", next);
    void setAppearance(fd);
  };
  return (
    <header className="sticky top-0 h-16 shrink-0 flex items-center gap-2 px-3 md:px-5 border-b border-line bg-surface/85 backdrop-blur-md z-20 no-print">
      {/* Phone: logo and title */}
      <Link href="/dashboard" className="md:hidden flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <Logo size={34} />
        <span className="min-w-0">
          <span className="block font-display font-semibold text-[15px] leading-tight truncate">{title || school.name}</span>
          <span className="block text-[11.5px] text-ink3 truncate">{school.name}{year ? ` · ${yearLabel(year.name)}` : ""}</span>
        </span>
      </Link>
      {/* Computer: search */}
      <button type="button" onClick={onSearch}
        className="hidden md:flex items-center gap-3 h-11 flex-1 min-w-0 max-w-xl rounded-xl bg-sunken border border-transparent hover:border-line px-3.5 text-ink3 text-[14.5px] transition">
        <I.Search size={18} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{ai ? t("Search students, staff, pages… or ask a question") : t("Search students, staff, pages…")}</span>
        <span className="ml-auto hidden xl:flex gap-1 shrink-0"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1 hidden xl:block" />
      <Link href="/academic-management/settings" title={year ? t("Academic year {year}", { year: year.name }) : t("Open an academic year in Academic Settings")}
        className={cx("hidden lg:inline-flex shrink-0 whitespace-nowrap items-center gap-2 h-9 px-3 rounded-xl border text-[13px] font-semibold hover:bg-sunken tnum", year?.closed ? "border-warn/50 text-warn" : "border-line text-ink2")}>
        <I.CalendarRange size={16} aria-hidden="true" /> {year ? yearLabel(year.name) : t("No year yet")}
      </Link>
      <IconButton className="md:hidden" icon={I.Search} label={t("Search")} onClick={onSearch} />
      {canApprove && <IconLink className="hidden md:inline-flex" href="/approvals" icon={I.ListChecks} label={t("Approvals waiting")} badge={approvals} />}
      {canMessage && <IconLink className="hidden md:inline-flex" href="/messages" icon={I.MessageCircle} label={t("Messages")} />}
      <IconButton icon={I.Bell} label={t("Notifications")} badge={unread} onClick={onNotif} />
      <IconButton className="hidden md:inline-flex" icon={dark ? I.Sun : I.Moon} label={dark ? t("Switch to light mode") : t("Switch to dark mode")} onClick={flip} />
      <button type="button" onClick={onProfile} className="ml-1 shrink-0 flex items-center gap-2.5 rounded-xl hover:bg-sunken p-1 lg:pr-3 transition" aria-label={t("Your profile and settings")}>
        <Avatar name={person.name} size={34} src={person.photo} />
        <span className="hidden lg:block text-left">
          <span className="block text-[13.5px] font-semibold leading-tight max-w-[10rem] truncate">{person.name}</span>
          <span className="block text-xs text-ink3 max-w-[10rem] truncate">{person.role}</span>
        </span>
      </button>
    </header>
  );
}

/* ---------- Bottom bar (phone) ---------- */
function BottomNav({ items, onMore }: { items: BarItem[]; onMore: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const exact = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`) && !items.some((o) => o.href !== href && o.href.startsWith(href) && pathname.startsWith(o.href)));
  const moreOn = !items.some((it) => exact(it.href));
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur-md px-2 pt-1.5 z-30 no-print" style={{ paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }} aria-label={t("Quick menu")}>
      {/* As many columns as there are items, so a short bar has no gaps. */}
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4) + 1}, minmax(0, 1fr))` }}>
        {items.slice(0, 4).map((it) => {
          const on = exact(it.href);
          const Ic = icon(it.icon);
          return (
            <li key={it.href + it.label} className="flex justify-center">
              <Link href={it.href} aria-current={on ? "page" : undefined}
                className={cx("flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold", on ? "text-brand" : "text-ink3")}>
                {it.big ? (
                  <span className={cx("w-12 h-9 -mt-0.5 rounded-2xl grid place-items-center transition", on ? "bg-brand text-brandink" : "bg-brand/12 text-brand")}>
                    <Ic size={20} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                ) : (
                  <span className={cx("w-14 h-8 rounded-full grid place-items-center transition", on && "bg-brand/12")}>
                    <Ic size={21} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
                  </span>
                )}
                {t.any(it.label)}
              </Link>
            </li>
          );
        })}
        <li className="flex justify-center">
          <button type="button" onClick={onMore} className={cx("flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold", moreOn ? "text-brand" : "text-ink3")}>
            <span className={cx("w-14 h-8 rounded-full grid place-items-center", moreOn && "bg-brand/12")}><I.LayoutGrid size={21} aria-hidden="true" /></span>
            {t("More")}
          </button>
        </li>
      </ul>
    </nav>
  );
}

/* ---------- "More" on a phone: every module as a big tile ---------- */
function MoreSheet({ open, onClose, menu, landing = {} }: { open: boolean; onClose: () => void; menu: string[]; landing?: Record<string, string> }) {
  const t = useT();
  const visible = new Set(menu);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => visible.has(i.key)) })).filter((g) => g.items.length);
  return (
    <Sheet open={open} onClose={onClose} title={t("All modules")} sub={t("Tap any module to open it")}>
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.group ?? "home"}>
            {g.group && <p className="eyebrow text-ink3 mb-2">{t.any(g.group)}</p>}
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((it) => {
                const Ic = icon(it.icon);
                return (
                  <Link key={it.key} href={landing[it.key] ?? `/${it.key}`} onClick={onClose}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-sunken hover:bg-line/60 px-2 py-3.5 text-center">
                    <span className="w-10 h-10 rounded-xl bg-surface text-brand grid place-items-center shadow-card"><Ic size={20} aria-hidden="true" /></span>
                    <span className="text-[12px] font-semibold leading-tight">{t.lang === "en" ? it.label.replace(" Management", "") : t.any(it.label)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <p className="eyebrow text-ink3 mb-2">{t("You")}</p>
          <div className="grid grid-cols-3 gap-2">
            {[["/approvals", "Approvals", "ListChecks"], ["/messages", "Messages", "MessageCircle"], ["/profile", "My profile", "UserCog"]].map(([href, label, ic]) => {
              const Ic = icon(ic);
              return (
                <Link key={href} href={href} onClick={onClose} className="flex flex-col items-center gap-2 rounded-2xl bg-sunken hover:bg-line/60 px-2 py-3.5 text-center">
                  <span className="w-10 h-10 rounded-xl bg-surface text-brand grid place-items-center shadow-card"><Ic size={20} aria-hidden="true" /></span>
                  <span className="text-[12px] font-semibold leading-tight">{t.any(label)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Quick actions ("New") ---------- */
function QuickSheet({ open, onClose, quick }: { open: boolean; onClose: () => void; quick: Quick[] }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("What do you want to do?")}>
      <div className="grid sm:grid-cols-2 gap-2">
        {quick.map((q) => {
          const Ic = icon(q.icon);
          return (
            <Link key={q.label} href={q.href} onClick={onClose}
              className="flex items-center gap-3 text-left p-3 rounded-2xl border border-line hover:border-brand/40 hover:bg-brand/5 transition">
              <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={21} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-[14.5px]">{t.any(q.label)}</span>
                <span className="block text-[12.5px] text-ink3">{t.any(q.sub)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------- Notifications ---------- */
function NotifPanel({ open, onClose, notes, total }: { open: boolean; onClose: () => void; notes: ShellNote[]; total: number }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useTrap(ref, open, true);
  if (!open) return null;
  const unread = Math.max(total, notes.filter((n) => n.unread).length);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-shade/35 md:bg-transparent animate-fade" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("Notifications")}
        className="absolute inset-x-0 bottom-0 md:bottom-auto md:left-auto md:right-4 md:top-[68px] md:w-[400px] bg-surface rounded-t-3xl md:rounded-2xl shadow-pop border border-line animate-sheet max-h-[85dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="font-display font-semibold text-lg">{t("Notifications")}</h2>
            <p className="text-[13px] text-ink3">{unread ? t("{count} new", { count: unread }) : t("You are all caught up")}</p>
          </div>
          {unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink">
                <I.CheckCheck size={15} aria-hidden="true" />{t("Mark all read")}
              </button>
            </form>
          )}
        </div>
        <ul className="overflow-y-auto scroll-thin px-2 pb-2">
          {notes.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink3">{t("Alerts meant for you, like requests waiting for your approval, appear here.")}</li>}
          {notes.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="w-full text-left flex gap-3 px-3 py-3 rounded-xl hover:bg-sunken">
                  <span className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", n.unread ? "bg-brand" : "bg-transparent")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {n.unread && <span className="sr-only">{t("Unread.")} </span>}
                    <span className={cx("block text-[14px] leading-snug", n.unread ? "font-semibold" : "text-ink2")}>{n.text}</span>
                  </span>
                  <span className="text-[11.5px] text-ink3 whitespace-nowrap">{n.when}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-2">
          <Link href="/notifications" onClick={onClose} className="flex items-center justify-center h-10 rounded-xl text-[13.5px] font-semibold text-brand hover:bg-brand/5">{t("See all notifications")}</Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- Profile menu ---------- */
function ProfileMenu({ open, onClose, person, school, schools, theme, onSwitch, support }: Pick<ShellProps, "person" | "school" | "schools" | "theme" | "support"> & { open: boolean; onClose: () => void; onSwitch: () => void }) {
  const t = useT();
  const [mode, setMode] = useState(theme);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useTrap(ref, open, true);
  if (!open) return null;
  const choose = (v: string) => {
    setMode(v);
    document.documentElement.setAttribute("data-theme", v);
    const fd = new FormData();
    fd.set("theme", v);
    void setAppearance(fd);
  };
  const row = "w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left";
  return (
    <div className="fixed inset-0 z-50" data-scroll-lock>
      <div className="absolute inset-0 bg-shade/35 md:bg-transparent animate-fade" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="menu" aria-label={t("Your profile and settings")} className="absolute inset-x-0 bottom-0 md:bottom-auto md:left-auto md:right-4 md:top-[68px] md:w-[320px] bg-surface rounded-t-3xl md:rounded-2xl shadow-pop border border-line animate-sheet p-2" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center gap-3 p-3">
          <Avatar name={person.name} size={44} src={person.photo} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{person.name}</p>
            <p className="text-[13px] text-ink3 truncate">{person.role} · {school.name}</p>
          </div>
        </div>
        {support ? (
          <>
            <p className="px-3 pb-2 text-[13px] text-ink2">{t("DREAM TEAM support access, for looking only. It ends by itself at {time}.", { time: support.ends })}</p>
            <div className="border-t border-line my-1" />
            <form method="post" action="/support/end">
              <button role="menuitem" type="submit" className={cx(row, "text-bad")}><I.LogOut size={18} aria-hidden="true" />{t("End support access now")}</button>
            </form>
          </>
        ) : <>
        <div className="px-3 py-2">
          <p className="eyebrow text-ink3 mb-2">{t("Mode")}</p>
          <Segmented className="grid grid-cols-3 w-full" value={mode} onChange={choose} label={t("Light or dark")}
            options={[{ value: "light", label: t("Light"), icon: I.Sun }, { value: "dark", label: t("Dark"), icon: I.Moon }, { value: "system", label: t("Auto"), icon: I.MonitorSmartphone }]} />
        </div>
        <div className="border-t border-line my-1" />
        <Link role="menuitem" href="/profile/appearance" onClick={onClose} className={row}><I.Palette size={18} className="text-ink3" aria-hidden="true" />{t("Colours and text size")}</Link>
        <Link role="menuitem" href="/profile" onClick={onClose} className={row}><I.UserCog size={18} className="text-ink3" aria-hidden="true" />{t("My profile, password and language")}</Link>
        <Link role="menuitem" href="/profile#devices" onClick={onClose} className={row}><I.MonitorSmartphone size={18} className="text-ink3" aria-hidden="true" />{t("Signed-in devices")}</Link>
        {schools.length > 1 && <button role="menuitem" type="button" className={row} onClick={() => { onClose(); onSwitch(); }}><I.ArrowRightLeft size={18} className="text-ink3" aria-hidden="true" />{t("Switch school or campus")}</button>}
        <div className="border-t border-line my-1" />
        <form action={signOut}>
          <button role="menuitem" type="submit" className={cx(row, "text-bad")}><I.LogOut size={18} aria-hidden="true" />{t("Sign out")}</button>
        </form>
        </>}
      </div>
    </div>
  );
}

/* ---------- Switch school ---------- */
function SwitchSheet({ open, onClose, school, schools }: { open: boolean; onClose: () => void; school: ShellProps["school"]; schools: ShellProps["schools"] }) {
  const t = useT();
  const pathname = usePathname();
  return (
    <Sheet open={open} onClose={onClose} title={t("Switch school or campus")} sub={t("Your one login works in each of your schools. Each keeps its own data.")}>
      <div className="flex flex-col gap-2">
        {schools.map((x) => (
          <form key={x.id} action={switchSchool}>
            <input type="hidden" name="schoolId" value={x.id} />
            <input type="hidden" name="back" value={pathname} />
            <button type="submit" aria-current={x.id === school.id ? "true" : undefined}
              className={cx("w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition", x.id === school.id ? "border-brand ring-1 ring-brand bg-brand/5" : "border-line hover:bg-sunken")}>
              <span className="w-10 h-10 rounded-xl bg-brand text-brandink grid place-items-center"><I.School size={19} aria-hidden="true" /></span>
              <span className="flex-1 font-semibold text-[15px]">{x.name}</span>
              {x.id === school.id && <I.CircleCheck size={18} className="text-brand" aria-hidden="true" />}
            </button>
          </form>
        ))}
      </div>
    </Sheet>
  );
}

/** The page title shown on a phone's top bar: the module or page the person is on. */
function phoneTitle(pathname: string, pages: PageLink[]) {
  const match = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
  return match?.label ?? "";
}

export function AppShell(props: ShellProps) {
  const { school, schools, year, person, menu, landing, bottom, quick, pages, shortcuts, questions = [], askKeys = [], approvals, canApprove, canMessage, unread, notes, theme, support, children } = props;
  const ai = props.ai === true;
  const t = useT();
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [notif, setNotif] = useState(false);
  const [profile, setProfile] = useState(false);
  const [more, setMore] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  // A new page closes every panel.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setPalette(false); setNotif(false); setProfile(false); setMore(false); setQuickOpen(false); setSwitchOpen(false);
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setPalette(true); }
    };
    const open = () => setPalette(true);
    window.addEventListener("keydown", k);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener(OPEN_SEARCH_EVENT, open); };
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="skip-link">{t("Skip to the page")}</a>
      <Sidebar school={school} schools={schools} menu={menu} landing={landing} quick={quick} ai={ai} onQuick={() => setQuickOpen(true)} onSwitch={() => setSwitchOpen(true)} onAsk={() => setPalette(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar school={school} year={year} person={person} approvals={approvals} canApprove={canApprove} canMessage={canMessage} unread={unread} theme={theme} ai={ai}
          title={t.any(phoneTitle(pathname, pages))} onSearch={() => setPalette(true)} onNotif={() => setNotif(true)} onProfile={() => setProfile(true)} />
        {children}
      </div>
      <BottomNav items={bottom} onMore={() => setMore(true)} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} userId={person.id} pages={pages} shortcuts={shortcuts} quick={quick} questions={questions} askKeys={askKeys} ai={ai} />
      <NotifPanel open={notif} onClose={() => setNotif(false)} notes={notes} total={unread} />
      <ProfileMenu open={profile} onClose={() => setProfile(false)} person={person} school={school} schools={schools} theme={theme} onSwitch={() => setSwitchOpen(true)} support={support} />
      <MoreSheet open={more} onClose={() => setMore(false)} menu={menu} landing={landing} />
      <QuickSheet open={quickOpen} onClose={() => setQuickOpen(false)} quick={quick} />
      <SwitchSheet open={switchOpen} onClose={() => setSwitchOpen(false)} school={school} schools={schools} />
    </div>
  );
}

