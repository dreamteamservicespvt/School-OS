// Helpers for self-test B (2026-11-12): sessions kept per login in qa-output/2026-11-12-B/state,
// phone contexts (390x844, touch, light or dark), screenshots under qa-output/2026-11-12-B/.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-<name>.mjs
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { signIn, go, mainText, close } from "./h.mjs";
import { launch } from "../lib.mjs";

export const DIR = path.resolve("qa-output/2026-11-12-B");
mkdirSync(path.join(DIR, "state"), { recursive: true });
export { go, mainText, close };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const DESK = { viewport: { width: 1440, height: 900 } };

/** A page signed in as `login`; signs in once and reuses the saved session after that. */
export async function asB(login, opts = DESK, scheme = "light") {
  const file = path.join(DIR, "state", `${login}.json`);
  const ctx = await (await launch()).newContext({ ...opts, colorScheme: scheme, ...(existsSync(file) ? { storageState: file } : {}) });
  // The demo logins have "light" saved as their own theme, which wins over the phone's dark setting
  // (correct). For dark screenshots the page is held on data-theme="dark" without changing their saved choice.
  if (scheme === "dark") await ctx.addInitScript(() => {
    const force = () => { if (document.documentElement && document.documentElement.dataset.theme !== "dark") document.documentElement.dataset.theme = "dark"; };
    new MutationObserver(force).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("DOMContentLoaded", force);
  });
  const page = await ctx.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await go(page, "/dashboard");
  if (page.url().includes("/sign-in")) { await signIn(page, login); await ctx.storageState({ path: file }); }
  return page;
}

export async function snap(page, name, full = false) {
  const f = path.join(DIR, `${name}.png`);
  await page.screenshot({ path: f, fullPage: full });
  return `qa-output/2026-11-12-B/${name}.png`;
}

const LOGF = path.join(DIR, "results.log");
export function rec(name, pass, note = "") {
  const line = `${pass ? "PASS" : "FAIL"} ${name}${note ? " :: " + note : ""}`;
  console.log(line);
  appendFileSync(LOGF, `${new Date().toISOString()} ${line}\n`);
}

/** What a phone user would trip over: sideways scroll, small tap targets, tiny text, sticky bars over inputs. */
export async function phoneCheck(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[aria-hidden=true]"); };
    const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.id || el.tagName).trim().replace(/\s+/g, " ").slice(0, 30);
    const small = [...document.querySelectorAll("button, a[href], [role=button], [role=radio], [role=tab], input[type=checkbox], input[type=radio], select")]
      .filter(vis).filter((el) => { const r = el.getBoundingClientRect(); return r.height < 40 && !(el.tagName === "A" && el.closest("p, li, td") && r.height >= 18) && !el.closest("label"); })
      .map((el) => `${name(el)} (${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)})`);
    const tinyText = [...document.querySelectorAll("main p, main span, main td, main label, main li, main div")]
      .filter((el) => vis(el) && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => `${el.innerText.trim().slice(0, 25)} (${getComputedStyle(el).fontSize})`);
    const wide = [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 0 && vis(el) && !el.closest(".overflow-x-auto, .overflow-auto, [data-scroll-x]"); })
      .slice(0, 4).map((el) => `${el.tagName.toLowerCase()} "${name(el)}" right=${Math.round(el.getBoundingClientRect().right)}`);
    const sticky = [...document.querySelectorAll("body *")].filter((el) => vis(el) && /fixed|sticky/.test(getComputedStyle(el).position) && el.getBoundingClientRect().top > window.innerHeight / 2)
      .map((el) => ({ top: el.getBoundingClientRect().top, h: el.getBoundingClientRect().height, text: name(el) }));
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, small: [...new Set(small)].slice(0, 12), tinyText: [...new Set(tinyText)].slice(0, 8), wide, sticky };
  });
}

/** True when the focused element sits under a fixed/sticky bar at the bottom. */
export async function focusedCovered(page) {
  return page.evaluate(() => {
    const el = document.activeElement; if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(window.innerHeight - 2, Math.max(1, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return { id: el.id || el.name, inView: r.top >= 0 && r.bottom <= window.innerHeight, coveredBy: top && !el.contains(top) && top !== el ? (top.innerText || top.tagName).slice(0, 40) : null };
  });
}
