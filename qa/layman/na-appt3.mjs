import { asRole, close, txt, snap, log, go, sleep } from "./na-h.mjs";
const p = await asRole("reception");
const open = async () => { await go(p, "/front-office/appointments"); await p.getByRole("link", { name: /Book appointment/ }).first().click(); await sleep(2500); return p.locator('[role="dialog"]:visible, dialog[open]').last(); };
const d = await open();
await d.locator("#bk-date").selectOption({ label: "Mon 16" }); await sleep(2000);
await d.getByRole("button", { name: "10:30 AM", exact: true }).click();
await d.locator("#bk-phone").pressSequentially("9848012398");
await d.locator('input[name="visitorName"]').pressSequentially("NA-Single Click Parent 02");
await d.locator('input[name="purpose"]').pressSequentially("NA- fee doubt");
await d.getByRole("button", { name: /^Book$/ }).click();
for (let i = 0; i < 8; i++) { await sleep(500); const s = await p.locator('[data-sonner-toast], [role=status]').allInnerTexts().catch(() => []); if (s.join("").trim()) { log("toast: " + s.join(" / ")); break; } }
await sleep(1500);
log(`single click: dialog visible=${await d.isVisible().catch(() => false)} url=${p.url()}`);
await snap(p, "appt-single");
// list for Mon 16
await go(p, "/front-office/appointments");
await p.getByRole("button", { name: "Mon 16" }).first().click().catch(()=>{}); await sleep(2500);
log("MON16 list: " + (await txt(p, 4000)).replace(/\n/g, " | "));
await snap(p, "appt-mon16-list");
await close();
