// Top bar Search: "fee Rithvik", "Rithvik Varma", and a receipt number.
import { as, visit, note, squeeze, shot } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as("accountant");
await visit(page, "/dashboard", 2000);
for (const q of ["fee Rithvik", "Rithvik Varma", "SPS/2026-27/00345", "fee"]) {
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(800);
  await page.keyboard.type(q, { delay: 60 });
  await page.waitForTimeout(4000);
  const box = page.locator("[role=dialog]").last();
  note(`"${q}":`, squeeze(await box.innerText().catch(() => "")).slice(0, 500));
  await shot(page, `topsearch-${q.replace(/\W+/g, "_")}`, false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}
await close();
