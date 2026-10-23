"use client";

// The Super Admin console's own frame (design/ui-prototype superadmin.jsx ConsoleShell):
// sidebar, top bar with the school search, the phone bar with "More", notifications
// and the profile menu. Only DREAM TEAM people ever see it.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, useTransition } from "react";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { SheetHead } from "@/components/ui/dialog";
import { Logo } from "@/components/shell/logo";
import { consoleSignOut, consoleTheme, markConsoleNotesRead, openConsoleNote, searchSchools, type SchoolHit } from "@/app/console/(app)/actions";

export type ConsoleNote = { id: string; text: string; when: string; unread: boolean; tone: string };
export type ConsoleShellProps = {
  person: { name: string; role: string; phone: string };
  can: { add: boolean; team: boolean };
  schoolCount: number;
  unread: number;
  notes: ConsoleNote[];
  theme: string;
  children: React.ReactNode;
};

type MenuItem = { href: string; label: string; icon: LucideIcon; count?: number | null };

function menu(can: ConsoleShellProps["can"], schoolCount: number): { group: string | null; items: MenuItem[] }[] {
  return [
    { group: null, items: [{ href: "/console", label: "Dashboard", icon: I.LayoutGrid }] },
    { group: "Schools", items: [{ href: "/console/schools", label: "Schools", icon: I.School, count: schoolCount || null }, { href: "/console/support", label: "Support Access", icon: I.LifeBuoy }] },
    { group: "Money", items: [{ href: "/console/billing", label: "Plans & Billing", icon: I.ReceiptIndianRupee }] },
    { group: "DREAM TEAM", items: [...(can.team ? [{ href: "/console/team", label: "Team", icon: I.UsersRound }] : []), { href: "/console/activity", label: "Activity Log", icon: I.ScrollText }] },
  ];
}

const TITLES: [string, string][] = [["/console/schools/new", "Add School"], ["/console/schools", "Schools"], ["/console/support", "Support Access"], ["/console/billing", "Plans & Billing"], ["/console/team", "Team"], ["/console/activity", "Activity Log"], ["/console/profile", "My profile"], ["/console", "Dashboard"]];
const titleOf = (path: string) => TITLES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? "Dashboard";

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/console" ? pathname === "/console" : pathname === href || pathname.startsWith(`${href}/`));
}

function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); back?.focus?.(); };
  }, [open, close]);
}

function Sheet({ open, onClose, title, sub, children }: { open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 30); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-shade/45 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-surface w-full max-h-[92dvh] flex flex-col rounded-t-3xl md:rounded-2xl shadow-pop animate-sheet outline-none md:max-w-md">
        <SheetHead titleId={titleId} title={title} sub={sub} onClose={onClose} />
        <div className="overflow-y-auto scroll-thin px-5 pb-5" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>{children}</div>
      </div>
    </div>
  );
}

