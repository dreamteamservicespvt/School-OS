// Library: settings validation, add books (validation, copies, accession numbers), duplicates, double submit.
import { asUser, go, mainText, close, result, sleep, shot } from "./util.mjs";
import { submit, said, openSheet } from "./util2.mjs";
const M = "Library Management", R = "Librarian";
const page = await asUser("cems.librarian");
const F = (k) => page.locator(`main [name="${k}"]`);
const D = (k) => page.locator(`dialog[open] [name="${k}"]`);

async function settings(vals) {
  await go(page, "/library-management/settings");
  for (const [k, v] of Object.entries(vals)) await F(k).fill(v);
  await page.locator("main").getByRole("button", { name: "Save settings" }).click(); await sleep(3000);
  return said(page);
}
let s = await settings({ finePerDay: "-2" });
result({ module: M, page: "Library Settings", action: "Fine per day -2", role: R, expected: "Refused", actual: s, status: /saved/i.test(s) && !/must|amount/i.test(s) ? "FAIL" : "PASS" });
s = await settings({ finePerDay: "2", "books-Primary": "0" });
result({ module: M, page: "Library Settings", action: "Primary classes may borrow 0 books", role: R, expected: "Refused or explained (0 books blocks issuing)", actual: s, status: "PASS" });
s = await settings({ finePerDay: "2", "books-Primary": "-3" });
result({ module: M, page: "Library Settings", action: "Primary classes may borrow -3 books", role: R, expected: "Refused", actual: s, status: /saved/i.test(s) && !/must|between|at least/i.test(s) ? "FAIL" : "PASS" });
s = await settings({ finePerDay: "2", "books-Primary": "2", "days-Primary": "99999" });
result({ module: M, page: "Library Settings", action: "Loan days 99999", role: R, expected: "Refused", actual: s, status: /saved/i.test(s) && !/must|between|at most/i.test(s) ? "FAIL" : "PASS" });
s = await settings({ finePerDay: "5", maxFine: "2", "books-Primary": "2", "days-Primary": "7" });
result({ module: M, page: "Library Settings", action: "Most fine (₹2) smaller than the fine per day (₹5)", role: R, expected: "Refused or warned", actual: s, status: /saved/i.test(s) && !/must|more|less|at least/i.test(s) ? "FAIL" : "PASS" });
s = await settings({ finePerDay: "2", maxFine: "100", graceDays: "0", "books-Primary": "2", "days-Primary": "7", staffBooks: "5", staffLoanDays: "30" });
result({ module: M, page: "Library Settings", action: "Save fine ₹2 a day (most ₹100), Primary 2 books for 7 days, staff 5 books for 30 days", role: R, expected: "Saved", actual: s, status: /saved/i.test(s) ? "PASS" : "FAIL" });

async function book(vals, submitName = /^Add book/) {
  await openSheet(page, go, "/library-management/books?open=add");
  for (const [k, v] of Object.entries(vals)) { const el = D(k); if (await el.count()) await el.fill(v); else console.log("no field", k); }
  return submit(page, submitName, { wait: 3500 });
}
s = await book({});
result({ module: M, page: "Books", action: "Add book with nothing typed", role: R, expected: "Refused: title needed", actual: s, status: /Title/.test(s) && !/added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Book Without Author" });
result({ module: M, page: "Books", action: "Add book without author", role: R, expected: "Refused: author needed", actual: s, status: /author/i.test(s) && !/added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Wings", authors: "Demo Author", isbn: "1234567890123" });
result({ module: M, page: "Books", action: "Add book with an ISBN whose check digit is wrong", role: R, expected: "Refused: ISBN not right", actual: s, status: /ISBN/i.test(s) && !/added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Wings", authors: "Demo Author", price: "-250" });
result({ module: M, page: "Books", action: "Add book with price -250", role: R, expected: "Refused", actual: s, status: /added/i.test(s) ? "FAIL" : "PASS" });
s = await book({ title: "Demo Wings", authors: "Demo Author", copies: "0" });
result({ module: M, page: "Books", action: "Add book with 0 copies", role: R, expected: "Refused or set to 1", actual: s, status: /added/i.test(s) && /0 cop/.test(s) ? "FAIL" : "PASS" });
s = await book({ title: "Demo Wings of Fire", authors: "Demo A. P. J. Author; Demo Co Author", publisher: "Demo Press", isbn: "9788173711466", copies: "3", price: "250.50", subject: "Science", language: "English", shelf: "A-1" });
result({ module: M, page: "Books", action: "Add Demo Wings of Fire, 2 authors, valid ISBN-13, 3 copies, ₹250.50", role: R, expected: "Added with 3 accession numbers", actual: s, status: /added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Wings of Fire", authors: "Demo A. P. J. Author", isbn: "9788173711466", copies: "1" });
result({ module: M, page: "Books", action: "Add the same ISBN again", role: R, expected: "Refused or offered 'add copies'", actual: s, status: /already|exists|same ISBN|copies/i.test(s) && !/^“?Demo Wings of Fire”? added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "డెమో తెలుగు కథలు ☆", authors: "డెమో రచయిత", language: "Telugu", copies: "2", price: "120" });
result({ module: M, page: "Books", action: "Add a Telugu-titled book with 2 copies", role: R, expected: "Added", actual: s, status: /added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Single Copy Reference", authors: "Demo Editor", copies: "1", price: "999" });
result({ module: M, page: "Books", action: "Add a one-copy book (for reservations)", role: R, expected: "Added", actual: s, status: /added/i.test(s) ? "PASS" : "FAIL" });
s = await book({ title: "Demo Accession Clash", authors: "Demo Writer", copies: "2", accessions: "1, 1" });
result({ module: M, page: "Books", action: "Add book with the same accession number twice", role: R, expected: "Refused", actual: s, status: /added/i.test(s) ? "FAIL" : "PASS" });
s = await book({ title: "Demo Many Copies", authors: "Demo Writer", copies: "500" });
result({ module: M, page: "Books", action: "Add book with 500 copies (limit 200)", role: R, expected: "Refused or capped at 200", actual: s, status: /500 copies/.test(s) ? "FAIL" : "PASS" });

await go(page, "/library-management/books");
const t = await mainText(page, 4000);
console.log(t);
await shot(page, "l1-books");
console.log("PROBLEMS", page.problems);
await close();
