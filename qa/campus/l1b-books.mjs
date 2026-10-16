// Library: book form edge cases with "More details" open; the sheet's own text after submit.
import { asUser, go, close, result, sleep } from "./util.mjs";
import { openSheet } from "./util2.mjs";
const M = "Library Management", R = "Librarian";
const page = await asUser("cems.librarian");
const D = (k) => page.locator(`dialog[open] [name="${k}"]`);

async function book(vals) {
  await openSheet(page, go, "/library-management/books?open=add");
  const more = page.locator("dialog[open]").getByText(/More details/);
  if (await more.count()) { await more.first().click(); await sleep(300); }
  for (const [k, v] of Object.entries(vals)) { const el = D(k); if (await el.count()) await el.first().fill(v); else console.log("no field", k); }
  await page.locator("dialog[open]").getByRole("button", { name: /^Add book/ }).click();
  // Wait for the answer: the sheet closes, or a problem shows in it (the machine can be slow).
  for (let i = 0; i < 40; i++) { await sleep(1000); if (!(await page.locator("dialog[open]").count()) || (await page.locator("dialog[open] [aria-invalid=true], dialog[open] [role=alert]").count())) break; }
  const open = await page.locator("dialog[open]").count();
  const txt = open ? (await page.locator("dialog[open]").innerText()).replace(/\s+/g, " ") : "";
  const toast = await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => e.innerText).join(" | "));
  const invalid = open ? await page.locator("dialog[open] :invalid").evaluateAll((els) => els.map((e) => `${e.name}: ${e.validationMessage}`)) : [];
  return { open, toast: toast.replace(/\s+/g, " "), errors: (txt.match(/[^.]*(must|needed|cannot|not valid|at most|at least|already|between|twice|too large)[^.]*\./gi) ?? []).join(" "), invalid: invalid.join("; ") };
}
let r = await book({ title: "Demo Negative Price", authors: "Demo Author", price: "-250" });
console.log(r);
result({ module: M, page: "Books", action: "Add book with price -250", role: R, expected: "Refused", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? "FAIL" : "PASS" });
r = await book({ title: "Demo Zero Copies", authors: "Demo Author", copies: "0" });
console.log(r);
result({ module: M, page: "Books", action: "Add book with 0 copies", role: R, expected: "Refused in words, or set to 1", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? (/accession \d+\./.test(r.toast) ? "PASS" : "FAIL") : (r.errors || r.invalid ? "PASS" : "FAIL") });
r = await book({ title: "Demo Many Copies", authors: "Demo Author", copies: "500" });
console.log(r);
result({ module: M, page: "Books", action: "Add book with 500 copies (limit 200)", role: R, expected: "Refused in words", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? "FAIL" : (r.errors || r.invalid ? "PASS" : "FAIL") });
r = await book({ title: "Demo Accession Clash", authors: "Demo Author", copies: "2", accessions: "00002, 00002" });
console.log(r);
result({ module: M, page: "Books", action: "Add 2 copies with accession numbers '00002, 00002' (00002 is already used)", role: R, expected: "Refused in words", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? "FAIL" : (r.errors ? "PASS" : "FAIL") });
r = await book({ title: "Demo Price Huge Two", authors: "Demo Author", price: "99999999999" });
console.log(r);
result({ module: M, page: "Books", action: "Add book with price 99,999,999,999", role: R, expected: "Refused", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? "FAIL" : "PASS" });
r = await book({ title: "   ", authors: "Demo Author" });
result({ module: M, page: "Books", action: "Add book whose title is only spaces", role: R, expected: "Refused", actual: JSON.stringify(r), status: /added/i.test(r.toast) ? "FAIL" : "PASS" });
await close();
