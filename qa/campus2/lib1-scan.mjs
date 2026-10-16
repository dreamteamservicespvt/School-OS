// Library leftover: in Fines & Stock Check, scan a copy number that does not exist (99999).
import { asUser, go, mainText, close, record, said, sleep } from "./util.mjs";
const p = await asUser("cems.librarian");
try {
  await go(p, "/library-management/fines?view=stock"); const t = await mainText(p, 2000);
  let href = await p.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => /Continue scanning/.test(a.innerText)).map((a) => a.getAttribute("href"))[0]);
  let started = false;
  if (!href) {
    await go(p, "/library-management/fines?view=stock&open=stock"); await p.waitForSelector("dialog[open]");
    const nm = p.locator("dialog[open] [name=name]"); if (await nm.count() && !(await nm.inputValue())) await nm.fill("QA Demo stock check");
    console.log((await p.locator("dialog[open]").innerText()).replace(/\n/g, " / "));
    await p.locator("dialog[open] button[type=submit]").last().click(); await sleep(3000); started = true; console.log(await said(p), p.url());
    href = p.url().includes("/fines/stock/") ? p.url().replace(/^https?:\/\/[^/]+/, "") : await p.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => /Continue scanning/.test(a.innerText)).map((a) => a.getAttribute("href"))[0]);
  }
  await go(p, href);
  const box = p.locator("#stock-code"); await box.fill("99999"); await box.press("Enter"); await sleep(2500);
  const s = await said(p); const body = await mainText(p, 2500);
  const line = body.split("\n").find((l) => /99999/.test(l)) ?? "";
  const plain = /no (such )?copy|not (a copy|found|in the library|known)|no book/i.test(s + " " + line);
  record({ module: "Library Management", page: "Fines & Stock Check", action: `Scan copy number 99999 (does not exist) in a stock check${started ? " (started QA Demo stock check)" : ""}`, role: "Librarian", expected: "Says plainly there is no such copy", actual: `${s} / line: ${line}`, status: plain ? "PASS" : "FAIL", ...(plain ? {} : { defect: "CAMPUS2-09" }) });
} catch (e) { console.log("ERR", e.message.split("\n")[0]); }
await p.context().close(); await close();
