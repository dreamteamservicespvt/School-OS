// Layman B: why October fee income differs between Fee Reports and the Day Book.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const u = process.argv[2] ?? "/finance-management/reports?r=day-book-summary&group=day&period=custom&from=2026-10-01&to=2026-10-31";
await go(p, u); await sleep(1500);
const t = await mainText(p, 20000);
console.log(new URL(p.url()).search, "\n", t.slice(t.indexOf("Day Book for a range"), t.indexOf("Day Book for a range") + 3000));
await go(p, "/fee-management/reports?r=collection&period=custom&from=2026-10-01&to=2026-10-31"); await sleep(1500);
await p.getByRole("link", { name: "Daily" }).or(p.getByRole("button", { name: "Daily" })).first().click().catch(() => {}); await sleep(2500);
const f = await mainText(p, 20000);
console.log(new URL(p.url()).search, "\n", f.slice(f.indexOf("Month\tPayments") > 0 ? f.indexOf("Collection report\nDate") : 0, 99999).slice(0, 3000));
process.exit(0);
