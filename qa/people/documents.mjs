// Documents & Verification: upload good/bad files, verify, reject, original seen.
import { writeFileSync, mkdirSync } from "node:fs";
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const APP = process.argv[2];
const M = "Admission Management", P = "Documents & Verification", R = "Admission Counsellor";
const dir = "/home/claude/qa-out/people/files";
mkdirSync(dir, { recursive: true });
const pdf = `${dir}/demo-birth-certificate.pdf`;
writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const fake = `${dir}/demo-photo.png`;
writeFileSync(fake, "MZ this is not an image, it is a program\n");
const big = `${dir}/demo-big.pdf`;
writeFileSync(big, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(6 * 1024 * 1024, 32)]));
const png = `${dir}/demo-address.png`;
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const page = await as("cems.admissions");
const url = `/admission-management/documents?id=${APP}`;
const sheet = () => page.locator("dialog[open]").last();
const panelText = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");

async function upload(label, file, typeLabel) {
  await go(page, url);
  const rows = page.locator("li").filter({ hasText: typeLabel });
  await rows.first().getByRole("button", { name: "Upload" }).click();
  await sheet().locator("input#up-file").setInputFiles(file);
  await sheet().getByRole("button", { name: "Upload" }).last().click();
  await page.waitForTimeout(3000);
  const s = await sheet().innerText().catch(() => "");
  const t = await page.locator("[role=status]").innerText().catch(() => "");
  return (s + " || " + t).replace(/\s+/g, " ").slice(0, 300);
}

let r = await upload("fake", fake, "Passport-size photo");
res({ module: M, page: P, action: "Upload a program renamed .png as the passport photo", role: R, expected: "Refused: not a real picture", actual: r, status: /not|only|PDF, JPG|could not|refus/i.test(r) && !/uploaded/i.test(r) ? "PASS" : "FAIL" });
r = await upload("big", big, "Birth certificate");
res({ module: M, page: P, action: "Upload a 6 MB PDF (limit 5 MB)", role: R, expected: "Refused with the size limit", actual: r, status: /5 MB|too big|large/i.test(r) ? "PASS" : "FAIL" });
r = await upload("pdf", pdf, "Birth certificate");
res({ module: M, page: P, action: "Upload a birth certificate PDF", role: R, expected: "Received; listed with View and Verify", actual: r, status: /uploaded|received/i.test(r) || !(await sheet().count()) ? "PASS" : "FAIL" });
r = await upload("png", png, "Address proof");
res({ module: M, page: P, action: "Upload an address proof PNG", role: R, expected: "Received", actual: r, status: /uploaded|received/i.test(r) || !(await sheet().count()) ? "PASS" : "FAIL" });

// verify birth certificate
await go(page, url);
await page.locator("li").filter({ hasText: "Birth certificate" }).first().getByRole("button", { name: "Verify" }).click();
await page.waitForTimeout(2500);
let t = await panelText();
res({ module: M, page: P, action: "Verify the birth certificate", role: R, expected: "Status Verified; count goes up", actual: (t.match(/\d of \d verified/) ?? [""])[0] + " " + (t.match(/Birth certificate[^|]{0,60}/) ?? [""])[0], status: /1 of 4 verified/.test(t) ? "PASS" : "FAIL" });
// original seen
await page.locator("li").filter({ hasText: "Birth certificate" }).first().getByRole("button", { name: "Original seen" }).click().catch(() => {});
await page.waitForTimeout(2000);
t = await panelText();
res({ module: M, page: P, action: "Mark original seen at the counter", role: R, expected: "Shown as original seen", actual: (t.match(/Birth certificate.{0,80}/) ?? [""])[0], status: /original/i.test((t.match(/Birth certificate.{0,80}/) ?? [""])[0]) ? "PASS" : "FAIL" });
// reject address proof with no reason, then with reason
await go(page, url);
await page.locator("li").filter({ hasText: "Address proof" }).first().getByRole("button", { name: "Reject" }).click();
await sheet().getByRole("button", { name: "Reject paper" }).click();
await page.waitForTimeout(2000);
r = (await sheet().innerText().catch(() => "")).replace(/\s+/g, " ");
res({ module: M, page: P, action: "Reject a paper without a reason", role: R, expected: "Refused: reason needed", actual: r.slice(0, 200), status: /reason/i.test(r) && (await sheet().count()) ? "PASS" : "FAIL" });
await sheet().locator("input[name=reason]").fill("Demo: photo is blurred");
await sheet().getByRole("button", { name: "Reject paper" }).click();
await page.waitForTimeout(3000);
t = await panelText();
const toast = await page.locator("[role=status]").innerText().catch(() => "");
res({ module: M, page: P, action: "Reject the address proof with a reason, Message the parent on (no SMS/WhatsApp)", role: R, expected: "Rejected; message not claimed as sent", actual: toast + " || " + (t.match(/Address proof.{0,80}/) ?? [""])[0], status: /reject/i.test(t + toast) && !/message sent|sent to/i.test(toast) ? "PASS" : "FAIL" });
await shot(page, "documents-after");
// Remind parent (no channel)
await go(page, url);
await page.getByRole("button", { name: /Remind parent about/ }).click();
await sheet().getByRole("button", { name: /^Send to/ }).click();
await page.waitForTimeout(3000);
r = ((await sheet().innerText().catch(() => "")) + " || " + (await page.locator("[role=status]").innerText().catch(() => ""))).replace(/\s+/g, " ");
res({ module: "Communication", page: P, action: "Remind parent about missing papers (no SMS/WhatsApp connected)", role: R, expected: "Says not sent / not set up; never 'sent'", actual: r.slice(0, 300), status: /not sent|not set up|cannot|could not/i.test(r) ? "PASS" : (/sent/i.test(r) ? "FAIL" : "FAIL") });
console.log(page.problems);
await close();
