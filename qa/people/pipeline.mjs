// Admission pipeline on APP/2026/0001 (Demo మేఘన Lanka), step by step, as cems.admissions.
//   STEP=review|menu|move:<label> node qa/people/pipeline.mjs
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const APP = "a25642f3-48be-41db-8808-d722783b7f58";
const LOGIN = process.env.LOGIN ?? "cems.admissions";
const page = await as(LOGIN);
const T = async (sel = "main") => ((await page.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");
await go(page, `/admission-management/applications/${APP}`);
await page.waitForTimeout(1200);
const step = process.env.STEP ?? "menu";
if (step === "review") {
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.waitForTimeout(1000);
  console.log("SHEET", (await T("dialog[open]")).slice(0, 800));
  const d = page.locator("dialog[open]").last();
  const btns = await d.locator("button").allInnerTexts();
  console.log("BUTTONS", btns);
} else if (step === "menu") {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.waitForTimeout(800);
  console.log("MENU", await T("[role=menu]"));
} else if (step.startsWith("click:")) {
  // click a button in the open sheet: click:<open button>|<sheet button>
  const [open, inside] = step.slice(6).split("|");
  await page.getByRole("button", { name: open, exact: true }).first().click();
  await page.waitForTimeout(1000);
  if (inside) {
    const d = page.locator("dialog[open]").last();
    console.log("SHEET", (await d.innerText()).replace(/\s+/g, " ").slice(0, 900));
    await d.getByRole("button", { name: inside, exact: true }).click();
    await page.waitForTimeout(3000);
  }
  console.log("AFTER", await T("[role=status], [role=alert]"), "||", (await T()).slice(0, 400));
} else if (step.startsWith("menuitem:")) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("menuitem", { name: step.slice(9) }).click();
  await page.waitForTimeout(1200);
  console.log("SHEET", (await T("dialog[open]")).slice(0, 900), "|| URL", page.url());
}
await shot(page, `pipeline-${step.replace(/[^a-z]+/gi, "-")}`);
await close();
