// print dialog text + links of a URL that opens a sheet
import { asRole, go, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole(process.argv[2]); await go(p, process.argv[3]); await sleep(3000);
const d = p.getByRole("dialog").last();
console.log((await d.innerText().catch(() => "no dialog")).replace(/\n+/g, " | "));
console.log(await d.evaluate((e) => [...e.querySelectorAll("a[href]")].map((a) => a.innerText.trim() + " => " + a.getAttribute("href")).join("\n")).catch(() => ""));
if (process.argv[4]) await snap(p, process.argv[4], false);
process.exit(0);
