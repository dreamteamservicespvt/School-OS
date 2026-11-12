import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("principal");
await go(p, "/approvals?type=notice"); await sleep(1500);
await p.locator("main").getByText("Decline", { exact: true }).first().click(); await sleep(1200);
const d = p.getByRole("dialog").last();
console.log("DECLINE DLG", (await d.innerText().catch(() => "none")).replace(/\n+/g, " | ").slice(0, 400));
await snap(p, "c-princ-decline", false);
if (await d.count()) {
  const r = d.locator("textarea, input[type=text]").first(); if (await r.count()) await r.fill("LC test cleanup, not needed");
  await d.getByRole("button", { name: /Decline/ }).last().click().catch((e) => console.log(e.message.slice(0, 80))); await sleep(3000);
}
console.log("AFTER", (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 400));
await go(p, "/communication/notices/343443c8-7b6d-4dda-921f-b7b125ddc77e"); await sleep(1000);
console.log("NOTICE NOW", (await mainText(p, 600)).replace(/\n+/g, " | ").slice(0, 300));
console.log("PROBLEMS", p.problems);
await close();
