// The assistant's round button floats at the bottom right of every screen. On a phone (280-430 px) it sat on the
// right end of Take Attendance's Save button and cut its words ("Save attendance: 26 present, 2 abs", loop 17 Nov);
// other pages keep their Save, Submit and bulk-action bars in the same spot. Every bar pinned to the bottom of a
// screen now says so (data-action-bar) and the button moves up to sit just above whichever bar it would cover.
// No database here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFT_GAP, launcherLift, type Box } from "@/components/assistant/launcher-lift";

const H = 844;
// The button's own spot: right-4, h-14 w-14; bottom-24 on a phone, bottom-6 on a computer.
const phoneButton = (w: number): Box => ({ left: w - 72, right: w - 16, top: H - 152, bottom: H - 96 });
// The phone's bottom menu: 68 px tall, taller by the home-indicator strip on an iPhone (safe area).
const bottomMenu = (w: number, safe = 0): Box => ({ left: 0, right: w, top: H - 68 - safe, bottom: H });
// Take Attendance's Save bar on a phone: full width, stuck just above the bottom menu; 76 px tall with only the
// Save button, 126 px with the absent note above it.
const saveBar = (w: number, tall = 76, safe = 0): Box => ({ left: 0, right: w, top: H - 68 - safe - tall, bottom: H - 68 - safe });
const lifted = (b: Box, by: number): Box => ({ ...b, top: b.top - by, bottom: b.bottom - by });
const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe("the assistant button and a screen's bottom bars", () => {
  it.each([280, 360, 390, 430])("at %i px it sits just above the Save bar, with or without the absent note", (w) => {
    for (const tall of [76, 126]) {
      const bars = [bottomMenu(w), saveBar(w, tall)];
      const by = launcherLift(phoneButton(w), bars);
      expect(by).toBeGreaterThan(0);
      const now = lifted(phoneButton(w), by);
      expect(bars.some((b) => overlaps(now, b))).toBe(false);
      expect(bars[1].top - now.bottom).toBe(LIFT_GAP);
    }
  });

  it("does the same on a computer, where the bar sits at the very bottom of the content column", () => {
    const button: Box = { left: 1440 - 72, right: 1424, top: 900 - 80, bottom: 900 - 24 };
    const bar: Box = { left: 268 + 32, right: 1440 - 32, top: 900 - 76, bottom: 900 };
    const by = launcherLift(button, [bar]);
    expect(overlaps(lifted(button, by), bar)).toBe(false);
  });

  it("stays where it is when no bar is under it", () => {
    const w = 390, home = phoneButton(w);
    expect(launcherLift(home, [])).toBe(0);
    // the bottom menu alone: the button's own spot is already above it
    expect(launcherLift(home, [bottomMenu(w)])).toBe(0);
    // a bar beside it (left half of the screen), one wholly above it, and one hidden (no size: display none)
    expect(launcherLift(home, [{ left: 0, right: w / 2, top: H - 160, bottom: H - 68 }])).toBe(0);
    expect(launcherLift(home, [{ left: 0, right: w, top: H - 300, bottom: H - 200 }])).toBe(0);
    expect(launcherLift(home, [{ left: 0, right: 0, top: 0, bottom: 0 }])).toBe(0);
    // at the end of a page the Save bar has scrolled up off its stuck spot: the button keeps its own room below it
    expect(launcherLift(home, [bottomMenu(w), { left: 0, right: w, top: H - 244, bottom: H - 168 }])).toBe(0);
  });

  it("clears an iPhone's taller bottom menu, and the Save bar above that", () => {
    const w = 390, safe = 34, home = phoneButton(w);
    const menu = bottomMenu(w, safe);
    expect(overlaps(home, menu)).toBe(true);
    expect(lifted(home, launcherLift(home, [menu])).bottom).toBe(menu.top - LIFT_GAP);
    const bar = saveBar(w, 126, safe);
    const now = lifted(home, launcherLift(home, [menu, bar]));
    expect(overlaps(now, menu) || overlaps(now, bar)).toBe(false);
    expect(now.bottom).toBe(bar.top - LIFT_GAP);
  });

  it("keeps its gap from a bar that only just reaches it", () => {
    const home = phoneButton(390);
    expect(launcherLift(home, [{ left: 0, right: 390, top: home.bottom + 4, bottom: H - 20 }])).toBe(LIFT_GAP - 4);
  });

  it("clears a second bar it would land on after the first, but never rises into the top bar", () => {
    const w = 390, home = phoneButton(w);
    const low = saveBar(w), high: Box = { left: w - 120, right: w, top: low.top - 70, bottom: low.top - 10 };
    const by = launcherLift(home, [low, high]);
    const now = lifted(home, by);
    expect(overlaps(now, low) || overlaps(now, high)).toBe(false);
    expect(now.bottom).toBe(high.top - LIFT_GAP);
    expect(lifted(home, launcherLift(home, [{ left: 0, right: w, top: 40, bottom: H - 68 }])).top).toBe(72);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(name) ? [p] : [];
  });
}

const PINNED = /^(?:[\w-]+:)*(?:sticky|fixed)$/;
const AT_BOTTOM = /^(?:[\w-]+:)*!?-?bottom-/;
const quoted = (text: string) => [...text.matchAll(/"([^"\n]*)"/g)];

/** Where the JSX opening tag that starts at `start` ("<Name") ends: its own ">", with braces and strings skipped. */
function tagEnd(src: string, start: number): number {
  let depth = 0, quote = "";
  for (let j = start + 1; j < src.length && j < start + 8000; j++) {
    const c = src[j];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return j;
  }
  return -1;
}

/** The JSX opening tags that hold a sticky or fixed class. */
function pinnedTags(src: string): string[] {
  const tags = new Set<string>();
  for (const q of quoted(src)) {
    if (!q[1].split(/\s+/).some((c) => PINNED.test(c))) continue;
    // The nearest "<Name" before the class text whose tag is still open at it (a generic such as
    // querySelectorAll<HTMLInputElement> inside an earlier attribute closes before it, so the search goes on).
    let start = q.index;
    while ((start = start > 0 ? src.lastIndexOf("<", start - 1) : -1) >= 0 && q.index - start <= 8000) {
      if (!/[A-Za-z]/.test(src[start + 1] ?? "")) continue;
      const end = tagEnd(src, start);
      if (end > q.index) { tags.add(src.slice(start, end + 1)); break; }
    }
  }
  return [...tags];
}

describe("bars pinned to the bottom of a screen", () => {
  it("every one says data-action-bar, so the assistant button keeps clear of it", () => {
    const found: string[] = [], missing: string[] = [];
    for (const f of files("src")) {
      if (f.includes(join("components", "assistant"))) continue; // the button and its own panel
      const src = readFileSync(f, "utf8");
      if (!/\b(?:sticky|fixed)\b/.test(src) || !src.includes("bottom-")) continue;
      for (const tag of pinnedTags(src)) {
        if (!/\bclassName=/.test(tag) || !quoted(tag).some((q) => q[1].split(/\s+/).some((c) => AT_BOTTOM.test(c)))) continue;
        found.push(f);
        if (!tag.includes("data-action-bar")) missing.push(`${f}: ${tag.slice(0, 140)}`);
      }
    }
    expect(missing).toEqual([]);
    // The check itself still sees the bars (a class list on a later line of a long tag, the two phone menus).
    const seen = found.map((f) => f.replace(/\\/g, "/"));
    for (const f of ["src/app/(school)/attendance-management/_components/take-sheet.tsx", "src/app/(school)/examination-results/marks/marks-grid.tsx",
      "src/components/students/bulk-bar.tsx", "src/components/shell/app-shell.tsx"]) expect(seen).toContain(f);
    expect(found.length).toBeGreaterThanOrEqual(20);
  }, 120_000); // reads every screen file: a few seconds, much longer while the laptop is busy

  it("the Take Attendance Save bar is one", () => {
    const src = readFileSync("src/app/(school)/attendance-management/_components/take-sheet.tsx", "utf8");
    expect(src).toMatch(/data-testid="save-bar" data-action-bar=""/);
  });
});

describe("the assistant button itself", () => {
  const panel = readFileSync("src/components/assistant/assistant-panel.tsx", "utf8");
  const button = panel.match(/<button ref=\{launcher\}[\s\S]*?className=\{cx\(s\.launcher, "([^"]*)"\)\}/)?.[1].split(/\s+/) ?? [];

  it("follows the bars, and glides only when the person allows motion", () => {
    expect(panel).toContain("useLauncherLift(launcher, !open)");
    expect(button).toContain("fixed");
    expect(button).toContain("motion-safe:transition-transform");
    expect(button.filter((c) => /^(?:transition|duration)/.test(c))).toEqual([]);
  });

  it("steps aside on a phone while the marks number keys are on screen, like the bottom menu", () => {
    expect(button).toContain("max-md:[html:has([data-keypad])_&]:hidden");
  });

  it("has room of its own at the end of every page, so the last button can be scrolled clear of it", () => {
    // 10.5rem = 168 px: the button's top edge on a phone (bottom-24 + h-14 = 152 px) and a gap; 96 px on a computer (bottom-6 + h-14 = 80 px).
    const layout = readFileSync("src/app/(school)/layout.tsx", "utf8");
    expect(layout).toContain('assistant ? "pb-[calc(10.5rem+env(safe-area-inset-bottom))] md:pb-24" : "pb-28 md:pb-10"');
  });
});
