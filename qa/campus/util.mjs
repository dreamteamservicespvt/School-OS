// Helpers for the campus QA scripts (Transport, Library, Inventory, Hostel, Staff & HR).
//   QA_OUT=/home/claude/qa-out/campus node qa/campus/<script>.mjs
import { newPage, go, mainText, shot, layoutIssues, close, VIEWPORTS, BASE } from "../lib.mjs";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
export { go, mainText, shot, layoutIssues, close, VIEWPORTS, BASE };

// Sign-in is limited to 30 tries per 10 minutes per address, and every QA agent
// on this machine shares one address. So each login's session is kept on disk
// and reused, and this agent signs in from its own made-up address.
const STATE = process.env.QA_STATE ?? "/home/claude/qa-out/campus/state";
mkdirSync(STATE, { recursive: true });
const IP = `10.44.4.${1 + Math.floor(Math.random() * 250)}`;
export async function asUser(login, viewport = VIEWPORTS.laptop1280) {
  const file = path.join(STATE, `${login}.json`);
  if (existsSync(file)) {
    const page = await newPage(viewport, { storageState: file, extraHTTPHeaders: { "x-forwarded-for": IP } });
    await page.goto(`${BASE}/notifications`);
    if (!page.url().includes("/sign-in")) return page;
    await page.context().close();
  }
  const page = await newPage(viewport, { extraHTTPHeaders: { "x-forwarded-for": IP } });
  // Like signIn() in ../lib.mjs, but waits for the next page instead of a quiet network (dashboards poll).
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel(/username|mobile|login/i).first().fill(login);
  await page.getByLabel(/password/i).first().fill(process.env.QA_PASSWORD ?? "QaDemo#2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 45_000 }).catch(() => {});
  if (page.url().includes("/sign-in")) throw new Error(`Sign-in failed for ${login}: ${await mainText(page, 400)}`);
  await page.context().storageState({ path: file });
  return page;
}

const RES = path.resolve(process.env.QA_RESULTS ?? "qa/results/campus.jsonl");
mkdirSync(path.dirname(RES), { recursive: true });
/** One result line in qa/results/campus.jsonl. */
export function result(row) {
  if (!process.env.QA_NO_RECORD) appendFileSync(RES, JSON.stringify(row) + "\n");
  console.log(`[${row.status}] ${row.module} · ${row.page} · ${row.action} (${row.role}) — ${String(row.actual).slice(0, 300)}`);
}

/** Visible form controls with their labels, names and types. */
export async function fields(page, scope = "body") {
  return page.evaluate((sel) => {
    const root = [...document.querySelectorAll(sel)].pop() ?? document.body;
    return [...root.querySelectorAll("input, select, textarea, button")].filter((el) => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    }).map((el) => {
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText) || el.closest("label")?.innerText || el.getAttribute("aria-label") || el.innerText || "";
      const opts = el.tagName === "SELECT" ? [...el.options].slice(0, 10).map((o) => `${o.value.slice(0, 8)}=${o.text}`).join("|") : "";
      return `${el.tagName.toLowerCase()}[name=${el.name ?? ""} type=${el.type ?? ""}] "${lab.trim().replace(/\s+/g, " ").slice(0, 60)}"${opts ? " {" + opts + "}" : ""}`;
    });
  }, scope);
}

/** Text of the open dialogs/sheets. */
export async function dialogText(page) {
  return page.evaluate(() => [...document.querySelectorAll("dialog[open], dialog[open]")].map((d) => d.innerText).join("\n---\n").replace(/\n{2,}/g, "\n"));
}
/** Toasts and live messages. */
export async function toastText(page) {
  return page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], [aria-live]")].map((d) => d.innerText).filter(Boolean).join(" | ").replace(/\s+/g, " "));
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fills a field found by its label inside the last open dialog (or the page). */
export async function fill(page, label, value, scope) {
  const root = scope ?? page.locator("dialog[open]").last();
  const el = root.getByLabel(label, { exact: false }).first();
  const tag = await el.evaluate((e) => e.tagName);
  if (tag === "SELECT") await el.selectOption(typeof value === "string" ? { label: value } : value);
  else await el.fill(String(value));
}
