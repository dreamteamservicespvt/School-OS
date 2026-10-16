// Inventory → Fee Management: the store-counter charges for Demo Varun Teja (₹45 notebook, ₹135 book set)
// appear in his fee ledger, seen by the Accountant.
import { asUser, go, mainText, close, record, sleep } from "./util.mjs";
const p = await asUser("cems.accountant");
await go(p, "/fee-management/ledger?q=Demo%20Varun"); await sleep(500);
const href = await p.evaluate(() => [...document.querySelectorAll("main a[href*='/fee-management/ledger/']")].map((a) => a.getAttribute("href"))[0]);
await go(p, href); const t = await mainText(p, 8000);
const lines = t.split("\n").filter((l) => /QA Demo|Notebook|book set|store|₹45\b|₹135/i.test(l)).slice(0, 8).join(" / ");
record({ module: "Inventory Management", page: "Issue Stock", action: "Demo Varun Teja's fee ledger after the store-counter issues (₹45 notebook, ₹135 book set)", role: "Accountant", expected: "Both charges appear in Fee Management", actual: lines || t.slice(0, 400).replace(/\n/g, " / "), status: /45/.test(lines) && /135/.test(lines) ? "PASS" : "FAIL" });
await p.context().close(); await close();
