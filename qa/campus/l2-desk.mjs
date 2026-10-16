// Library: the Issue & Return desk in CEMS — issue, limits, copy already out, staff member, reservations, return.
import { asUser, go, close, result, sleep, mainText } from "./util.mjs";
const M = "Library Management", P = "Issue & Return", R = "Librarian";
const page = await asUser("cems.librarian");

const said = async () => (await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],[aria-live]")].map((e) => e.innerText.trim()).filter(Boolean).join(" | "))).replace(/\s+/g, " ");
async function member(card) {
  await go(page, `/library-management?card=${encodeURIComponent(card)}`);
  await sleep(800);
  return (await mainText(page, 1500)).replace(/\s+/g, " ");
}
async function scan(code) {
  await page.locator("input[name=code]").fill(code);
  await page.getByRole("button", { name: "Go" }).click();
  for (let i = 0; i < 20; i++) { await sleep(800); if (await page.getByRole("button", { name: /^(Issue|Return|Reserve) “/ }).count()) break; }
  return (await mainText(page, 2500)).replace(/\s+/g, " ");
}
async function press(re) {
  const b = page.getByRole("button", { name: re }).first();
  if (!(await b.count())) return "NO BUTTON " + re;
  await b.click();
  for (let i = 0; i < 25; i++) { await sleep(800); const s = await said(); if (/issued|returned|refused|cannot|already|only|limit|queue|not|must/i.test(s)) return s; }
  return await said();
}
const rec = (action, expected, actual, ok, extra = {}) => { result({ module: M, page: P, action, role: R, expected, actual: actual.slice(0, 600), status: ok ? "PASS" : "FAIL", ...extra }); };

// 1. A card nobody has.
let t = await member("NOPE-999");
rec("Look up library card NOPE-999 (nobody has it)", "Plain words: no member with that card", t.match(/(No |not found|Nobody|cannot find)[^.]*\./i)?.[0] ?? t.slice(300, 700), /no member|not found|nobody|cannot find|no one/i.test(t));

// 2. Aarav Patel (Nursery, 2 books) takes 00002 and 00005, then a third is refused.
t = await member("CEMS/2026/0010");
t = await scan("00002"); let s = await press(/^Issue “/);
rec("Issue copy 00002 (Demo Wings of Fire) to Aarav Patel", "Issued with a due date", s, /issued to Aarav Patel\. Due/i.test(s));
t = await member("CEMS/2026/0010"); t = await scan("00005"); s = await press(/^Issue “/);
rec("Issue copy 00005 (Telugu book) to Aarav Patel", "Issued", s, /issued to Aarav Patel/i.test(s));
t = await member("CEMS/2026/0010"); t = await scan("00008");
const third = (await page.getByRole("button", { name: /^Issue “/ }).count()) ? await press(/^Issue “/) : t;
rec("Issue a third book to Aarav Patel (Primary limit is 2)", "Refused: limit reached, in plain words", (third.match(/[^.]*(limit|of 2|already has|2 books)[^.]*\./i)?.[0] ?? third).slice(0, 400), !/issued to Aarav/i.test(third) && /limit|2 of 2|already has 2|2 books/i.test(third));

// 3. Copy already out, asked for another member.
t = await member("CEMS/2026/0002"); t = await scan("00002");
const out = (await page.getByRole("button", { name: /^Issue “/ }).count()) ? await press(/^Issue “/) : t;
rec("Issue copy 00002 to Karthik Boddu while Aarav Patel has it", "Refused: already out with Aarav, offer Reserve", (out.match(/[^.]*(out with|issued to|already|with Aarav)[^.]*\./i)?.[0] ?? out).slice(0, 400), !/issued to Karthik/i.test(out) && /out|already|Aarav/i.test(out));

// 4. One-copy book: Karthik takes it, Sravya reserves it.
t = await member("CEMS/2026/0002"); t = await scan("00007"); s = await press(/^Issue “/);
rec("Issue the only copy 00007 to Karthik Boddu", "Issued", s, /issued to Karthik Boddu/i.test(s));
t = await member("CEMS/2026/0003"); t = await scan("Demo Single Copy Reference");
const hasReserve = await page.getByRole("button", { name: /Reserve/ }).count();
s = hasReserve ? await press(/Reserve/) : t;
rec("Reserve Demo Single Copy Reference for Sravya Kumar (no copy on the shelf)", "Number 1 in the queue", s.slice(0, 400), /number 1 in the queue/i.test(s));

// 5. A staff member by staff code.
t = await member("CEMS-ST-004");
rec("Look up staff member by staff code CEMS-ST-004", "Demo Harika Vadde shown", t.slice(0, 400), /Harika/i.test(t));
t = await scan("00003"); s = await press(/^Issue “/);
rec("Issue copy 00003 to staff member Demo Harika Vadde", "Issued (staff loan days)", s, /issued to Demo Harika/i.test(s));

// 6. Returns: 00002 in good condition; 00005 damaged with a charge.
await go(page, "/library-management?mode=return&copy=00002"); await sleep(1500);
s = await press(/^Return “/);
rec("Return copy 00002 in good condition", "Returned, no fine (not late)", s, /returned by Aarav Patel\.?/i.test(s) && !/fine/i.test(s));
await go(page, "/library-management?mode=return&copy=00005"); await sleep(1500);
const dmg = page.getByRole("radio", { name: "Damaged" }).or(page.getByRole("button", { name: "Damaged" })).first();
if (await dmg.count()) { await dmg.click(); await sleep(400); }
if (await page.locator("input[name=charge]").count()) await page.locator("input[name=charge]").fill("150");
if (await page.locator("input[name=note]").count()) await page.locator("input[name=note]").fill("Demo: cover torn");
s = await press(/^Return “/);
rec("Return copy 00005 damaged with a ₹150 charge", "Returned; damage charge ₹150 recorded (approval if the school asks for it)", s, /returned by Aarav Patel: damage charge ₹150/i.test(s));
console.log("done");
await close();
