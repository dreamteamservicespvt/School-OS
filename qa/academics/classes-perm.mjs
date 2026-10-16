// Classes & Sections permissions: roles without the right see no change buttons and the server refuses a crafted call.
import { mainText, close } from "../lib.mjs";
import { res, login, open } from "./r.mjs";
import { callFormAction } from "./action.mjs";

const M = "Academic Management", P = "Classes & Sections";
const YEAR = "151ceaef-b5c1-4c94-a994-6eee097806af";
const F = "src/app/(school)/academic-management/class-actions.ts";
for (const who of ["cems.teacher", "cems.classteacher", "cems.accountant"]) {
  const page = await login(who);
  const r0 = await open(page, "/academic-management");
  const t = await mainText(page, 100000);
  const btn = await page.getByRole("button", { name: "Add class", exact: true }).count();
  res(M, P, "Add class / Archive buttons hidden", who, "No Add class / Edit / Archive buttons (or no access)", `HTTP ${r0?.status()} add buttons=${btn} archive=${/\bArchive\b/.test(t)}`, btn === 0 && !/\bArchive\b/.test(t) ? "PASS" : "FAIL");
  const r = await callFormAction(page, F, "addClassAction", { yearId: YEAR, name: `Demo Hack ${who}`, position: "end", level: "", sections: "A", seats: "10" });
  const refused = !/added with/.test(r.text) && /"ok":false/.test(r.text);
  res(M, P, "Crafted addClassAction server call", who, "Server refuses, nothing created", `HTTP ${r.status}: ${r.text.replace(/\s+/g, " ").slice(-200)}`, refused ? "PASS" : "FAIL");
  await page.context().close();
}
await close();
