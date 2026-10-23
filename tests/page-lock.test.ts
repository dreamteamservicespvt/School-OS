// The page behind an open sheet, dialog or menu stays still (src/components/ui/page-lock.tsx).
// On phones, scrolling a form sheet moved the page behind it, because no panel locked the page.
// One watcher in the root layout locks it for every panel; these checks keep every panel,
// including new ones, where the watcher can see it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKING, panelOpen } from "@/components/ui/page-lock";

const doc = (found: (sel: string) => boolean) => ({ querySelector: (sel: string) => (found(sel) ? ({} as Element) : null) });

function sources(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const files = sources(path.join(process.cwd(), "src")).map((f) => ({ f: path.relative(process.cwd(), f), text: readFileSync(f, "utf8") }));

describe("an open panel keeps the page behind it still", () => {
  it("locks while a modal <dialog> or a marked panel is open, and not otherwise", () => {
    expect(panelOpen(doc((s) => s === "dialog:modal"))).toBe(true);
    expect(panelOpen(doc((s) => s === LOCKING))).toBe(true);
    expect(panelOpen(doc(() => false))).toBe(false);
  });

  it("a browser without :modal still locks for an open <dialog>", () => {
    const old = { querySelector: (s: string) => { if (s === "dialog:modal") throw new SyntaxError(s); return s === "dialog[open]" ? ({} as Element) : null; } };
    expect(panelOpen(old)).toBe(true);
  });

  it("the root layout runs the lock on every page", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<PageLock \/>/);
  });

  it("every panel drawn over the page is one the lock can see", () => {
    const unseen: string[] = [];
    for (const { f, text } of files) {
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        // A hand-made panel: a fixed layer over the whole screen with a dialog or menu in it.
        if (!/className="fixed inset-0 z-50/.test(line)) return;
        const near = lines.slice(i, i + 4).join("\n");
        if (!/aria-modal="true"|data-scroll-lock/.test(near)) unseen.push(`${f}:${i + 1}`);
      });
      // A <div role="dialog"> must say it is modal, or the lock cannot see it.
      for (const m of text.matchAll(/role="dialog"[^>]*>/g)) if (!/aria-modal="true"/.test(m[0])) unseen.push(`${f}: ${m[0].slice(0, 60)}`);
      // A native <dialog> must open with showModal() (show() would leave the page free).
      if (/\.show\(\)/.test(text) && /<dialog/.test(text)) unseen.push(`${f}: dialog.show()`);
    }
    expect(unseen).toEqual([]);
  });
});
