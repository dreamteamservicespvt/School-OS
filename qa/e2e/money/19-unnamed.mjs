// Which links have no name (layoutIssues says "controls without a name: a[]")?
import { as, visit, note } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as("accountant");
await visit(page, process.argv[2] ?? "/fee-management/dashboard", 2500);
const r = await page.evaluate(() => [...document.querySelectorAll("a[href]")].filter((el) => { const b = el.getBoundingClientRect(); if (!b.width) return false; return !(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText?.trim()); }).map((el) => `${el.getAttribute("href")} | ${el.outerHTML.slice(0, 160)} | parent: ${el.parentElement?.innerText?.slice(0, 60)}`));
note(r.join("\n"));
await close();
