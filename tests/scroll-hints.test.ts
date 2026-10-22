// Sideways-scrolling rows (src/components/ui/scroll-hints.tsx) and hydration
// (QA HYDRATE-01). The Student list streams in after the rest of the page;
// ScrollHints marked its tabs and class chips data-more="right" before React
// had hydrated them, and React warned "A tree hydrated but some attributes of
// the server rendered HTML didn't match the client properties". Now a row is
// touched only once React has taken it over: React keeps its own key
// ("__reactFiber$…") on every element it has hydrated.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isHydrated, reactKeyOf } from "@/components/ui/scroll-hints";

describe("a sideways row is marked only once React has hydrated it", () => {
  it("waits for a row React has not reached yet, and marks it once React has", () => {
    const body = { "__reactFiber$x1y2z3": {}, "__reactProps$x1y2z3": {} };
    const key = reactKeyOf(body);
    expect(key).toBe("__reactFiber$x1y2z3");
    // Streamed in, not hydrated yet: no React key on it.
    expect(isHydrated({}, key)).toBe(false);
    // Hydrated: React's key is on it.
    expect(isHydrated({ "__reactFiber$x1y2z3": {} }, key)).toBe(true);
  });

  it("does not wait when React keeps no such key (as before)", () => {
    expect(reactKeyOf({ id: "main" })).toBeNull();
    expect(isHydrated({}, null)).toBe(true);
  });

  it("the React the app runs (Next.js's own copy) still keeps that key on the elements it hydrates", () => {
    const require = createRequire(import.meta.url);
    const dir = path.join(path.dirname(require.resolve("next/package.json")), "dist", "compiled", "react-dom", "cjs");
    const builds = readdirSync(dir).filter((f) => /^react-dom-client\.(development|production)\.js$/.test(f));
    expect(builds.length).toBe(2);
    for (const f of builds) expect(readFileSync(path.join(dir, f), "utf8"), f).toContain('"__reactFiber$" + ');
  });
});
