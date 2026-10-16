// Year end follow-up (Sunrise): what a class teacher sees on Promotion, and the
// "changed decision needs a reason" rule on the review list. Nothing is saved.
import { mainText, close } from "../lib.mjs";
import { res, login, open, sql, uuidOf } from "./r.mjs";

const SPS = (s) => sql(s, "SPS");
const SM = "Student Management";
const yearId = (n) => uuidOf(SPS(`select id from academic_year where name='${n}' and archived_at is null;`));
const y26 = yearId("2026-27"), y27 = yearId("2027-28");
const nurseryA = uuidOf(SPS(`select x.id from section x join school_class c on c.id=x.class_id where c.name='Nursery' and x.name='A' and x.academic_year_id='${y26}';`));

const tt = await login("teacher");
await open(tt, "/student-management/promotion");
// The page sends a non-manager away with a streamed redirect, which lands after "load".
await tt.waitForURL((u) => !u.pathname.endsWith("/promotion"), { timeout: 20000 }).catch(() => {});
await tt.waitForLoadState("load");
let t = (await mainText(tt, 2000)).replace(/\s+/g, " ");
const tools = await tt.locator("button", { hasText: /Review and confirm|Confirm and save/ }).count();
res(SM, "Promotion", "Class teacher opens Promotion", "Class Teacher (Sunrise)", "Not offered: no promotion controls (server also refuses)", `${tt.url().replace(/^https?:\/\/[^/]+/, "")} | ${t.slice(0, 220)} | controls: ${tools}`, tools === 0 && !/Move a whole class/.test(t) ? "PASS" : "FAIL");

const pr = await login("principal");
await open(pr, `/student-management/promotion?fromYear=${y26}&from=${nurseryA}&toYear=${y27}`);
const sel = pr.locator("li select").first();
const before = await sel.inputValue();
await sel.selectOption(before === "DETAIN" ? "PROMOTE" : "DETAIN");
const btn = pr.locator("button", { hasText: "Review and confirm" });
const blocked = await btn.isDisabled();
const alert = (await pr.locator("[role=alert]").allInnerTexts()).join(" ").replace(/\s+/g, " ");
res(SM, "Promotion", "Change one decision from the suggestion with no reason", "Principal (Sunrise)", "Review and confirm is held back; asks for a reason", `${blocked ? "button disabled" : "button enabled"}; ${alert}`, blocked && /Give a reason/.test(alert) ? "PASS" : "FAIL");
await pr.locator("li input").first().fill("Demo: QA reason");
res(SM, "Promotion", "Give the reason", "Principal (Sunrise)", "Review and confirm becomes available", (await btn.isDisabled()) ? "still disabled" : "enabled", (await btn.isDisabled()) ? "FAIL" : "PASS");
await close();
