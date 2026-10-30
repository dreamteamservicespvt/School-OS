// B6: a parent opens their Parent Link (no password), confirms the phone with a code if asked, and sees only their child.
//   node qa/full/b6-parent.mjs <link> [path after the link, e.g. /attendance]
import { newPage, go, mainText, shot, close, logSize, waitLog } from "./h.mjs";
const [link, sub] = process.argv.slice(2);
const p = await newPage({ width: 390, height: 844 });
p.problems = []; p.on("pageerror", (e) => p.problems.push(e.message.split("\n")[0]));
await go(p, link);
let t = await mainText(p, 1500);
console.log("FIRST", t.replace(/\n+/g, " | ").slice(0, 600));
const from = logSize();
const sendBtn = p.locator("main button, button").first();
if (/code|कोड|కోడ్/i.test(t) && (await sendBtn.count())) {
  await sendBtn.click(); await p.waitForTimeout(2000);
  const m = await waitLog(from, /\[dev\][^\n]*code[^\n]*?(\d{6})/i);
  console.log("CODE LINE", m?.[0]);
  if (m) { const box = p.locator("input[autocomplete=one-time-code], input[inputmode=numeric]").first(); await box.pressSequentially(m[1], { delay: 40 }); const v = p.locator("button[type=submit]").first(); if (await v.isVisible().catch(() => false)) await v.click().catch(() => {}); await p.waitForTimeout(4000); }
}
if (sub) await go(p, new URL(p.url()).pathname + sub);
t = await mainText(p, 4000);
console.log("PAGE", new URL(p.url()).pathname, "\n", t.replace(/\n+/g, " | ").slice(0, 2500));
console.log("LINKS", (await p.locator("a[href]").evaluateAll((as) => as.map((a) => `${a.innerText.trim().slice(0, 25)}=>${a.getAttribute("href")}`))).slice(0, 25).join(" ; "));
await shot(p, `b6-parent${sub ? sub.replace(/\W+/g, "_") : ""}`, true);
console.log("PROBLEMS", p.problems);
await p.context().storageState({ path: "qa-output/full/state/parent-sanjay.json" });
await close();
