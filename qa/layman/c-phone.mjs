// Layman C: phone (390 px) checks + clean up LC drafts.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const check = async (p, name) => {
  const r = await p.evaluate(() => {
    const W = innerWidth; const wide = [];
    for (const el of document.querySelectorAll("main *")) { const b = el.getBoundingClientRect(); if (b.width && b.right > W + 2 && getComputedStyle(el).position !== "fixed") { let s = el; let clip = false; while (s && s !== document.body) { const o = getComputedStyle(s).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { clip = true; break; } s = s.parentElement; } if (!clip) wide.push(`${el.tagName}.${String(el.className).slice(0, 30)} r=${Math.round(b.right)}`); } }
    const tiny = [...document.querySelectorAll("main button, main a")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.height && b.height < 32 && e.innerText.trim(); }).map((e) => e.innerText.trim().slice(0, 20)).slice(0, 6);
    return { sw: document.documentElement.scrollWidth, wide: wide.slice(0, 4), tiny };
  });
  console.log("PHONE", name, JSON.stringify(r));
  await snap(p, `c-phone-${name}`);
};
const a = await asRole("admin");
for (const id of ["343443c8-7b6d-4dda-921f-b7b125ddc77e", "43960a8a-0d5a-4c5a-8d2a-2dea7bb7822a"]) {
  await go(a, `/communication/notices/${id}`); await sleep(800);
  const b = a.getByRole("button", { name: "Archive" }); if (await b.isVisible().catch(() => false)) { await b.click(); await sleep(800); const d = a.getByRole("dialog").last(); if (await d.isVisible().catch(() => false)) { const r = d.locator("textarea, input[type=text]").first(); if (await r.count()) await r.fill("LC cleanup"); await d.getByRole("button", { name: /Archive/ }).last().click(); } await sleep(2000); console.log("archived?", id, (await mainText(a, 300)).replace(/\n+/g, " | ").slice(0, 120)); }
}
await a.setViewportSize({ width: 390, height: 844 });
for (const [n, u] of [["admin-results", "/examination-results/results"], ["admin-reportcards", "/examination-results/report-cards"], ["admin-marks", "/examination-results/marks"], ["admin-notices", "/communication/notices"], ["admin-dashboard", "/dashboard"], ["admin-datesheet", "/examination-results/datesheet"]]) { await go(a, u); await sleep(1200); await check(a, n); }
await a.context().close();
const t = await asRole("teacher");
await t.setViewportSize({ width: 390, height: 844 });
for (const [n, u] of [["teacher-marks", "/examination-results/marks"], ["teacher-homework", "/homework-learning"], ["teacher-notices", "/communication/notices"], ["teacher-dashboard", "/dashboard"], ["teacher-reportcards", "/examination-results/report-cards"]]) { await go(t, u); await sleep(1200); await check(t, n); }
await t.context().close();
const s = await asRole("student");
await s.setViewportSize({ width: 390, height: 844 });
for (const [n, u] of [["student-homework", "/homework-learning"], ["student-quizzes", "/homework-learning/quizzes"], ["student-messages", "/messages"]]) { await go(s, u); await sleep(1200); await check(s, n); }
await close();
