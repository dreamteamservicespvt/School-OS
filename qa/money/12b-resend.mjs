// Prod has no Change for a sent-back expense (MONEY-06): send it again unchanged so approval and payment can be tested.
import { as, visit, sql, SCHOOL_A, result } from "./m.mjs";
import { close } from "../lib.mjs";
const e = sql(`select id from expense where school_id='${SCHOOL_A}' and number='EXP/2026-27/00004'`)[0][0];
const page = await as("cems.accountant");
await visit(page, `/finance-management/expenses?open=${e}`);
await page.getByRole("dialog").last().getByRole("button", { name: "Send again" }).click();
await page.waitForTimeout(4000);
const s = sql(`select status from expense where id='${e}'`)[0][0];
result({ module: "Finance Management", page: "Expenses", action: "Send the sent-back expense again (unchanged)", role: "accountant", expected: "Waiting for approval", actual: `status=${s}`, status: s === "WAITING" ? "PASS" : "FAIL" });
await close();
