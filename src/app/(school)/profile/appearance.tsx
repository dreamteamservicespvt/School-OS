"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import * as I from "lucide-react";
import { ACCENTS, THEMES, type AccentKey, type TextSizeKey, type ThemeKey } from "@/lib/theme";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/controls";
import { Toast } from "@/components/ui/toast";
import { cx } from "@/components/ui/cx";
import { setAppearance } from "../actions";
import { setSchoolColour } from "./actions";
import { Words } from "@/lib/i18n/client";

const THEME_ICON = { light: I.Sun, dark: I.Moon, system: I.MonitorSmartphone } as const;

const L = { bg: "#f3f6f5", s: "#fff", l: "#dee5e2", i: "#0f1715" };
const D = { bg: "#090d0d", s: "#171e1e", l: "#242e2d", i: "#e9efed" };

function Thumb({ c }: { c: typeof L }) {
  return (
    <svg viewBox="0 0 120 72" className="w-full h-auto block" aria-hidden="true">
      <rect width="120" height="72" fill={c.bg} />
      <rect x="0" y="0" width="28" height="72" fill={c.s} />
      <rect x="6" y="8" width="16" height="4" rx="2" fill="rgb(var(--brand))" />
      {[18, 26, 34, 42].map((y) => <rect key={y} x="6" y={y} width="14" height="3" rx="1.5" fill={c.l} />)}
      <rect x="34" y="8" width="80" height="18" rx="4" fill="rgb(var(--brand))" />
      <rect x="34" y="32" width="38" height="32" rx="4" fill={c.s} />
      <rect x="76" y="32" width="38" height="32" rx="4" fill={c.s} />
      <rect x="40" y="38" width="22" height="3" rx="1.5" fill={c.i} opacity=".7" />
      <rect x="82" y="38" width="18" height="3" rx="1.5" fill={c.i} opacity=".7" />
    </svg>
  );
}

function ThemeThumb({ kind }: { kind: ThemeKey }) {
  return (
    <div className="rounded-xl overflow-hidden border border-line">
      {kind === "system" ? (
        <div className="relative"><Thumb c={L} /><div className="absolute inset-0" style={{ clipPath: "inset(0 0 0 50%)" }}><Thumb c={D} /></div></div>
      ) : <Thumb c={kind === "dark" ? D : L} />}
    </div>
  );
}

const THEME_CHANGED = "sos:theme-changed";
function onThemeChange(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  window.addEventListener(THEME_CHANGED, cb);
  return () => { mq.removeEventListener("change", cb); window.removeEventListener(THEME_CHANGED, cb); };
}

function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/**
 * Colours and text size (approved design, other.jsx Appearance): light or dark,
 * the school colour, and the text size. Changes show at once and are saved to
 * the login, so they follow the person to every device.
 */
