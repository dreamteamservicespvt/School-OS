// Can a staff member open someone else's salary slip by changing the address?
import { as, visit, text, sql, note, BASE } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as(process.env.LOGIN ?? "teacher");
const other = sql(`select p.id, s.full_name from payslip p join staff s on s.id=p.staff_id where s.full_name='${process.env.OTHER ?? "Meena Iyer"}' order by p.created_at desc limit 1`)[0];
note("other slip", JSON.stringify(other));
await visit(page, `/salary-management/slips?slip=${other[0]}`, 2000);
const t = await text(page, 3000);
note("PAGE with other slip id:", /Meena/.test(t) ? "SHOWS MEENA: " + t.slice(0, 400) : "no Meena on page: " + t.slice(0, 300));
for (const u of [`/salary-management/slips/pdf?ids=${other[0]}`, `/salary-management/slips/pdf?ids=${other[0]},${sql(`select id from payslip order by created_at desc limit 1`)[0][0]}`]) {
  const r = await page.request.get(`${BASE}${u}`);
  const b = await r.body();
  note(`GET ${u}: ${r.status()} ${r.headers()["content-type"]} ${b.length} bytes ${/Meena/.test(b.toString("latin1")) ? "(contains Meena)" : ""} :: ${r.headers()["content-type"]?.includes("pdf") ? "" : b.toString().slice(0, 150)}`);
}
await close();
