// The Principal switches on AI "Forecasts" and "Student insights and early warnings" (Settings, Modules, AI features)
// so Early Warnings shows "Looking ahead".
import { as, visit, text, VIEWPORTS, sql, sleep, messages, SUNRISE, shot } from "./h.mjs";
import { close, BASE } from "../../lib.mjs";

const p = await as(process.env.WHO ?? "admin", VIEWPORTS.laptop1280);
await visit(p, "/settings/modules", 1500);
for (const name of ["Forecasts", "Student insights and early warnings"]) {
  const btn = p.getByRole("button", { name: new RegExp(`^Off ${name}$`) });
  console.log(name, "off button:", await btn.count());
  if (await btn.count()) { await btn.first().click(); await sleep(2500); console.log("->", await messages(p)); }
}
const save = p.getByRole("button", { name: /^Save/ });
if (await save.count() && await save.first().isEnabled()) { await save.first().click(); await sleep(2000); console.log("save ->", await messages(p)); }
console.log("features:", sql(`select feature_key, is_on from school_feature where school_id='${SUNRISE}' and feature_key like 'ai-%'`));
await shot(p, "forecasts-switched", false);
// a scheduler tick (deploy/vercel README) so the hourly Looking ahead job runs
for (let i = 0; i < 3; i++) { const r = await fetch(`${BASE}/api/v1/jobs/tick`).then((x) => x.json()).catch((e) => ({ e: String(e) })); console.log("tick", JSON.stringify(r)); await sleep(16000); }
console.log("forecast signals:", sql(`select area, strength, count(*) from forecast_signal where school_id='${SUNRISE}' and archived_at is null group by 1,2`));
await close();
