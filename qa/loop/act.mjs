// Layman loop: one person's steps on the local build, with a screenshot after each.
//   MSYS_NO_PATHCONV=1 QA_SERVER_LOG=tools/app.log node qa/loop/act.mjs <role> <name> <steps.json> [phone]
// steps.json: [{ "go": "/path" } | { "click": "Button or link text" } | { "fill": "Label", "value": "x" }
//              | { "select": "Label", "value": "Option text" } | { "upload": "Label", "file": "path" } | { "wait": 2 } | { "shot": "what" }]
// Prints the main text after each shot (first 600 characters) so the words can be read like a layman would.
import path from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { newPage, mainText, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";

const [role, name, file, phone] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(file, "utf8"));
const OUT = path.resolve("qa-output/loop");
mkdirSync(OUT, { recursive: true });
const vp = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const p = await newPage(vp, { storageState: path.join(OUTA, `state-${role}.json`), ...(phone ? { isMobile: true, hasTouch: true } : {}) });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 160)));
let n = 0;
const settle = async () => { await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}); await sleep(700); };
for (const s of steps) {
  try {
    if (s.go) { await p.goto(new URL(s.go, "http://localhost:3000").href, { timeout: 90000 }); await settle(); }
    else if (s.click) {
      const t = s.click;
      const loc = s.exact === false ? p.getByText(t).first() : p.getByRole("button", { name: t, exact: true }).or(p.getByRole("link", { name: t, exact: true })).or(p.getByRole("radio", { name: t, exact: true })).or(p.getByRole("tab", { name: t, exact: true })).first();
      await loc.click({ timeout: 15000 }); await settle();
    }
    else if (s.fill) { await p.getByLabel(s.fill, { exact: s.exact ?? false }).first().fill(String(s.value), { timeout: 15000 }); }
    else if (s.select) { await p.getByLabel(s.select, { exact: s.exact ?? false }).first().selectOption({ label: s.value }, { timeout: 15000 }); await sleep(300); }
    else if (s.upload) { await p.getByLabel(s.upload).first().setInputFiles(path.resolve(s.file)); await settle(); }
    else if (s.wait) await sleep(s.wait * 1000);
    else if (s.shot) {
      n++;
      const f = path.join(OUT, `${name}-${String(n).padStart(2, "0")}-${s.shot}.png`);
      await p.screenshot({ path: f, fullPage: true }).catch(() => {});
      const t = (await mainText(p, 4000).catch(() => "")).replace(/\n+/g, " | ");
      console.log(`\n[${n} ${s.shot}] ${new URL(p.url()).pathname}${new URL(p.url()).search}\n${t.slice(0, s.chars ?? 600)}`);
    }
  } catch (e) {
    console.log(`\n!! step ${JSON.stringify(s)} failed: ${String(e.message).split("\n")[0]}`);
    n++;
    await p.screenshot({ path: path.join(OUT, `${name}-${String(n).padStart(2, "0")}-FAILED.png`), fullPage: true }).catch(() => {});
    break;
  }
}
if (errs.length) console.log("\npage errors:", errs.join(" | "));
await close();