export function Appearance({ theme, accent, textSize, schoolAccent, schoolName, canSetForAll, sampleName }: {
  theme: ThemeKey; accent: AccentKey; textSize: TextSizeKey; schoolAccent: AccentKey | null; schoolName: string; canSetForAll: boolean; sampleName: string;
}) {
  const [state, setState] = useState({ theme, accent: schoolAccent ?? accent, textSize });
  const [forAll, setForAll] = useState(Boolean(schoolAccent));
  const [toast, setToast] = useState<{ n: number; message: string; tone?: "success" | "info" | "danger" } | null>(null);
  const [, start] = useTransition();
  const dark = useSyncExternalStore(onThemeChange, isDark, () => false);
  const locked = Boolean(schoolAccent) && forAll && !canSetForAll;

  const say = (message: string, tone?: "success" | "info" | "danger") => setToast((t) => ({ n: (t?.n ?? 0) + 1, message, tone }));

  const save = (change: Partial<typeof state>) => {
    const next = { ...state, ...change };
    const root = document.documentElement;
    root.setAttribute("data-theme", next.theme);
    root.setAttribute("data-accent", next.accent);
    root.setAttribute("data-size", next.textSize);
    window.dispatchEvent(new Event(THEME_CHANGED));
    setState(next);
    start(async () => {
      const fd = new FormData();
      fd.set("theme", next.theme);
      fd.set("textSize", next.textSize);
      // With one colour for everyone, the person's own colour is kept for when it is switched off.
      fd.set("accent", forAll ? accent : next.accent);
      await setAppearance(fd);
      if (forAll && canSetForAll && change.accent) {
        const r = await setSchoolColour(next.accent);
        if (r) say(r.message);
      }
    });
  };

  const toggleForAll = (on: boolean) => {
    setForAll(on);
    start(async () => {
      const r = await setSchoolColour(on ? state.accent : null);
      if (r) say(on ? `Everyone at ${schoolName} will see this colour` : "Only you will see this colour", "info");
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Light or dark" description="Auto follows your phone or computer setting" />
        <div className="grid grid-cols-3 gap-3 px-5 pb-5" role="radiogroup" aria-label="Light or dark">
          {THEMES.map((t) => {
            const Ic = THEME_ICON[t.key];
            const on = state.theme === t.key;
            return (
              <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => save({ theme: t.key })}
                className={cx("rounded-2xl border-2 p-2 text-left transition", on ? "border-brand" : "border-line hover:border-ink3/40")}>
                <ThemeThumb kind={t.key} />
                <span className="flex items-center gap-2 mt-2.5 px-1 pb-1 text-[14px] font-semibold">
                  <Ic size={16} aria-hidden="true" />{t.label}{on && <I.CircleCheck size={16} className="ml-auto text-brand" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="School colour" description="Buttons, highlights and the top band use this colour" />
        {locked && <p className="mx-5 mb-3 rounded-xl bg-info/10 px-3.5 py-2.5 text-[13.5px] text-info"><Words k="Your School Admin has chosen this colour for everyone. You can still pick light or dark." /></p>}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 px-5 pb-4" role="radiogroup" aria-label="School colour">
          {ACCENTS.map((a) => {
            const on = state.accent === a.key;
            return (
              <button key={a.key} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => save({ accent: a.key })}
                className={cx("rounded-2xl border-2 p-3 flex flex-col items-center gap-2 transition disabled:cursor-not-allowed", on ? "border-ink" : "border-transparent enabled:hover:bg-sunken", locked && !on && "opacity-50")}>
                <span className="w-11 h-11 rounded-full grid place-items-center shadow-card" style={{ background: dark ? a.dark : a.swatch }}>
                  {on && <I.Check size={20} strokeWidth={3} style={{ color: dark ? "#071412" : "#fff" }} aria-hidden="true" />}
                </span>
                <span className="text-[13px] font-semibold">{a.label}</span>
              </button>
            );
          })}
        </div>
        {canSetForAll && (
          <div className="mx-5 mb-5 rounded-xl bg-sunken p-3.5 flex items-center gap-3">
            <Switch id="acc-all" on={forAll} onChange={toggleForAll} label="Use this colour for everyone" />
            <label htmlFor="acc-all" className="text-[14px]">
              <b className="font-semibold"><Words k="Use for everyone in the school" /></b>
              <span className="block text-[12.5px] text-ink3"><Words k="Only School Admin can change this. Each person can still pick light or dark." /></span>
            </label>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Text size" description="Bigger text helps on small phones" />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5" role="radiogroup" aria-label="Text size">
          {([["normal", "Standard", "text-[15px]"], ["large", "Large", "text-[18px]"]] as const).map(([v, l, c]) => (
            <button key={v} type="button" role="radio" aria-checked={state.textSize === v} onClick={() => save({ textSize: v })}
              className={cx("rounded-2xl border-2 p-4 text-left transition", state.textSize === v ? "border-brand" : "border-line hover:border-ink3/40")}>
              <span className={cx("block font-semibold truncate", c)}><Words k="Aa ·" /> {sampleName}</span>
              <span className="block text-[13px] text-ink3 mt-1">{l}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Preview" />
        <div className="px-5 pb-5 flex flex-wrap gap-2 items-center pointer-events-none" aria-hidden="true" inert>
          <Button variant="primary" icon={I.IndianRupee}><Words k="Collect ₹30,650" /></Button>
          <Button variant="soft" icon={I.Send}><Words k="Send reminder" /></Button>
          <Button variant="secondary"><Words k="Cancel" /></Button>
          <Pill tone="ok" dot><Words k="Paid" /></Pill><Pill tone="warn"><Words k="Due" /></Pill><Pill tone="bad"><Words k="Overdue" /></Pill><Pill tone="brand"><Words k="New" /></Pill>
        </div>
      </Card>
      {toast && <Toast key={toast.n} flash={{ message: toast.message, tone: toast.tone }} />}
    </div>
  );
}
