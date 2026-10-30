// G1: the main screen of every menu module in light and dark at 390 px and 1440 px.
// Checks sideways scrolling, controls without a name and text below 4.5:1 contrast,
// then puts the shots on contact sheets (qa-output/full/looks/sheet-*.png) to look at.
//   node qa/full/looks.mjs [login=principal]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { signIn, go, menu, layoutIssues, saveJson, OUT, VIEWPORTS, pageState } from "./h.mjs";
import { launch } from "../lib.mjs";

const login = process.argv[2] ?? "principal";
const dir = path.join(OUT, "looks"); mkdirSync(dir, { recursive: true });
const b = await launch();

/** Visible text whose colour is below 4.5:1 (3:1 for large text) on the nearest solid background. */
function lowContrast() {
  const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, bl]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.9) return c; } return [255, 255, 255]; };
  const out = [];
  for (const el of document.querySelectorAll("main *, header *, nav *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || cs.visibility === "hidden" || Number(cs.opacity) < 0.5 || el.closest("[aria-hidden=true], [disabled], .sr-only")) continue;
    const fg = rgb(cs.color); if ((fg[3] ?? 1) < 0.5) continue;
    const [l1, l2] = [lum(fg), lum(bgOf(el))].sort((a, z) => z - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} "${el.innerText.trim().slice(0, 40)}"`);
  }
  return [...new Set(out)].slice(0, 6);
}

async function ctxFor(theme, vp) {
  const ctx = await b.newContext({ viewport: VIEWPORTS[vp] });
  const page = await ctx.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  await signIn(page, login);
  await ctx.addCookies([{ name: "sos_theme", value: theme, url: page.url() }]);
  return page;
}

const rows = [];
let items;
for (const vp of ["desk1440", "phone390"]) {
  for (const theme of ["light", "dark"]) {
    const page = await ctxFor(theme, vp);
    if (!items) { await page.setViewportSize(VIEWPORTS.desk1440); items = await menu(page); await page.setViewportSize(VIEWPORTS[vp]); }
    for (const it of items) {
      page.problems.length = 0;
      await go(page, it.href);
      await page.waitForTimeout(500);
      const name = `${it.href.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${vp}-${theme}`;
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const st = await pageState(page);
      const theme_ = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      rows.push({ module: it.text, href: it.href, vp, theme, appliedTheme: theme_, file, broken: st.broken, layout: await layoutIssues(page).catch(() => []), contrast: await page.evaluate(lowContrast).catch((e) => [`check failed ${e.message}`]), problems: [...page.problems] });
      console.log(`${vp} ${theme} ${it.text}: ${rows.at(-1).layout.length} layout, ${rows.at(-1).contrast.length} contrast`);
    }
    await page.context().close();
  }
}
saveJson(`looks-${login}.json`, rows);

// Contact sheets: one per size and theme, 4 across, for a person (or Claude) to look at.
const sheet = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
for (const vp of ["desk1440", "phone390"]) for (const theme of ["light", "dark"]) {
  const set = rows.filter((r) => r.vp === vp && r.theme === theme);
  const cols = vp === "phone390" ? 6 : 4;
  const html = `<body style="margin:0;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${set.map((r) => `<figure style="margin:0;background:#fff"><img src="file:///${r.file.replace(/\\/g, "/")}" style="width:100%;display:block"><figcaption style="padding:2px 4px">${r.module}</figcaption></figure>`).join("")}</body>`;
  const f = path.join(dir, `sheet-${vp}-${theme}.html`);
  writeFileSync(f, html);
  await sheet.goto(`file:///${f.replace(/\\/g, "/")}`);
  await sheet.waitForTimeout(800);
  await sheet.screenshot({ path: path.join(dir, `sheet-${vp}-${theme}.png`), fullPage: true });
}
console.log(JSON.stringify({ shots: rows.length, layout: rows.filter((r) => r.layout.length).map((r) => [r.href, r.vp, r.theme, r.layout]), contrast: rows.filter((r) => r.contrast.length).map((r) => [r.href, r.vp, r.theme, r.contrast]), wrongTheme: rows.filter((r) => r.appliedTheme !== r.theme).length, broken: rows.filter((r) => r.broken).map((r) => r.href) }, null, 1));
await b.close();
