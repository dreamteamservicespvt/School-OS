// Layman C crawl: every screen in Exams, Homework, Communication, Dashboard per role.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
import { writeFileSync } from "node:fs";
const roles = (process.argv[2] ?? "admin,principal,teacher,subjectteacher,student").split(",");
const pages = [
  "/dashboard", "/dashboard/tasks",
  "/examination-results", "/examination-results/datesheet", "/examination-results/datesheet/new", "/examination-results/marks",
  "/examination-results/results", "/examination-results/results/moderation", "/examination-results/report-cards",
  "/examination-results/admit-cards", "/examination-results/analysis", "/examination-results/question-papers", "/examination-results/settings",
  "/homework-learning", "/homework-learning/submissions", "/homework-learning/study-material", "/homework-learning/quizzes",
  "/homework-learning/online-classes", "/homework-learning/discussions", "/homework-learning/learning-progress", "/homework-learning/settings",
  "/communication", "/communication/notices", "/communication/notices/new", "/communication/inbox", "/communication/history",
  "/communication/templates", "/communication/templates/new", "/communication/queries", "/communication/queries/new",
  "/communication/surveys", "/communication/surveys/new", "/communication/parent-link", "/communication/parent-link/send",
  "/communication/parent-link/consent", "/communication/settings", "/communication/settings/log", "/messages", "/notifications",
];
const out = {};
for (const role of roles) {
  const p = await asRole(role);
  out[role] = [];
  for (const u of pages.slice(Number(process.env.FROM ?? 0))) {
    p.problems.length = 0;
    const t0 = Date.now();
    await go(p, u).catch((e) => p.problems.push("nav " + e.message.slice(0, 80)));
    await sleep(400);
    const ms = Date.now() - t0;
    await p.waitForLoadState("load").catch(() => {});
    const t = await mainText(p, 20000).catch(async () => { await sleep(3000); return mainText(p, 20000).catch(() => "TEXT-ERR"); });
    const path = new URL(p.url()).pathname;
    const bad = [];
    for (const re of [/\bundefined\b/, /\bnull\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/, /Something went wrong|Application error|Internal Server Error|could not be found/i]) {
      const m = t.match(new RegExp(`[^\n]{0,40}${re.source}[^\n]{0,40}`, re.flags)); if (m) bad.push(m[0]);
    }
    const dates = [...t.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)].map((m) => m[0]).slice(0, 3);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth).catch(() => 0); const _x = 0 && await p.evaluate(() => document.documentElement.scrollWidth);
    const h1 = (await p.locator("h1").first().innerText({ timeout: 3000 }).catch(() => "")).trim();
    const links = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/"))).catch(() => []);
    const name = `${role}${u.replace(/\//g, "_")}`;
    await snap(p, name);
    const row = { u, path, h1, ms, bad, dates, sw, problems: [...p.problems], links: [...new Set(links)].slice(0, 60), text: t.slice(0, 2500) };
    out[role].push(row);
    console.log(role, u, "->", path, `"${h1}"`, ms + "ms", bad.length ? "BAD " + JSON.stringify(bad) : "", dates.length ? "DATES " + dates : "", p.problems.length ? "PROB " + p.problems.join(" ; ").slice(0, 200) : "");
  }
  await p.context().close();
}
writeFileSync(`${process.env.QA_OUT}/crawl-${roles.join("-")}-${process.env.FROM ?? 0}.json`, JSON.stringify(out, null, 2));
await close();
