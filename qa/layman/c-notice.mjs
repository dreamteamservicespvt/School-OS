// Layman C: New notice as School Admin: empty save, Telugu/Hindi/emoji, expiry before publish, double click, draft list.
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
await go(p, "/communication/notices/new"); await sleep(800);
const base = await mainText(p, 20000);
const diff = async () => (await mainText(p, 20000)).split("\n").filter((l) => !base.includes(l)).slice(0, 8);
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(1500);
console.log("EMPTY DRAFT ->", new URL(p.url()).pathname, JSON.stringify(await diff()));
const v1 = await p.locator("#n-title").evaluate((e) => e.validationMessage);
console.log("browser validation:", v1);
await snap(p, "c-notice-empty", false);
// Title of only spaces
await p.locator("#n-title").fill("     "); await p.locator("#n-body").fill("     ");
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(2500);
console.log("SPACES ->", new URL(p.url()).pathname, JSON.stringify(await diff()));
await snap(p, "c-notice-spaces", false);
// Telugu/Hindi/emoji, expiry before publish
await go(p, "/communication/notices/new"); await sleep(800);
const title = "LC- సెలవు ప్రకటన / छुट्टी की सूचना 🎉 " + "x".repeat(200);
await p.locator("#n-title").fill(title);
console.log("title kept length", (await p.locator("#n-title").inputValue()).length);
await p.locator("#n-body").fill("LC- ప్రియమైన తల్లిదండ్రులకు,\nసోమవారం పాఠశాలకు సెలవు.\nप्रिय अभिभावक, सोमवार को छुट्टी है। 🙏\n<script>alert(1)</script> & \"quotes\"");
// Class 1 A only
const sec = p.locator("label", { hasText: /^A$/ }).nth(3); // Nursery A, LKG A, UKG A, Class 1 A
await sec.locator("input").check();
await p.locator("#n-publishAt").click(); await p.locator("#n-publishAt").fill("20-11-2026"); await p.keyboard.press("Escape");
await p.locator("#n-expiresOn").click(); await p.locator("#n-expiresOn").fill("15-11-2026"); await p.keyboard.press("Escape");
await sleep(400);
await snap(p, "c-notice-filled");
await p.getByRole("button", { name: "Save draft" }).click(); await sleep(3000);
console.log("EXPIRES BEFORE PUBLISH ->", new URL(p.url()).pathname, JSON.stringify(await diff()));
await snap(p, "c-notice-expiry");
// 31-02 date
await p.locator("#n-expiresOn").click(); await p.locator("#n-expiresOn").fill("31-02-2027"); await p.keyboard.press("Tab"); await sleep(500);
console.log("31-02 shows:", await p.locator("#n-expiresOn").inputValue(), JSON.stringify(await diff()));
await p.locator("#n-expiresOn").fill(""); await p.locator("#n-expiresOn").fill("30-12-2026"); await p.keyboard.press("Escape"); await p.keyboard.press("Tab");
// Double click Save draft
const b = p.getByRole("button", { name: "Save draft" });
await b.dblclick().catch(() => {}); await sleep(4000);
console.log("DOUBLE DRAFT ->", p.url(), JSON.stringify(await diff()));
await snap(p, "c-notice-saved");
// Count LC drafts
await go(p, "/communication/notices"); await sleep(800);
for (const tab of ["Waiting", "Archive", "Draft", "Drafts"]) {
  const t = p.getByRole("tab", { name: new RegExp(tab) }).or(p.getByRole("button", { name: new RegExp(`^${tab}`) })).first();
  if (await t.isVisible().catch(() => false)) { await t.click(); await sleep(1200); const x = await mainText(p, 8000); console.log("TAB", tab, "LC rows:", (x.match(/LC- [^\n]{0,60}/g) ?? []).join(" || ")); await snap(p, `c-notice-tab-${tab}`, false); }
}
const s = p.getByPlaceholder(/Notice title/); await s.fill("LC-"); await sleep(1500);
console.log("SEARCH LC- :", (await mainText(p, 8000)).replace(/\n+/g, " | ").slice(0, 900));
console.log("PROBLEMS", p.problems);
await close();
