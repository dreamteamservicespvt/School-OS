// Prints one screen as a person sees it: text, form fields and buttons.
// Sessions are kept per login in qa-output/full/state so it signs in once.
//   node qa/full/look.mjs <login> <path> [maxChars]
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { signIn, go, mainText, OUT, close, VIEWPORTS } from "./h.mjs";
import { launch } from "../lib.mjs";

export async function as(login, viewport = VIEWPORTS.desk1440) {
  const dir = path.join(OUT, "state"); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${login}.json`);
  const ctx = await (await launch()).newContext({ viewport, ...(existsSync(file) ? { storageState: file } : {}) });
  const page = await ctx.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("response", (r) => { if (r.status() >= 500) page.problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await go(page, "/dashboard");
  if (page.url().includes("/sign-in")) { await signIn(page, login); await ctx.storageState({ path: file }); }
  return page;
}

export async function controls(page) {
  return page.evaluate(() => {
    const lab = (el) => (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.getAttribute("aria-label") || el.closest("label")?.innerText || el.getAttribute("placeholder") || "";
    const f = [...document.querySelectorAll("main input:not([type=hidden]), main select, main textarea")].filter((e) => e.getBoundingClientRect().width).map((e) => `${e.tagName.toLowerCase()}${e.type ? ":" + e.type : ""}#${e.id || ""}[${e.name || ""}] "${lab(e).trim().slice(0, 40)}"${e.tagName === "SELECT" ? " {" + [...e.options].slice(0, 6).map((o) => o.text).join("|") + "}" : ""}`);
    const b = [...document.querySelectorAll("main button, main a[href]")].filter((e) => e.getBoundingClientRect().width).map((e) => (e.tagName === "A" ? `[${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}](${e.getAttribute("href")})` : `<${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}>`));
    return { fields: f, buttons: [...new Set(b)].slice(0, 60) };
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("look.mjs")) {
  const [login, url, max] = process.argv.slice(2);
  const p = await as(login);
  await go(p, url);
  console.log(`URL ${new URL(p.url()).pathname}${new URL(p.url()).search}`);
  console.log((await mainText(p, Number(max ?? 1500))).trim());
  const c = await controls(p);
  console.log("FIELDS", c.fields.join("\n  "));
  console.log("BUTTONS", c.buttons.join(" "));
  if (p.problems.length) console.log("PROBLEMS", p.problems);
  await close();
}
