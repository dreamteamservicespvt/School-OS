// Calm motion across School OS (owner 15 Nov: "animations and interactions satisfying, not
// irritating, not confusing, not complex"). The motion tokens in src/app/globals.css and the
// shared parts in src/components/ui keep these limits: entries 120-220 ms with an ease-out,
// a few pixels of travel, no bounce, pressed states on taps, one column for toasts, and the
// device's reduce-motion setting respected in CSS and in scripts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calmScroll, prefersReducedMotion } from "@/components/ui/motion";

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const css = read("src/app/globals.css");

const ms = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);

function files(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(path.join(root, p)).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const ui = files("src/components/ui").map((p) => ({ p, s: read(p) }));

describe("motion tokens (globals.css)", () => {
  const tokens = [...css.matchAll(/--animate-([\w-]+):\s*([\w-]+)\s+([\d.]+m?s)\s+([^;]+);/g)];

  it("every animation token is between 120 and 220 ms", () => {
    expect(tokens.map((t) => t[1])).toEqual(expect.arrayContaining(["rise", "fade", "sheet", "toast", "pop"]));
    for (const [, name, , d] of tokens) {
      expect(ms(d), name).toBeGreaterThanOrEqual(120);
      expect(ms(d), name).toBeLessThanOrEqual(220);
    }
  });

  it("entries ease out (never ease-in, never linear)", () => {
    for (const [, name, , , rest] of tokens) {
      expect(rest, name).not.toMatch(/ease-in|linear/);
      expect(rest, name).toMatch(/ease-out|cubic-bezier\(0\.(23|32), /);
    }
  });

  it("hover and focus colours change in 120 ms", () => {
    expect(css).toMatch(/--default-transition-duration:\s*120ms;/);
  });

  it("nothing grows from nothing or bounces: scales stay between 0.9 and 1.02", () => {
    const frames = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{[^@]*?\}\s*\}/g)].map((m) => m[0]);
    expect(frames.length).toBeGreaterThan(3);
    for (const f of frames) for (const s of f.matchAll(/scale\(([\d.]+)\)/g)) {
      expect(Number(s[1]), f).toBeGreaterThanOrEqual(0.9);
      expect(Number(s[1]), f).toBeLessThanOrEqual(1.02);
    }
  });

  it("things travel a few pixels, not across the screen", () => {
    for (const s of css.matchAll(/@keyframes\s+[\w-]+\s*\{[^}]*translateY\((\d+)px\)/g)) expect(Number(s[1])).toBeLessThanOrEqual(16);
  });

  it("a loading skeleton waits before it fades in, so a fast page never flashes grey", () => {
    expect(css).toMatch(/\[aria-busy="true"\]\.animate-fade\s*\{\s*animation-delay:\s*120ms/);
  });
});

describe("reduced motion (the device setting)", () => {
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("stops animations, glides and press shrinks, and plays each animation once", () => {
    expect(block).toMatch(/animation-duration:\s*0\.001ms !important/);
    expect(block).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms !important/);
    expect(block).toMatch(/scroll-behavior:\s*auto !important/);
    expect(block).toMatch(/:active\s*\{\s*scale:\s*none !important/);
    expect(block).toMatch(/\.skeleton\s*\{\s*animation:\s*none !important/);
  });

  it("keeps a spinner turning (slowly), so a busy button never looks stuck", () => {
    expect(block).toMatch(/\.animate-spin\s*\{\s*animation-duration:\s*1\.6s !important;\s*animation-iteration-count:\s*infinite !important/);
  });

  describe("scripts ask motion.ts", () => {
    afterEach(() => vi.unstubAllGlobals());
    const withSetting = (reduce: boolean) => vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduce && q === "(prefers-reduced-motion: reduce)" }) });

    it("glides normally and jumps when motion is reduced", () => {
      withSetting(false);
      expect(prefersReducedMotion()).toBe(false);
      expect(calmScroll()).toBe("smooth");
      withSetting(true);
      expect(prefersReducedMotion()).toBe(true);
      expect(calmScroll()).toBe("auto");
    });

    it("is safe on the server", () => {
      expect(prefersReducedMotion()).toBe(false);
    });

    it("no shared part hard-codes a smooth scroll", () => {
      for (const { p, s } of ui) expect(s, p).not.toMatch(/behavior:\s*"smooth"/);
    });
  });
});

describe("shared parts (src/components/ui)", () => {
  it("never animate every property or run long transitions", () => {
    for (const { p, s } of ui) {
      expect(s, p).not.toMatch(/transition-all/);
      expect(s, p).not.toMatch(/\bduration-(?:[4-9]\d\d|\d{4,})\b/);
      expect(s, p).not.toMatch(/animate-(?:bounce|ping)/);
      for (const m of s.matchAll(/transition:\s*"[\w-]+\s+([\d.]+m?s)/g)) expect(ms(m[1]), p).toBeLessThanOrEqual(300);
    }
  });

  it("buttons, chips, segments and tabs answer a tap", () => {
    expect(read("src/components/ui/button.tsx")).toMatch(/transition active:scale-\[0\.98\]/);
    expect(read("src/components/ui/chips.tsx")).toMatch(/border transition active:scale-\[0\.97\]/);
    expect(read("src/components/ui/controls.tsx")).toMatch(/transition active:scale-\[0\.97\]/);
    for (const f of ["tabs.tsx", "link-tabs.tsx", "chips.tsx"]) expect(read(`src/components/ui/${f}`), f).toMatch(/whitespace-nowrap transition active:bg-sunken\/70/);
  });

  it("every button variant has a pressed look", () => {
    const variants = read("src/components/ui/button.tsx").match(/const VARIANTS[^}]+\}/)![0];
    for (const line of variants.split("\n").filter((l) => l.includes("hover:"))) expect(line).toMatch(/active:/);
  });

  it("a dialog slides in over a shade that fades in", () => {
    expect(read("src/components/ui/dialog.tsx")).toMatch(/backdrop:animate-fade open:animate-sheet/);
  });

  it("toasts share one column, so two at once never sit on top of each other", () => {
    for (const f of ["toast.tsx", "notice.tsx"]) {
      const s = read(`src/components/ui/${f}`);
      expect(s, f).toMatch(/<ToastSlot>/);
      expect(s, f).toMatch(/TOAST_PILL_CLS/);
      expect(s, f).toMatch(/useAutoHide\(/);
      expect(s, f).not.toMatch(/fixed z-\[60\]/);
    }
    const stack = read("src/components/ui/toast-stack.tsx");
    expect(stack).toMatch(/flex flex-col items-center gap-2/);
    expect(stack).toMatch(/animate-toast/);
  });
});

describe("sign-in panels", () => {
  it("stagger their three cards by 30 ms steps at most", () => {
    for (const f of ["src/components/auth/auth-frame.tsx", "src/components/console/console-frame.tsx"]) {
      const delays = [...read(f).matchAll(/\[animation-delay:(\d+)ms\]/g)].map((m) => Number(m[1]));
      expect(delays, f).toEqual([30, 60, 90]);
    }
  });
});
