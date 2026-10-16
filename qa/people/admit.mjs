// Admission: papers exception (Principal), then Confirm admission (counsellor) -> student created.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Admission Management", APP = "a25642f3-48be-41db-8808-d722783b7f58";
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const adm = await as("cems.admissions");
await go(adm, `/admission-management/applications/${APP}`);
await adm.waitForTimeout(1200);
const admBtn = await adm.getByRole("button", { name: "Admit with papers pending" }).count();
res({ module: M, page: "Applications", action: "Admit with papers pending offered to the Admission Counsellor", role: "Admission Counsellor", expected: "Not offered: an exception is approved by the Principal", actual: `buttons=${admBtn}`, status: admBtn === 0 ? "PASS" : "FAIL" });

const pr = await as("cems.principal");
await go(pr, `/admission-management/applications/${APP}`);
await pr.waitForTimeout(1200);
const b = pr.getByRole("button", { name: "Admit with papers pending" });
if (await b.count()) {
  await b.first().click();
  await pr.waitForTimeout(800);
  const d = pr.locator("dialog[open]").last();
  await d.locator("button[type=submit]").last().click();
  await pr.waitForTimeout(1500);
  const e = await T(pr, "dialog[open]");
  res({ module: M, page: "Applications", action: "Record a papers exception with no reason", role: "Principal", expected: "Refused: reason needed", actual: e.slice(0, 250), status: /reason/i.test(e) && !/Exception recorded/.test(e) ? "PASS" : "FAIL" });
  await d.locator("textarea, input[name=reason]").first().fill("Demo: parent brings photo and ID proof on Monday");
  await d.locator("button[type=submit]").last().click();
  await pr.waitForTimeout(3000);
  const t = await T(pr, "[role=status]");
  res({ module: M, page: "Applications", action: "Record a papers exception with a reason", role: "Principal", expected: "Exception recorded", actual: t.slice(0, 200), status: /Exception recorded/.test(t) ? "PASS" : "FAIL" });
} else {
  console.log("NO EXCEPTION BUTTON", (await T(pr)).slice(0, 500));
}

// Confirm admission
await go(adm, `/admission-management/decision/${APP}/confirm`);
await adm.waitForTimeout(1500);
console.log("CONFIRM PAGE", adm.url(), (await T(adm)).slice(0, 1500));
await shot(adm, "confirm-page");
await close();
