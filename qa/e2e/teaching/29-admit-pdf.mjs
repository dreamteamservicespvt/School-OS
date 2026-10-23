// Admit cards for Class 5 A (Class Test October QA): print the class as one PDF, and one student.
import { as, VIEWPORTS, OUT } from "./h.mjs";
import { close, BASE } from "../../lib.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
const p = await as("principal", VIEWPORTS.laptop1280);
const cookies = (await p.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
for (const [name, q] of [["class", "all=1"], ["one", "student=3b3feb64-269c-4b77-b09b-2322950428e0"], ["class2", ""]]) {
  const r = await fetch(`${BASE}/examination-results/admit-cards/pdf?exam=648fbf69-345c-4543-aafe-1e9d75419866&section=b07ca58e-2716-4729-ab56-3cdf783e5598&${q}`, { headers: { Cookie: cookies } });
  const b = Buffer.from(await r.arrayBuffer());
  const f = path.join(OUT, `admit-${name}.pdf`);
  writeFileSync(f, b);
  console.log(name, r.status, r.headers.get("content-type"), b.length, f, r.headers.get("content-type")?.includes("pdf") ? "" : b.toString().slice(0, 150));
}
await close();
