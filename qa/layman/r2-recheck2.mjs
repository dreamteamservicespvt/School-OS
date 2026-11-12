// Round 2 recheck, part 2: LD13 (a refused export is 403) and LE2 (a book's page names the book).
import { asRole, go, mainText, sleep, close } from "./d-h.mjs";
const drv = await asRole("driver");
const codes = [];
for (const u of ["/staff-hr-management/export?format=csv", "/staff-hr-management/export?format=pdf", "/staff-hr-management/id-cards"]) {
  const r = await drv.request.get(new URL(u, "http://localhost:3000").toString(), { maxRedirects: 0 }); codes.push(r.status());
}
console.log(`${codes.every((c) => c === 403 || (c >= 300 && c < 400)) ? "PASS" : "FAIL"} LD13 status ${codes.join(", ")}`);
const lib = await asRole("librarian");
await go(lib, "/library-management/books"); await sleep(1000);
const hrefs = await lib.locator("main a").evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.innerText.split("\n")[0].trim()]).filter(([h]) => /\/library-management\/books\/[0-9a-f-]{36}$/.test(h ?? "")));
const [href, name] = hrefs[0];
await go(lib, href); await sleep(800);
const head = await mainText(lib, 500);
const title = (await lib.title()).split(/ [·|] /)[0].trim();
console.log(`${title && head.includes(title.slice(0, 20)) ? "PASS" : "FAIL"} LE2 book "${title.slice(0, 40)}" in page head: ${head.includes(title.slice(0, 20))} | head: ${head.split(String.fromCharCode(10)).slice(0, 3).join(" / ").slice(0, 120)}`);
await close();
