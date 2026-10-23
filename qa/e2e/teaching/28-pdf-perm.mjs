// Can a teacher download the report card PDF of a student outside their classes by changing the link?
import { as, VIEWPORTS } from "./h.mjs";
import { close, BASE } from "../../lib.mjs";
const URL = "/examination-results/report-cards/pdf?section=b07ca58e-2716-4729-ab56-3cdf783e5598&period=exam%3A648fbf69-345c-4543-aafe-1e9d75419866&student=3b3feb64-269c-4b77-b09b-2322950428e0";
for (const who of ["subjectteacher", "teacher", "accountant"]) {
  const p = await as(who, VIEWPORTS.laptop1280);
  const cookies = (await p.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const r = await fetch(`${BASE}${URL}`, { headers: { Cookie: cookies }, redirect: "manual" });
  const body = Buffer.from(await r.arrayBuffer());
  console.log(who, r.status, r.headers.get("content-type"), body.length, r.headers.get("location") ?? "", r.headers.get("content-type")?.includes("pdf") ? "" : body.toString().slice(0, 120).replace(/\s+/g, " "));
  await p.context().close();
}
await close();
