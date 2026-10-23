import { as, visit, VIEWPORTS } from "./h.mjs";
import { close } from "../../lib.mjs";
const p = await as("teacher", VIEWPORTS.laptop1280);
await visit(p, "/homework-learning", 1500);
const info = await p.evaluate(() => [...document.querySelectorAll("a[href]")].filter((el) => { const r = el.getBoundingClientRect(); if (!r.width) return false; return !(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText?.trim()); }).map((a) => `${a.getAttribute("href")} html=${a.outerHTML.slice(0, 200)}`));
console.log(info.join("\n"));
await close();
