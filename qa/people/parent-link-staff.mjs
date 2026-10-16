// Staff side of Parent Link in CEMS (no SMS/WhatsApp): resend (must not claim sent), revoke only with a reason,
// then the revoked link opened on the confirmed phone, and who may open the page.
import { readFileSync } from "node:fs";
import { go, close, shot, newPage, BASE, VIEWPORTS } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const [kavya, sai] = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").pop());
const M = "Communication", P = "Parent Link (staff)";
const page = await as("cems.admin");
const dlg = () => page.locator("dialog[open]").last();

// Resend Kavya's link: no channel.
await go(page, `/communication/parent-link/${kavya.linkId}`);
console.log((await page.locator("main").innerText()).slice(0, 1200));
await page.getByRole("button", { name: "Resend link" }).first().click();
await page.waitForTimeout(800);
let d = (await dlg().innerText()).replace(/\s+/g, " ");
const disabled = await dlg().getByRole("button", { name: "Resend link" }).isDisabled();
res({ module: M, page: P, action: "Resend Kavya Reddy's link with no SMS/WhatsApp", role: "School Admin", expected: "Cannot send: button off and a plain reason; nothing claims sent", actual: `button disabled=${disabled}; ${d.slice(0, 250)}`, status: disabled && !/sent again|link sent/i.test(d) ? "PASS" : "FAIL" });
await page.keyboard.press("Escape");

// Revoke only, without a reason, then with one.
await go(page, `/communication/parent-link/${sai.linkId}`);
await page.getByRole("button", { name: "Revoke or reissue" }).click();
await page.waitForTimeout(800);
await dlg().getByText("Revoke only", { exact: true }).click();
await dlg().getByRole("button", { name: "Revoke only" }).click();
await page.waitForTimeout(1000);
d = (await dlg().innerText()).replace(/\s+/g, " ");
res({ module: M, page: P, action: "Revoke Sai Naidu's link with no reason", role: "School Admin", expected: "Refused: choose a reason", actual: d.slice(0, 200), status: /Choose a reason/.test(d) ? "PASS" : "FAIL" });
await dlg().locator("select#pl-reason").selectOption("Lost phone");
await dlg().getByRole("button", { name: "Revoke only" }).click();
await page.waitForTimeout(3000);
const after = (await page.locator("main").innerText()).replace(/\s+/g, " ");
await shot(page, "pl-revoked");
res({ module: M, page: P, action: "Revoke Sai Naidu's link (Revoke only, Lost phone)", role: "School Admin", expected: "Link shows Revoked with the reason", actual: after.slice(0, 300), status: /Revoked/i.test(after) ? "PASS" : "FAIL" });

// The revoked link on the phone that was confirmed.
const g = await newPage(VIEWPORTS.phone375);
await g.context().addCookies([{ name: sai.cookie, value: sai.key, domain: new URL(BASE).hostname, path: "/p" }]);
await g.goto(`${BASE}${sai.path}`);
await g.waitForLoadState("networkidle").catch(() => {});
const t = (await g.locator("body").innerText()).replace(/\s+/g, " ");
res({ module: M, page: "Parent Link (guardian page)", action: "Open Sai Naidu's revoked link on the phone that was confirmed", role: "Parent (no login)", expected: "This link is no longer active; no child data", actual: t.slice(0, 200), status: /no longer active/i.test(t) && !/Sai Naidu/.test(t) ? "PASS" : "FAIL" });
await shot(g, "pl-revoked-guardian");
const r = await g.request.get(`${BASE}${sai.path}/report-card?child=03c597aa-cb4d-439e-b50d-10a4848c51c8&year=151ceaef-b5c1-4c94-a994-6eee097806af&period=year`, { maxRedirects: 0 });
res({ module: M, page: "Parent Link (guardian page)", action: "Revoked link: report card address", role: "Parent (no login)", expected: "No PDF", actual: `${r.status()}`, status: !(r.headers()["content-type"] ?? "").includes("pdf") ? "PASS" : "FAIL" });

// Who may open the staff page.
for (const login of ["cems.reception", "cems.counsellor", "cems.gate", "cems.office", "cems.admissions"]) {
  const p = await as(login);
  await go(p, `/communication/parent-link/${kavya.linkId}`);
  const x = (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
  const sees = /Resend link|Revoke or reissue/.test(x);
  res({ module: M, page: P, action: `${login} opens a guardian's Parent Link page`, role: login, expected: "Not allowed (Principal and School Admin only)", actual: `${p.url().replace(BASE, "")} ${x.slice(0, 120)}`, status: sees ? "FAIL" : "PASS" });
  await p.context().close();
}
await close();
