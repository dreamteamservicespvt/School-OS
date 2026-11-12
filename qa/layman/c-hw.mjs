// Layman C: Give homework as class teacher: empty, start after due, bad max marks, Telugu, double click.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("teacher");
await go(p, "/homework-learning"); await sleep(800);
await p.getByRole("button", { name: "Give homework" }).or(p.getByRole("link", { name: "Give homework" })).first().click(); await sleep(1500);
const sheet = p.getByRole("dialog").filter({ hasText: "Three steps" }).first();
const st = async () => (await sheet.innerText().catch(() => "")).replace(/\n+/g, " | ");
console.log("SHEET\n", (await st()).slice(0, 1500));
const btns = await sheet.locator("button").evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
console.log("BTNS", [...new Set(btns)].join(" / "));
await snap(p, "c-hw-sheet", false);
const submit = sheet.getByRole("button", { name: /^Give homework|^Give|^Save|^Send/ }).last();
const b0 = await st(); await submit.click(); await sleep(1500);
console.log("EMPTY SUBMIT NEW ->", (await st()).split(" | ").filter((x) => !b0.split(" | ").includes(x)));
await snap(p, "c-hw-empty", false);
await sheet.locator("input[name=title]").fill("LC- గణితం హోంవర్క్ 🙂 " + "y".repeat(300));
console.log("title length kept", (await sheet.locator("input[name=title]").inputValue()).length);
await sheet.locator("textarea[name=instructions]").fill("LC- పాఠం 4 చదవండి. पाठ 4 पढ़ें। <b>bold</b>");
await sheet.getByText("Pick a date", { exact: true }).click(); await sleep(800); console.log("gh-due count", await p.locator("#gh-due").count(), await p.locator("[id=gh-due]").evaluateAll((xs) => xs.map((x) => x.tagName + ":" + x.getAttribute("role")))); await snap(p, "c-hw-pick", false);
const due = p.locator("input#gh-due").first(); await due.click(); await due.fill("14-11-2026"); await p.keyboard.press("Escape");
await sheet.getByRole("button", { name: /More details/ }).click(); await sleep(300);
const start = p.locator("input#gh-start").first(); await start.click(); await start.fill(""); await start.fill("20-11-2026"); await p.keyboard.press("Escape");
await sheet.locator("#gh-max").fill("-5");
const b1 = await st();
await snap(p, "c-hw-bad", false);
await submit.click(); await sleep(2500);
console.log("START AFTER DUE + MAX -5 NEW ->", (await st()).split(" | ").filter((x) => !b1.split(" | ").includes(x)), "dialog open:", await sheet.isVisible(), p.url());
await snap(p, "c-hw-bad-after", false);
if (await sheet.isVisible()) {
  await sheet.locator("#gh-max").fill("abc"); await submit.click(); await sleep(2000);
  console.log("MAX abc ->", (await st()).match(/[^|]*(Maximum|marks|number|whole)[^|]*/gi)?.slice(0, 4));
  await sheet.locator("#gh-max").fill("2000"); await submit.click(); await sleep(2000);
  console.log("MAX 2000 ->", (await st()).match(/[^|]*(Maximum|marks|number|whole|too)[^|]*/gi)?.slice(0, 4), "open:", await sheet.isVisible());
}
console.log("PROBLEMS", p.problems);
await close();
