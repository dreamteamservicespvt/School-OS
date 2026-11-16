import { asRole, close, txt, snap, log, go, sleep } from "./na-h.mjs";
const p = await asRole("reception");
await go(p, "/front-office/appointments"); await p.getByRole("link", { name: /Book appointment/ }).first().click(); await sleep(2500);
const d = p.locator('[role="dialog"]:visible, dialog[open]').last();
// 1. empty Book
await d.getByRole("button", { name: /^Book$/ }).click(); await sleep(1500);
log("EMPTY BOOK: " + (await d.innerText()).split("\n").filter((l) => /need|pick|enter|type|choose|must|missing|valid/i.test(l)).join(" | "));
await snap(p, "appt-empty");
await d.locator("#bk-date").selectOption({ label: "Mon 16" }); await sleep(2000);
const timeSec = await d.innerText();
console.log(timeSec.slice(timeSec.indexOf("Time *"), timeSec.indexOf("Length *")));
const btns = await d.evaluate((el) => [...el.querySelectorAll("button")].map((b) => b.innerText.trim() + (b.disabled ? "(off)" : "")).filter(Boolean));
console.log(btns.join(" | "));
await snap(p, "appt-mon16");
await close();
