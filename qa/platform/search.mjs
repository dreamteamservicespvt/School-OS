// Search checks: the Search box in the browser, then the people search the box
// calls, for many queries and roles. Prints what each role finds.
//   node qa/platform/search.mjs [login ...]
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";

const logins = process.argv.slice(2).length ? process.argv.slice(2) : ["cems.admin", "cems.classteacher", "cems.teacher", "cems.accountant", "cems.gate", "cems.driver", "qab.admin"];
const queries = ["Aarav Kumar", "aarav", "Aarv", "kumar", "CEMS", "98", "Grade 5", "5 A", "Demo", "'", "%", "_", "<script>alert(1)</script>", "  ", "a", "Ananya Reddy", "Teja", "receipt", "R-0001", "Lakshmi"];

for (const login of logins) {
  let p;
  try { p = await as(login); } catch (e) { console.log(login, "SIGN-IN FAILED", e.message); continue; }
  // The box in the browser.
  await p.goto(`${BASE}/dashboard`).catch(() => {});
  await p.keyboard.press("Control+k");
  const box = p.getByRole("combobox", { name: "Search" });
  let ui = "no search box";
  if (await box.isVisible().catch(() => false)) {
    await box.fill("Aarav");
    await p.waitForTimeout(1500);
    ui = (await p.locator("#cmdk-list").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
  }
  console.log(`\n== ${login} | box: ${ui}`);
  for (const q of queries) {
    const s = Date.now();
    const r = await p.context().request.get(`${BASE}/api/v1/search?q=${encodeURIComponent(q)}`);
    let body = await r.text();
    try {
      const j = JSON.parse(body);
      body = j.problem ? `PROBLEM ${j.problem}` : `students[${j.students.map((x) => `${x.name} (${x.sub})`).join("; ")}] staff[${j.staff.map((x) => x.name).join("; ")}]`;
    } catch { body = body.slice(0, 120); }
    console.log(`  ${r.status()} ${Date.now() - s}ms ${JSON.stringify(q)} -> ${body.slice(0, 260)}`);
  }
  await p.context().close();
}
await close();
