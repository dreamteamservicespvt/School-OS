import { as } from "./look.mjs";
import { go, mainText, close } from "./h.mjs";
const a = await as("admin");
for (const label of ["Class 5 A", "Class 5 (all sections)", "Whole school"]) {
  await go(a, "/communication/parent-link/send");
  await a.waitForTimeout(1500);
  await a.locator("#f-who").selectOption({ label });
  await a.waitForTimeout(1500);
  console.log(label, "value=", await a.locator("#f-who").inputValue());
  await a.getByRole("button", { name: "Check and send" }).click();
  await a.waitForTimeout(5000);
  console.log("  ", ((await mainText(a, 2000)).match(/Check before sending.{0,250}/s)?.[0] ?? (await mainText(a, 900))).replace(/\n+/g, " | "));
}
await close();
