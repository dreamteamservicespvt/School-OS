// Journey E1, part 4: review the application, then show what admitting needs.
//   node qa/full/j1d-review-admit.mjs <applicationId> [admit]
import { as } from "./look.mjs";
import { go, mainText, shot, saveJson, close } from "./h.mjs";

const [APP, step] = process.argv.slice(2);
const URL_ = `/admission-management/applications/${APP}`;
const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };
const p = await as(step === "admit" ? "principal" : "admin");
await go(p, URL_);
const buttons = async () => (await p.locator("main button").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
if (step !== "admit") {
  await p.locator("main").getByRole("button", { name: "Review", exact: true }).click();
  const d = p.getByRole("dialog", { name: /Review application/ });
  await d.waitFor();
  await d.getByText("Looks right", { exact: true }).click();
  await d.locator("[name=note]").pressSequentially("Birth certificate and TC seen at the counter.", { delay: 5 });
  await d.getByRole("button", { name: "Mark reviewed" }).click();
  await p.waitForTimeout(2500);
  const t = await mainText(p, 600);
  rec("Application marked reviewed", /Reviewed/i.test(t), t.slice(0, 200).replace(/\n/g, " | "));
  await shot(p, "j1d-reviewed", false);
}
console.log("BUTTONS:", (await buttons()).join(" | "));
console.log("LINKS:", (await p.locator("main a[href]").evaluateAll((as) => as.map((a) => `${a.innerText.trim().slice(0, 30)}=>${a.getAttribute("href")}`))).join(" | "));
saveJson(`j1d-${step ?? "review"}.json`, res);
await close();
