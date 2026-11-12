import { asRole, go, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("principal");
for (const id of process.argv.slice(2)) {
  await go(p, `/fee-management/concessions?decline=${id}`); await sleep(3000);
  const d = p.getByRole("dialog").last();
  console.log("SHEET", (await d.innerText().catch(() => "none")).replace(/\n+/g, " | ").slice(0, 500));
  await d.locator("textarea").first().fill("LB layman QA test: more than the fees, declining to clean up.");
  await d.getByRole("button", { name: /Decline/ }).last().click();
  for (let i = 0; i < 40 && /…/.test(await d.innerText().catch(() => "")); i++) await sleep(1000);
  await sleep(2000); console.log("open after:", await p.getByRole("dialog").count());
}
await go(p, "/fee-management/concessions"); await sleep(2500);
console.log((await p.locator("main").innerText()).split("Concessions\nStudent")[1]?.slice(0, 700));
process.exit(0);