function Sidebar({ can, schoolCount }: { can: ConsoleShellProps["can"]; schoolCount: number }) {
  const isOn = useActive();
  return (
    <aside className="hidden md:flex flex-col shrink-0 sticky top-0 h-dvh border-r border-line bg-surface w-[76px] lg:w-[268px] z-30 no-print">
      <Link href="/console" title="School OS Console · DREAM TEAM SERVICES" className="h-16 flex items-center gap-3 px-[18px] shrink-0 text-left">
        <Logo />
        <span className="min-w-0 hidden lg:block">
          <span className="block font-display font-semibold text-[15px] leading-tight truncate">School OS Console</span>
          <span className="block text-xs text-ink3 truncate">DREAM TEAM SERVICES</span>
        </span>
      </Link>
      {can.add && (
        <div className="px-3.5 pb-2 pt-1">
          <Link href="/console/schools/new" title="Add School"
            className="w-full h-11 rounded-xl bg-brand text-brandink font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-sm transition">
            <I.Plus size={19} strokeWidth={2.5} aria-hidden="true" /><span className="hidden lg:inline">Add School</span><span className="sr-only lg:hidden">Add School</span>
          </Link>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-4" aria-label="Console menu">
        {menu(can, schoolCount).map((g, gi) => (
          <div key={gi} className="pt-3">
            {g.group && <p className="eyebrow text-ink3 px-3 pb-1.5 hidden lg:block">{g.group}</p>}
            {g.group && <div className="mx-3 mb-2 border-t border-line lg:hidden" aria-hidden="true" />}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const on = isOn(it.href);
                const Ic = it.icon;
                return (
                  <li key={it.href}>
                    <Link href={it.href} title={it.label} aria-current={on ? "page" : undefined}
                      className={cx("group w-full h-10 rounded-xl flex items-center gap-3 px-3 text-[14px] font-medium transition relative justify-center lg:justify-start",
                        on ? "bg-brand/10 text-brand font-semibold" : "text-ink2 hover:bg-sunken hover:text-ink")}>
                      {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand -ml-3" aria-hidden="true" />}
                      <Ic size={19} strokeWidth={on ? 2.3 : 2} className="shrink-0" aria-hidden="true" />
                      <span className="truncate hidden lg:inline">{it.label}</span>
                      <span className="sr-only lg:hidden">{it.label}</span>
                      {it.count ? <span className="ml-auto text-[11px] font-bold tnum px-1.5 h-5 rounded-md bg-sunken text-ink2 items-center hidden lg:inline-flex">{it.count}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 p-3.5 rounded-2xl bg-sunken hidden lg:block">
        <p className="text-[13px] font-semibold flex items-center gap-2"><I.ShieldCheck size={15} className="text-brand" aria-hidden="true" />Two-step login is on</p>
        <p className="text-xs text-ink3 mt-1 leading-relaxed">Signed out after 30 minutes without use. Everything you do goes in the Activity Log.</p>
      </div>
    </aside>
  );
}

function TopBar({ person, unread, theme, onSearch, onNotif, onProfile }: { person: ConsoleShellProps["person"]; unread: number; theme: string; onSearch: () => void; onNotif: () => void; onProfile: () => void }) {
  const pathname = usePathname();
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
    void consoleTheme(next);
  };
  return (
    <header className="sticky top-0 h-16 shrink-0 flex items-center gap-2 px-3 md:px-5 border-b border-line bg-surface/85 backdrop-blur-md z-20 no-print">
      <Link href="/console" className="md:hidden flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <Logo size={34} />
        <span className="min-w-0">
          <span className="block font-display font-semibold text-[15px] leading-tight truncate">{titleOf(pathname)}</span>
          <span className="block text-[11.5px] text-ink3 truncate">School OS Console · DREAM TEAM SERVICES</span>
        </span>
      </Link>
      <button type="button" onClick={onSearch}
        className="hidden md:flex items-center gap-3 h-11 flex-1 max-w-xl rounded-xl bg-sunken border border-transparent hover:border-line px-3.5 text-ink3 text-[14.5px] transition">
        <I.Search size={18} aria-hidden="true" />
        <span className="truncate">Search schools by name, city, phone or school code</span>
        <span className="ml-auto flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1 hidden md:block" />
      <span className="hidden lg:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-line text-ink2 text-[13px] font-semibold" title="Your console role">
        <I.BadgeCheck size={16} aria-hidden="true" />{person.role}
      </span>
      <IconButton className="md:hidden" icon={I.Search} label="Search schools" onClick={onSearch} />
      <IconButton icon={I.Bell} label="Notifications" badge={unread || null} onClick={onNotif} />
      <IconButton className="hidden md:inline-flex" icon={dark ? I.Sun : I.Moon} label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={flip} />
      <button type="button" onClick={onProfile} className="ml-1 flex items-center gap-2.5 rounded-xl hover:bg-sunken p-1 lg:pr-3 transition" aria-label="Your profile and role">
        <Avatar name={person.name} size={34} />
        <span className="hidden lg:block text-left">
          <span className="block text-[13.5px] font-semibold leading-tight max-w-[10rem] truncate">{person.name}</span>
          <span className="block text-xs text-ink3">{person.role} · DREAM TEAM</span>
        </span>
      </button>
    </header>
  );
}

function BottomNav({ can, onMore }: { can: ConsoleShellProps["can"]; onMore: () => void }) {
  const isOn = useActive();
  const items: [string, string, LucideIcon, boolean?][] = can.add
    ? [["/console", "Home", I.LayoutGrid], ["/console/schools", "Schools", I.School], ["/console/schools/new", "Add", I.Plus, true], ["/console/activity", "Activity", I.ScrollText]]
    : [["/console", "Home", I.LayoutGrid], ["/console/schools", "Schools", I.School], ["/console/billing", "Billing", I.ReceiptIndianRupee], ["/console/activity", "Activity", I.ScrollText]];
  const on = (href: string) => (href === "/console/schools" ? isOn(href) && !isOn("/console/schools/new") : isOn(href));
  const moreOn = !items.some(([h]) => on(h));
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur-md px-2 pt-1.5 z-30 no-print" style={{ paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }} aria-label="Console menu">
      <ul className="grid grid-cols-5">
        {items.map(([href, label, Ic, big]) => {
          const active = on(href);
          return (
            <li key={href} className="flex justify-center">
              <Link href={href} aria-current={active ? "page" : undefined} className={cx("flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold", active ? "text-brand" : "text-ink3")}>
                {big ? (
                  <span className={cx("w-12 h-9 -mt-0.5 rounded-2xl grid place-items-center transition", active ? "bg-brand text-brandink" : "bg-brand/12 text-brand")}><Ic size={20} strokeWidth={2.4} aria-hidden="true" /></span>
                ) : (
                  <span className={cx("w-14 h-8 rounded-full grid place-items-center transition", active && "bg-brand/12")}><Ic size={21} strokeWidth={active ? 2.4 : 2} aria-hidden="true" /></span>
                )}
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex justify-center">
          <button type="button" onClick={onMore} className={cx("flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold", moreOn ? "text-brand" : "text-ink3")}>
            <span className={cx("w-14 h-8 rounded-full grid place-items-center", moreOn && "bg-brand/12")}><I.LayoutGrid size={21} aria-hidden="true" /></span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet({ open, onClose, can, schoolCount }: { open: boolean; onClose: () => void; can: ConsoleShellProps["can"]; schoolCount: number }) {
  const groups = menu(can, schoolCount).filter((g) => g.group).map((g) => (g.group === "Schools" && can.add ? { ...g, items: [...g.items, { href: "/console/schools/new", label: "Add School", icon: I.Plus }] } : g));
  return (
    <Sheet open={open} onClose={onClose} title="Console menu" sub="School OS Console · DREAM TEAM SERVICES">
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="eyebrow text-ink3 mb-2">{g.group}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((it) => {
                const Ic = it.icon;
                return (
                  <Link key={it.href} href={it.href} onClick={onClose} className="flex flex-col items-center gap-2 rounded-2xl bg-sunken hover:bg-line/60 px-2 py-3.5 text-center">
                    <span className="w-10 h-10 rounded-xl bg-surface text-brand grid place-items-center shadow-card"><Ic size={20} aria-hidden="true" /></span>
                    <span className="text-[12px] font-semibold leading-tight">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function NotifPanel({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: ConsoleNote[] }) {
  useEscape(open, onClose);
  if (!open) return null;
  const unread = notes.filter((n) => n.unread).length;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-shade/35 md:bg-transparent animate-fade" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Notifications"
        className="absolute inset-x-0 bottom-0 md:bottom-auto md:left-auto md:right-4 md:top-[68px] md:w-[400px] bg-surface rounded-t-3xl md:rounded-2xl shadow-pop border border-line animate-sheet max-h-[85dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="font-display font-semibold text-lg">Notifications</h2>
            <p className="text-[13px] text-ink3">{unread ? `${unread} new` : "You are all caught up"}</p>
          </div>
          {unread > 0 && (
            <form action={markConsoleNotesRead}>
              <button type="submit" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink2 hover:bg-sunken hover:text-ink">
                <I.CheckCheck size={15} aria-hidden="true" />Mark all read
              </button>
            </form>
          )}
        </div>
        <ul className="overflow-y-auto scroll-thin px-2 pb-2">
          {notes.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink3">Alerts for you, like a school admin signing in for the first time or a payment arriving, appear here.</li>}
          {notes.map((n) => (
            <li key={n.id}>
              <form action={openConsoleNote}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="w-full text-left flex gap-3 px-3 py-3 rounded-xl hover:bg-sunken">
                  <span className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", n.unread ? "bg-brand" : "bg-transparent")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {n.unread && <span className="sr-only">Unread. </span>}
                    <span className={cx("block text-[14px] leading-snug", n.unread ? "font-semibold" : "text-ink2")}>{n.text}</span>
                  </span>
                  <span className="text-[11.5px] text-ink3 whitespace-nowrap">{n.when}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProfileMenu({ open, onClose, person, theme }: { open: boolean; onClose: () => void; person: ConsoleShellProps["person"]; theme: string }) {
  const [mode, setMode] = useState(theme);
  useEscape(open, onClose);
  if (!open) return null;
  const choose = (v: string) => {
    setMode(v);
    document.documentElement.setAttribute("data-theme", v);
    void consoleTheme(v);
  };
  const row = "w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left";
  return (
    <div className="fixed inset-0 z-50" data-scroll-lock>
      <div className="absolute inset-0 bg-shade/35 md:bg-transparent animate-fade" onClick={onClose} aria-hidden="true" />
      <div role="menu" aria-label="Your profile" className="absolute inset-x-0 bottom-0 md:bottom-auto md:left-auto md:right-4 md:top-[68px] md:w-[340px] bg-surface rounded-t-3xl md:rounded-2xl shadow-pop border border-line animate-sheet p-2" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center gap-3 p-3">
          <Avatar name={person.name} size={44} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{person.name}</p>
            <p className="text-[13px] text-ink3 truncate">{person.role} · DREAM TEAM SERVICES</p>
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="eyebrow text-ink3 mb-2">Mode</p>
          <Segmented className="grid grid-cols-3 w-full" value={mode} onChange={choose} label="Light or dark"
            options={[{ value: "light", label: "Light", icon: I.Sun }, { value: "dark", label: "Dark", icon: I.Moon }, { value: "system", label: "Auto", icon: I.MonitorSmartphone }]} />
        </div>
        <div className="border-t border-line my-1" />
        <Link role="menuitem" href="/console/profile" onClick={onClose} className={row}><I.UserCog size={18} className="text-ink3" aria-hidden="true" />My profile and password</Link>
        <Link role="menuitem" href="/console/profile#two-step" onClick={onClose} className={row}><I.ShieldCheck size={18} className="text-ink3" aria-hidden="true" />Two-step login<span className="ml-auto inline-flex items-center h-5 px-2 rounded-full bg-ok/10 text-ok text-[11px] font-semibold">On</span></Link>
        <div className="border-t border-line my-1" />
        <form action={consoleSignOut}>
          <button role="menuitem" type="submit" className={cx(row, "text-bad")}><I.LogOut size={18} aria-hidden="true" />Sign out</button>
        </form>
      </div>
    </div>
  );
}

type Hit = { kind: "school"; school: SchoolHit } | { kind: "page"; href: string; label: string; sub: string; icon: LucideIcon };

function SearchPalette({ open, onClose, can, schoolCount }: { open: boolean; onClose: () => void; can: ConsoleShellProps["can"]; schoolCount: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [schools, setSchools] = useState<SchoolHit[]>([]);
  const [busy, start] = useTransition();
  const inp = useRef<HTMLInputElement>(null);
  useEscape(open, onClose);
  // Each time it opens: an empty search, the first row chosen.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setQ(""); setSel(0); }
  }
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inp.current?.focus(), 40);
    start(async () => setSchools(await searchSchools("")));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => start(async () => { setSchools(await searchSchools(q)); setSel(0); }), 160);
    return () => clearTimeout(t);
  }, [q, open]);
  if (!open) return null;
  const t = q.trim().toLowerCase().replace(/\s/g, "");
  const pages: Hit[] = menu(can, schoolCount).flatMap((g) => g.items)
    .filter((p) => !t || p.label.toLowerCase().replace(/\s/g, "").includes(t))
    .map((p) => ({ kind: "page", href: p.href, label: p.label, sub: "Open", icon: p.icon }));
  if (can.add && (!t || "addschool".includes(t))) pages.push({ kind: "page", href: "/console/schools/new", label: "Add School", sub: "A new school and its first School Admin", icon: I.Plus });
  const results: Hit[] = [...schools.map((s) => ({ kind: "school" as const, school: s })), ...pages];
  const go = (h: Hit) => { onClose(); router.push(h.kind === "school" ? `/console/schools/${h.school.id}` : h.href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[sel]) go(results[sel]);
  };
  let last: string | null = null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start md:pt-[10vh]">
      <div className="absolute inset-0 bg-shade/45 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Search schools" className="relative w-full h-full md:h-auto md:max-w-2xl bg-surface md:rounded-2xl shadow-pop animate-rise flex flex-col md:max-h-[70vh] md:mx-6">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line shrink-0">
          {busy ? <I.LoaderCircle size={20} className="text-ink3 animate-spin" aria-hidden="true" /> : <I.Search size={20} className="text-ink3" aria-hidden="true" />}
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="School name, city, phone or school code"
            placeholder="School name, city, phone or school code" className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-ink3 min-w-0" />
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink2 px-2 h-8 rounded-lg hover:bg-sunken"><span className="md:hidden">Cancel</span><span className="hidden md:inline"><Kbd>Esc</Kbd></span></button>
        </div>
        <div className="overflow-y-auto scroll-thin p-2 flex-1" role="listbox" aria-label="Results">
          {results.length === 0 && !busy && (
            <div className="text-center py-12 px-6">
              <p className="font-semibold">No school found for “{q}”</p>
              <p className="text-sm text-ink3 mt-1">Try the school code, like SPS-HYD-001, or the school’s phone number.</p>
            </div>
          )}
          {results.map((r, i) => {
            const sec = r.kind === "school" ? (t ? "Schools" : "Schools that need you") : "Pages";
            const head = sec !== last ? (last = sec) : null;
            return (
              <Fragment key={r.kind === "school" ? r.school.id : r.href}>
                {head && <p className="eyebrow text-ink3 px-3 pt-3 pb-1.5">{head}</p>}
                <button type="button" role="option" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => go(r)} className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left", sel === i && "bg-sunken")}>
                  {r.kind === "school" ? <Avatar name={r.school.name} size={34} className="!rounded-xl" /> : (
                    <span className={cx("w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0", sel === i ? "bg-brand text-brandink" : "bg-sunken text-ink2")}><r.icon size={17} aria-hidden="true" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold truncate">{r.kind === "school" ? r.school.name : r.label}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{r.kind === "school" ? `${r.school.city ?? "No city"} · ${r.school.code} · ${r.school.status}` : r.sub}</span>
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
          <span className="ml-auto">Searches schools only. Students, fees and staff are never searchable here.</span>
        </div>
      </div>
    </div>
  );
}

export function ConsoleShell({ person, can, schoolCount, unread, notes, theme, children }: ConsoleShellProps) {
  const pathname = usePathname();
  const [palette, setPalette] = useState(false);
  const [notif, setNotif] = useState(false);
  const [profile, setProfile] = useState(false);
  const [more, setMore] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setPalette(false); setNotif(false); setProfile(false); setMore(false);
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="skip-link">Skip to the page</a>
      <Sidebar can={can} schoolCount={schoolCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar person={person} unread={unread} theme={theme} onSearch={() => setPalette(true)} onNotif={() => setNotif(true)} onProfile={() => setProfile(true)} />
        {children}
      </div>
      <BottomNav can={can} onMore={() => setMore(true)} />
      <SearchPalette open={palette} onClose={() => setPalette(false)} can={can} schoolCount={schoolCount} />
      <NotifPanel open={notif} onClose={() => setNotif(false)} notes={notes} />
      <ProfileMenu open={profile} onClose={() => setProfile(false)} person={person} theme={theme} />
      <MoreSheet open={more} onClose={() => setMore(false)} can={can} schoolCount={schoolCount} />
    </div>
  );
}
