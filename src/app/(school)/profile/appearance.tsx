"use client";

import { useOptimistic, useTransition } from "react";
import { ACCENTS, THEMES } from "@/lib/theme";
import { setAppearance } from "../actions";

/** Light, dark or the device's choice, and one of six accent colours. Changes apply at once. */
export function Appearance({ theme, accent }: { theme: string; accent: string }) {
  const [state, setState] = useOptimistic({ theme, accent });
  const [, start] = useTransition();

  const choose = (change: Partial<typeof state>) => {
    const next = { ...state, ...change };
    document.documentElement.setAttribute("data-theme", next.theme);
    document.documentElement.setAttribute("data-accent", next.accent);
    start(async () => {
      setState(next);
      const fd = new FormData();
      fd.set("theme", next.theme);
      fd.set("accent", next.accent);
      await setAppearance(fd);
    });
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Light or dark</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <label key={t.key} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${state.theme === t.key ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="theme" value={t.key} checked={state.theme === t.key} onChange={() => choose({ theme: t.key })} className="size-5 accent-[var(--brand)]" />
              <span className={`grid size-8 place-items-center rounded-lg border border-line ${t.key === "dark" ? "bg-[#161b22]" : t.key === "light" ? "bg-white" : "bg-gradient-to-br from-white to-[#161b22]"}`} aria-hidden="true" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <label key={a.key} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 ${state.accent === a.key ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
              <input type="radio" name="accent" value={a.key} checked={state.accent === a.key} onChange={() => choose({ accent: a.key })} className="sr-only" />
              <span className="size-6 rounded-full ring-2 ring-surface" style={{ background: a.swatch }} aria-hidden="true" />
              {a.label}
              {state.accent === a.key && <span className="sr-only">(chosen)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-ink-2">Your choice is saved to your login, so it follows you to other devices. Colours always keep text easy to read.</p>
    </div>
  );
}
