import { asRole, go, mainText, sleep, close, snap } from "./d-h.mjs";
const p = await asRole("admin");
await go(p, "/events-calendar/events?status=all"); await sleep(1500);
const links = await p.evaluate(() => [...document.querySelectorAll("main a[href*='/events-calendar/events/']")].map((a) => [a.innerText.trim().slice(0, 60), a.getAttribute("href"), a.getAttribute("aria-label")]));
const mine = links.filter((l) => /LD-|Annual 1412/.test(l.join(" ")));
console.log(mine);
for (const [, h] of mine.slice(0, 2)) { await go(p, h); await sleep(1500); console.log(h, (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 700)); await snap(p, "ev-detail"); }
await close();
