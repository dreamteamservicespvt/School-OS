// Confirm admission of APP/2026/0001 (counsellor) -> student created; then what the Admitted page offers.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Admission Management", APP = "a25642f3-48be-41db-8808-d722783b7f58";
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
const adm = await as("cems.admissions");
await go(adm, `/admission-management/decision?tab=approved&focus=${APP}`);
await adm.waitForTimeout(1200);
await adm.getByRole("link", { name: "Confirm admission" }).or(adm.getByRole("button", { name: "Confirm admission" })).first().click();
await adm.waitForTimeout(2000);
console.log("CONFIRM", adm.url(), (await T(adm, "dialog[open]")) || (await T(adm)).slice(0, 1200));
const scope = (await adm.locator("dialog[open]").count()) ? adm.locator("dialog[open]").last() : adm.locator("main");
const sec = scope.locator("select[name=sectionId]");
if (await sec.count()) console.log("SECTIONS", await sec.locator("option").allInnerTexts());
await scope.getByRole("button", { name: /Confirm/ }).last().click();
await adm.waitForURL(/admitted/, { timeout: 30000 }).catch(() => {});
await adm.waitForTimeout(2000);
const t = await T(adm);
await shot(adm, "admitted");
res({ module: M, page: "Admission Decision", action: "Confirm admission of Demo మేఘన Lanka (papers exception recorded)", role: "Admission Counsellor", expected: "Student created with an admission number, class and section; next steps shown (fees, Parent Link, logins)", actual: `${adm.url().replace(/.*:\d+/, "")} ${t.slice(0, 600)}`, status: /admitted/.test(adm.url()) && /CEMS\/2026\/\d{4}/.test(t) ? "PASS" : "FAIL" });
console.log("ADMITTED", t.slice(0, 2500));
console.log(adm.problems);
await close();
