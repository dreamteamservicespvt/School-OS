import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("teacher");
await go(p, "/homework-learning"); await sleep(800); await p.getByRole("button", { name: "Give homework" }).or(p.getByRole("link", { name: "Give homework" })).first().click(); await sleep(1500);
const sheet = p.getByRole("dialog").filter({ hasText: "Three steps" }).first();
const st = async () => (await sheet.innerText().catch(() => "CLOSED")).replace(/\n+/g, " | ");
const submit = sheet.getByRole("button", { name: /^Send to/ });
const waitDone = async () => { for (let i = 0; i < 60; i++) { await sleep(500); if (!(await sheet.isVisible().catch(() => false))) return "closed"; if (!/Sending…/.test(await st())) return "done"; } return "still sending after 30s"; };
await sheet.locator("button, [role=radio]").filter({ hasText: /^6 A/ }).first().click(); await sleep(500);
await sheet.locator("input[name=title]").fill("LC- గణితం హోంవర్క్ 🙂 " + "y".repeat(300));
await sheet.getByText("Pick a date", { exact: true }).click(); await sleep(500);
const due = p.locator("input#gh-due"); await due.click(); await due.fill("14-11-2026"); await p.keyboard.press("Escape");
await sheet.getByRole("button", { name: /More details/ }).click(); await sleep(300);
const start = p.locator("input#gh-start"); await start.click(); await start.fill("20-11-2026"); await p.keyboard.press("Escape");
const cases = [["-5"], ["2000"], ["10"]];
for (const [mx] of cases) {
  await sheet.locator("#gh-max").fill(mx);
  const b = await st(); const t0 = Date.now();
  await submit.click(); const r = await waitDone();
  console.log(`START 20-11 > DUE 14-11, title 322, max ${mx}: ${r} in ${Date.now() - t0}ms NEW:`, JSON.stringify((await st()).split(" | ").filter((x) => !b.split(" | ").includes(x))).slice(0, 500));
  await snap(p, `c-hw2-max${mx}`, false);
  if (r === "closed") break;
}
console.log("URL", p.url(), "TOAST", (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 200));
console.log("PROBLEMS", p.problems);
await close();
