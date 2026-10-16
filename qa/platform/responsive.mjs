// About 25 key pages at ten screen widths: sideways scrolling, unnamed controls,
// page errors, and (on a few) dark mode text contrast.
//   node qa/platform/responsive.mjs [login=cems.admin]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { close, BASE, OUT, VIEWPORTS, layoutIssues, shot } from "../lib.mjs";
import { as } from "./util.mjs";

const login = process.argv[2] ?? "cems.admin";
const PAGES = [
  "/dashboard", "/students", "/students/new", "/admissions", "/attendance", "/attendance/students",
  "/fee-management", "/fee-management/dashboard", "/finance", "/exams", "/homework", "/staff-hr", "/salary",
  "/communication", "/front-office", "/transport", "/library", "/inventory", "/hostel", "/events",
  "/reports-analytics", "/settings", "/settings/users", "/settings/data-security/audit-log", "/approvals",
  "/notifications", "/messages", "/profile",
];
const p = await as(login);
const rows = [];
for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  await p.setViewportSize(vp);
  for (const url of PAGES) {
    p.problems.length = 0;
    const res = await p.goto(BASE + url, { waitUntil: "domcontentloaded" }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }));
    await p.waitForTimeout(500);
    const notHere = /This page is not here/.test(await p.locator("body").innerText().catch(() => ""));
    const issues = notHere ? ["page not here"] : await layoutIssues(p).catch((e) => [`check failed: ${e.message.slice(0, 80)}`]);
    // Small tap targets on phones (under 24px either side), counted.
    const tiny = vp.width < 500 ? await p.evaluate(() => [...document.querySelectorAll("main button, main a[href], main input:not([type=hidden]), main select")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24) && !(el.tagName === "A" && getComputedStyle(el).display === "inline"); }).length) : 0;
    if (tiny > 0) issues.push(`${tiny} small tap targets`);
    if (p.problems.length) issues.push(...p.problems.slice(0, 3));
    rows.push({ vp: vpName, url, status: res?.status?.(), landed: p.url().replace(BASE, ""), issues });
    if (issues.some((i) => !/small tap targets/.test(i))) {
      console.log(`${vpName} ${url}: ${issues.join(" | ")}`);
      await shot(p, `resp-${vpName}-${url.replace(/\W+/g, "_")}`, false).catch(() => {});
    }
  }
}
// Dark mode on a few pages: text colour against the computed background.
await p.setViewportSize(VIEWPORTS.laptop1280);
await p.emulateMedia({ colorScheme: "dark" });
for (const url of ["/dashboard", "/students", "/fee-management", "/settings", "/reports-analytics", "/sign-in"]) {
  await p.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(500);
  const low = await p.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] === undefined ? 1 : Number(m[3]) }; };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = lum(getComputedStyle(e).backgroundColor); if (b && b.a > 0.5) return b.l; } return lum(getComputedStyle(document.body).backgroundColor)?.l ?? 1; };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const fg = lum(getComputedStyle(el).color); if (!fg) continue;
      const bg = bgOf(el); const [hi, lo] = fg.l > bg ? [fg.l, bg] : [bg, fg.l];
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < 4.5) out.push(`${ratio.toFixed(1)} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return { dark: lum(getComputedStyle(document.body).backgroundColor)?.l < 0.2, low: out.slice(0, 6), count: out.length };
  });
  rows.push({ vp: "dark1280", url, issues: low.count ? [`${low.count} texts under 4.5:1: ${low.low.join("; ")}`] : [], dark: low.dark });
  console.log(`dark ${url}: dark background=${low.dark}; low contrast ${low.count}${low.count ? ": " + low.low.join("; ") : ""}`);
  await shot(p, `dark-${url.replace(/\W+/g, "_")}`, false);
}
writeFileSync(path.join(OUT, `responsive-${login}.json`), JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.issues.some((i) => /sideways|without a name|pageerror|HTTP 5/.test(i)));
console.log(`${rows.length} page views; with sideways scroll/unnamed/errors: ${bad.length}`);
await close();
