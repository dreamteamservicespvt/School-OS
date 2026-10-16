// After the shell fixes: the notifications panel count matches the bell, the
// profile menu links land on their sections.  node qa/platform/verify-ui.mjs [login]
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
const login = process.argv[2] ?? "cems.principal";
const p = await as(login);
await p.goto(`${BASE}/dashboard?view=dashboard`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
const badge = await p.locator('header button[aria-label^="Notifications"]').innerText().catch(() => "");
await p.locator('header button[aria-label^="Notifications"]').click();
await p.waitForTimeout(600);
const head = await p.locator("[role=dialog][aria-label=Notifications] h2 + p").innerText().catch(() => "?");
console.log(`${head.startsWith(badge.trim()) || (!badge.trim() && /caught up/.test(head)) ? "PASS" : "FAIL"} bell badge "${badge.trim()}" and panel "${head}"`);
await p.keyboard.press("Escape");
await p.locator('header button[aria-label="Your profile and settings"]').click();
await p.waitForTimeout(400);
await p.getByRole("menuitem", { name: /Colours and text size/ }).click();
await p.waitForURL(/appearance/, { timeout: 120000 }).catch(() => {});
console.log(`${/\/profile\/appearance/.test(p.url()) ? "PASS" : "FAIL"} "Colours and text size" opens ${p.url().replace(BASE, "")}`);
for (const hash of ["devices", "password"]) {
  await p.goto(`${BASE}/profile#${hash}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  const top = await p.evaluate((h) => document.getElementById(h)?.getBoundingClientRect().top ?? null, hash);
  console.log(`${top !== null && top < 200 ? "PASS" : "FAIL"} /profile#${hash} scrolls to its section (top ${Math.round(top ?? -1)}px)`);
}
await close();
