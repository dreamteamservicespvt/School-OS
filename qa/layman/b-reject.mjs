// Layman B: the Principal looks at the LB ₹50,000 concession requests and rejects them (clean-up).  node qa/layman/b-reject.mjs [look]
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("principal");
await go(p, "/approvals"); await sleep(2500);
const links = await p.evaluate(() => [...document.querySelectorAll("main a[href^='/approvals/']")].filter((a) => /Sravya Joshi|LB-/.test(a.closest("tr,li,div")?.innerText ?? a.innerText)).map((a) => a.getAttribute("href")));
console.log("LINKS", [...new Set(links)].join(" "));
for (const h of [...new Set(links)]) {
  await go(p, h); await sleep(2500);
  const t = await mainText(p, 3000);
  if (!/LB- layman/.test(t)) { console.log("skip", h); continue; }
  console.log("==", h, "\n", t.slice(0, 1400));
  await snap(p, `approval-${h.split("/").pop().slice(0, 8)}`, false);
  if (process.argv[2] === "look") continue;
  await p.getByRole("button", { name: "Reject" }).first().click(); await sleep(1000);
  await p.getByRole("dialog").last().getByLabel(/Why is it not approved/).fill("LB layman QA test: concession is more than the fees, rejecting.");
  await p.getByRole("dialog").last().getByRole("button", { name: "Reject" }).click();
  for (let i = 0; i < 40 && await p.getByRole("dialog").count(); i++) await sleep(1000);
  await sleep(2000); console.log("after reject:", (await mainText(p, 600)).replace(/\n/g, " / ").slice(0, 300));
}
process.exit(0);
