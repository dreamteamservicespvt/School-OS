// What does Tanvi's cell say (aria-label/title) on the submitted Class Test paper, for the teacher and the principal?
import { as, visit, VIEWPORTS, sleep } from "./h.mjs";
import { close } from "../../lib.mjs";
const URL = "/examination-results/marks/31218111-601c-49d2-b3b9-c8cbdf28bd7c/b07ca58e-2716-4729-ab56-3cdf783e5598";
for (const who of ["teacher", "principal"]) {
  const t = await as(who, VIEWPORTS.laptop1280);
  await visit(t, URL, 2000);
  await t.getByRole("button", { name: "Grid" }).first().click().catch(() => {}); await sleep(800);
  const row = t.locator("tr", { hasText: "Tanvi Latejoin" });
  const info = await row.evaluate((tr) => [...tr.querySelectorAll("button, span[title]")].map((b) => `${b.tagName} aria="${b.getAttribute("aria-label")}" title="${b.getAttribute("title")}" text="${b.textContent}"`));
  console.log(who, info);
  await t.context().close();
}
await close();
