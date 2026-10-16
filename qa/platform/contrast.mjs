// Text contrast (WCAG 4.5:1 for body text, 3:1 for large text) in light and dark
// themes. Dark is set on the page only (data-theme), not saved to the login.
//   node qa/platform/contrast.mjs [login] [urls...]
import { close, BASE, shot } from "../lib.mjs";
import { as } from "./util.mjs";

const [login = "cems.admin", ...given] = process.argv.slice(2);
const urls = given.length ? given : ["/dashboard", "/student-management", "/fee-management", "/settings", "/reports-analytics", "/settings/data-security/audit-log"];
const p = await as(login);
for (const theme of ["light", "dark"]) {
  for (const url of urls) {
    await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(700);
    await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m || !c.startsWith("rgb")) return null; return { rgb: m.slice(0, 3).map(Number), a: m[3] === undefined ? 1 : Number(m[3]) }; };
      // Resolve any colour format through a canvas, so oklch() and color() work too.
      const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 }; };
      const col = (c) => parse(c) ?? rgba(c);
      const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c === "transparent" || c === "rgba(0, 0, 0, 0)") continue; const b = col(c); if (b.a > 0.6) return b.rgb; } return col(getComputedStyle(document.body).backgroundColor).rgb; };
      const low = [];
      let n = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) continue;
        const rect = el.getBoundingClientRect(); if (!rect.width || !rect.height) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden" || Number(cs.opacity) < 0.3) continue;
        if (el.closest("[disabled], [aria-disabled=true], .sr-only")) continue;
        n++;
        const fg = col(cs.color).rgb, bg = bgOf(el);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) low.push(`${ratio.toFixed(2)} ${cs.fontSize} "${el.textContent.trim().slice(0, 28)}" (${String(el.className).split(" ").filter((c) => /text-|ink|muted/.test(c)).join(" ")})`);
      }
      return { bg: getComputedStyle(document.body).backgroundColor, n, low };
    });
    const uniq = [...new Set(r.low.map((x) => x.replace(/^[\d.]+ /, "").replace(/"[^"]*"/, "")))];
    console.log(`${theme} ${url}: body ${r.bg}; ${r.low.length}/${r.n} texts below the line; kinds: ${uniq.slice(0, 6).join(" ; ")}`);
    console.log(`   e.g. ${r.low.slice(0, 4).join(" ; ")}`);
    if (theme === "dark") await shot(p, `dark-${url.replace(/\W+/g, "_")}`, false);
  }
}
await close();
