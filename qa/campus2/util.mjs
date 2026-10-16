// Helpers for the campus2 QA scripts (Inventory, Hostel, Staff & HR, and one Library leftover).
//   QA_OUT=/home/claude/qa-out/campus2 node qa/campus2/<script>.mjs
// Results go to qa/results/campus2.jsonl. Sessions are kept on disk (sign-in is rate limited).
import { newPage, go, mainText, shot, layoutIssues, close, VIEWPORTS, BASE } from "../lib.mjs";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
export { go, mainText, shot, layoutIssues, close, VIEWPORTS, BASE };
export { fields, dialogText, toastText, sleep } from "../campus/util.mjs";

const STATE = process.env.QA_STATE ?? "/home/claude/qa-out/campus2/state";
mkdirSync(STATE, { recursive: true });
const IP = `10.45.5.${1 + Math.floor(Math.random() * 250)}`;
export async function asUser(login, viewport = VIEWPORTS.laptop1280) {
  const file = path.join(STATE, `${login}.json`);
  const mk = (opts = {}) => newPage(viewport, { extraHTTPHeaders: { "x-forwarded-for": IP }, ...opts }).then((p) => { p.setDefaultNavigationTimeout(120_000); p.setDefaultTimeout(30_000); return p; });
  if (existsSync(file)) {
    const page = await mk({ storageState: file });
    await page.goto(`${BASE}/notifications`);
    if (!page.url().includes("/sign-in")) return page;
    await page.context().close();
  }
  const page = await mk();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/username|mobile|login/i).first().fill(login);
  await page.getByLabel(/password/i).first().fill(process.env.QA_PASSWORD ?? "QaDemo#2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 45_000 }).catch(() => {});
  if (page.url().includes("/sign-in")) throw new Error(`Sign-in failed for ${login}: ${await mainText(page, 400)}`);
  await page.context().storageState({ path: file });
  return page;
}

const RES = path.resolve(process.env.QA_RESULTS ?? "qa/results/campus2.jsonl");
mkdirSync(path.dirname(RES), { recursive: true });
/** One result line in qa/results/campus2.jsonl. Fields: module, page, action, role, expected, actual, status, defect. */
export function record(row) {
  if (!process.env.QA_NO_RECORD) appendFileSync(RES, JSON.stringify({ ...row, actual: String(row.actual).slice(0, 700) }) + "\n");
  console.log(`[${row.status}] ${row.module} · ${row.page} · ${row.action} (${row.role}) — ${String(row.actual).slice(0, 300)}`);
}

/** Opens a URL and waits for a dialog to open (sheets opened by ?open=...). */
export async function openDialog(page, url) {
  await go(page, url);
  for (let i = 0; i < 30 && !(await page.locator("dialog[open]").count()); i++) await new Promise((r) => setTimeout(r, 500));
  return page.locator("dialog[open]").count();
}
/** Field errors, alerts and toasts on screen. */
export async function said(page) {
  return (await page.evaluate(() => [...document.querySelectorAll("[id$=-error], [role=alert], [role=status], [aria-live], p.text-bad")].map((e) => e.innerText.trim()).filter(Boolean).join(" | ")).catch(() => "")).replace(/\s+/g, " ");
}
/** Clicks a dialog's submit button and waits for it to close or show errors. */
export async function send(page, label) {
  await page.locator("dialog[open]").getByRole("button", { name: label }).last().click();
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 600)); if (!(await page.locator("dialog[open]").count())) break; if (await page.locator("dialog[open] [aria-invalid=true], dialog[open] [role=alert]").count()) break; }
  await new Promise((r) => setTimeout(r, 600));
  return { open: await page.locator("dialog[open]").count(), s: await said(page) };
}
/** Opens a page; reports whether the person was refused. */
export async function opens(page, url) {
  let res;
  try { res = await go(page, url); } catch { await new Promise((r) => setTimeout(r, 2000)); res = await go(page, url); }
  const final = page.url().replace(/^https?:\/\/[^/]+/, "");
  const text = await mainText(page, 800);
  const refused = /\/no-access|\/sign-in/.test(final) || /do not have access|not part of your role|You do not have permission|No access|not switched on|isn.t switched on/i.test(text) || (res && res.status() === 404);
  return { refused, final, status: res?.status(), text };
}
