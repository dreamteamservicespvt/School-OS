// Opens a page as someone, clicks the named buttons in order, prints the screen and its form.
//   MSYS_NO_PATHCONV=1 node qa/full/peek.mjs <login> <path> ["Button name" ...]
import { as, controls } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [login, url, ...clicks] = process.argv.slice(2);
const p = await as(login);
await go(p, url);
for (const c of clicks) { await p.getByRole("button", { name: c, exact: true }).or(p.getByRole("link", { name: c, exact: true })).first().click(); await p.waitForTimeout(1500); }
const dlg = p.getByRole("dialog");
const scope = (await dlg.count()) ? dlg.last() : p.locator("main");
console.log("URL", new URL(p.url()).pathname + new URL(p.url()).search);
console.log((await scope.innerText()).replace(/\n{2,}/g, "\n").slice(0, 2500));
const f = await scope.evaluate((root) => [...root.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((e) => e.getBoundingClientRect().width).map((e) => `${e.tagName.toLowerCase()}:${e.type}#${e.id}[${e.name}] "${((e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.getAttribute("aria-label") || e.placeholder || "").trim().slice(0, 40)}"${e.required ? " *" : ""}${e.tagName === "SELECT" ? " {" + [...e.options].slice(0, 8).map((o) => o.text).join("|") + "}" : ""}`));
console.log("FIELDS\n  " + f.join("\n  "));
console.log("BUTTONS", (await scope.locator("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(" | ").slice(0, 800));
await shot(p, `peek-${login}-${url.replace(/[^a-z0-9]+/gi, "_")}-${clicks.length}`, false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
