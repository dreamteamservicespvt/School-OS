// Settings as the School Admin, through the screens: school details (with
// wrong values first), logo upload (wrong file, then a PNG), a Razorpay test
// account with made-up sandbox keys (test without a real account), and the
// audit log showing those changes. SYNTHETIC values only.
//   node qa/platform/settings-flow.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { close, BASE, shot } from "../lib.mjs";
import { as } from "./util.mjs";

const say = (s, m) => console.log(`${s.padEnd(5)} ${m}`);
const main = async (p) => (await p.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ");
const alerts = async (p) => (await p.locator("[role=alert], [role=status], [aria-live]").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join(" | ");

// A small valid PNG (16x16, one colour), written by hand.
function png() {
  const crc = (buf) => { let c, crcTable = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = crcTable[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(16 * (1 + 48)); for (let y = 0; y < 16; y++) { raw[y * 49] = 0; for (let x = 0; x < 16; x++) raw.set([30, 80, 200], y * 49 + 1 + x * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const dir = "/tmp/qa-platform-files";
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/demo-logo.png`, png());
writeFileSync(`${dir}/not-a-logo.txt`, "this is not an image");

// School details and the logo are changed in the synthetic School B, never in the real school's profile.
const p = await as(process.env.LOGIN ?? "qab.admin");

// 1. School details: a wrong email and website first.
await p.goto(`${BASE}/settings/school-profile`);
const form = p.locator("form").filter({ has: p.getByLabel("School name") }).first();
const email = form.getByLabel("Email");
const website = form.getByLabel("Website address");
const oldEmail = await email.inputValue();
const oldSite = await website.inputValue();
await email.fill("not-an-email");
await website.fill("not a website");
await form.getByRole("button", { name: /Save/ }).first().click();
await p.waitForTimeout(1500);
let t = await main(p);
say(/email|web/i.test(await alerts(p) + t) ? "PASS" : "CHECK", `school details with a wrong email and website: ${(await alerts(p)) || t.match(/[^.]*(email|website)[^.]*\./i)?.[0]}`);
await email.fill(oldEmail || "office@demo-qab.example.in");
const phone = form.getByLabel("Phone");
if (!/^\d{10}$/.test((await phone.inputValue()).replace(/\D/g, ""))) await phone.fill("9000000123");
await website.fill("https://demo-qab.example.in");
await form.getByRole("button", { name: /Save/ }).first().click();
await p.waitForTimeout(1500);
say("INFO", `school details saved: ${await alerts(p)}`);
await p.reload(); await p.waitForTimeout(800);
const site = await p.locator("form").filter({ has: p.getByLabel("School name") }).first().getByLabel("Website address").inputValue();
say(site.includes("demo-qab.example.in") ? "PASS" : "FAIL", `website kept after reload: ${site} (was "${oldSite}")`);

// 2. Logo: a text file, then a PNG.
const fileInput = p.locator("input[type=file]").first();
await fileInput.setInputFiles(`${dir}/not-a-logo.txt`);
await p.getByRole("button", { name: /Upload logo/ }).click().catch(() => {});
await p.waitForTimeout(1500);
say("INFO", `logo as a .txt file: ${(await alerts(p)) || (await main(p)).match(/[^.]*(PNG|JPG|image|logo)[^.]*\./i)?.[0]}`);
await fileInput.setInputFiles(`${dir}/demo-logo.png`);
await p.getByRole("button", { name: /Upload logo/ }).click().catch(() => {});
await p.waitForTimeout(2500);
t = await main(p);
say(/No logo yet/.test(t) ? "FAIL" : "PASS", `logo PNG uploaded: ${(await alerts(p)).slice(0, 120)}; logo img: ${await p.locator("main img").first().getAttribute("src").catch(() => "none")}`);
await shot(p, "settings-school-profile");

// 3. Razorpay test account with made-up keys.
await p.goto(`${BASE}/settings/payment-gateways/new`);
await p.getByLabel("Provider").selectOption({ label: "Razorpay (Online)" }).catch(() => {});
await p.waitForTimeout(400);
await p.getByLabel("Display name").fill("Demo Razorpay sandbox");
const inputs = await p.locator("main form input:visible").evaluateAll((els) => els.map((e) => [e.name, e.type, e.id, document.querySelector(`label[for="${e.id}"]`)?.innerText ?? ""]));
say("INFO", `gateway form fields: ${JSON.stringify(inputs)}`);
for (const [name, type] of inputs) {
  if (/key_?id|keyId|f_keyId/i.test(name)) await p.locator(`[name="${name}"]`).fill("rzp_test_DEMO0000000001");
  else if (/secret/i.test(name) && type !== "radio") await p.locator(`[name="${name}"]`).fill("demo_not_a_real_secret_0000");
}
const testBtn = p.getByRole("button", { name: /Test these details|Test/ }).first();
if (await testBtn.count()) {
  await testBtn.click();
  await p.waitForTimeout(6000);
  say("INFO", `test made-up Razorpay keys: ${(await alerts(p)).slice(0, 300) || (await main(p)).slice(-300)}`);
}
await p.getByRole("button", { name: /^(Save|Add)/ }).first().click();
await p.waitForTimeout(2500);
t = await main(p);
say("INFO", `save Razorpay sandbox: ${p.url().replace(BASE, "")} ${(await alerts(p)).slice(0, 200)} | ${t.slice(0, 300)}`);
await shot(p, "settings-gateway");

// 4. The audit log shows the changes.
await p.goto(`${BASE}/settings/data-security/audit-log`);
await p.waitForTimeout(800);
t = await main(p);
const recent = t.slice(t.indexOf("Export PDF"), t.indexOf("Export PDF") + 600);
say(/School|Logo|Payment|Gateway/i.test(recent) ? "PASS" : "CHECK", `audit log top entries: ${recent}`);
await close();
