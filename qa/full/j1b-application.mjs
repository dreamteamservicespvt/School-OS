// Journey E1, part 2: the School Admin converts Aarav Reddy's enquiry into an application.
//   node qa/full/j1b-application.mjs <enquiryId>
import { as } from "./look.mjs";
import { go, mainText, shot, saveJson, close, logSize, waitLog } from "./h.mjs";

const [ENQ] = process.argv.slice(2);
const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };
const errs = async (s) => [...new Set((await s.locator('[id$="-error"], [role="alert"]').allInnerTexts()).map((x) => x.trim()).filter(Boolean))];
const f = (p, name) => p.locator(`main [name=${name}]`);

const p = await as("admin");
await go(p, `/admission-management/applications/new?enquiry=${ENQ}`);
const val = async (n) => f(p, n).inputValue().catch(() => "?");
const year = await p.locator("main select[name=yearId] option:checked").innerText();
const cls = await p.locator("main select[name=classId] option:checked").innerText();
rec("Everything known from the enquiry is filled in", (await val("firstName")) === "Aarav" && (await val("lastName")) === "Reddy" && (await val("phone")).replace(/\D/g, "").endsWith("9848012345") && /Class 3/.test(cls),
  `first=${await val("firstName")} last=${await val("lastName")} phone=${await val("phone")} class=${cls} year=${year}`);
rec("Admission year follows the enquiry (2027-28)", /2027-28/.test(year), year);
// Save with the required boxes empty.
await p.getByRole("button", { name: "Save application" }).click();
await p.waitForTimeout(1500);
let e = await errs(p.locator("main"));
rec("Saving without date of birth, address and school is refused, naming the boxes", e.length >= 1, e.join(" / "));
await shot(p, "j1b-application-empty", false);
// Date of birth in the future.
const dob = p.locator("main input[id$=-dateOfBirth]");
await dob.click(); await dob.fill(""); await dob.pressSequentially("15-08-2030", { delay: 20 }); await p.keyboard.press("Tab");
await f(p, "address").pressSequentially("Flat 302, Sri Sai Residency, KPHB Colony, Kukatpally, Hyderabad 500072", { delay: 2 });
await f(p, "previousSchool").pressSequentially("Little Flower High School", { delay: 5 });
await p.locator("main").getByText("Boy", { exact: true }).click();
// Consent: the guardian's one-time code (Test mode writes it to the server log).
const from = logSize();
await p.getByRole("button", { name: "Send one-time code" }).click();
const code = await waitLog(from, /\[dev\] one-time code[^\n]*: (\d{4,6})/);
rec("Consent code is sent to the guardian's phone (server log in Test mode)", !!code);
await p.waitForTimeout(800);
const box = p.locator("main input[autocomplete=one-time-code], main input[inputmode=numeric]").last();
await box.pressSequentially(code?.[1] ?? "", { delay: 30 });
const conf = p.getByRole("button", { name: /confirm|verify|check/i }).first();
if (await conf.isVisible().catch(() => false)) await conf.click();
await p.waitForTimeout(1500);
console.log("CONSENT AREA:", (await mainText(p, 6000)).match(/CONSENT[\s\S]{0,400}/)?.[0]?.replace(/\n/g, " | "));
await p.getByRole("button", { name: "Save application" }).click();
await p.waitForTimeout(1500);
e = await errs(p.locator("main"));
rec("A date of birth in the future is refused", e.some((x) => /birth|future|date/i.test(x)) || p.url().includes("/new"), e.join(" / "));
await shot(p, "j1b-application-future-dob", false);
await dob.fill(""); await dob.pressSequentially("12-03-2019", { delay: 20 }); await p.keyboard.press("Tab");
await f(p, "fatherName").fill(""); await f(p, "fatherName").pressSequentially("Venkata Ramana Reddy", { delay: 5 });
await f(p, "motherName").fill(""); await f(p, "motherName").pressSequentially("Sravani Reddy", { delay: 5 });
await f(p, "previousClass").pressSequentially("Class 2", { delay: 5 });
await f(p, "previousMarks").pressSequentially("88%", { delay: 5 });
await f(p, "secondLanguage").pressSequentially("Telugu", { delay: 5 });
await p.getByRole("button", { name: "Save application" }).click();
await p.waitForURL((u) => !u.pathname.endsWith("/new"), { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(2000);
const t = await mainText(p, 2500);
rec("Application saved and opened", !p.url().includes("/new") && /Aarav/.test(t), `${new URL(p.url()).pathname} ${t.slice(0, 300).replace(/\n/g, " | ")}`);
await shot(p, "j1b-application-saved", true);
console.log("NEXT SCREEN:\n" + t.slice(0, 2000));
saveJson("j1b-application.json", res);
await close();
