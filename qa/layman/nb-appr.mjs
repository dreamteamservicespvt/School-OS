// Night B: Principal looks at Approvals.
import { asRole, go, mainText, sleep, snap, log, flat } from "./nb-h.mjs";
const L = log("appr");
const p = await asRole(process.argv[2] ?? "principal");
await go(p, "/approvals"); await sleep(1500);
L("APPROVALS", flat(await mainText(p, 6000)).slice(0, 3000));
await snap(p, "approvals-principal");
const links = await p.locator("main a").evaluateAll((as) => as.map((a) => `${a.innerText.trim().replace(/\n/g, " ").slice(0, 80)} -> ${a.getAttribute("href")}`));
L("LINKS", links.filter((l) => /approvals\//.test(l)).join("\n"));
process.exit(0);
