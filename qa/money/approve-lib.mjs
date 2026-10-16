// Decide an approval through /approvals/<id> (the approver's screen).
import { visit, sql, SCHOOL_A } from "./m.mjs";

export function findApproval(summaryLike, status = "WAITING") {
  return sql(`select id, summary from approval where school_id='${SCHOOL_A}' and status='${status}' and summary like '${summaryLike.replace(/'/g, "''")}' order by created_at desc limit 1`)[0];
}

/** decision: approve | reject | change. Returns the approval's status after. */
export async function decide(page, approvalId, decision, note = "Demo QA decision note") {
  await visit(page, `/approvals/${approvalId}`);
  if (decision === "approve") {
    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    const dlg = page.getByRole("dialog");
    await page.waitForTimeout(800);
    if (await dlg.count()) { const b = dlg.getByRole("button", { name: /^Approve/ }); if (await b.count()) await b.last().click(); }
  } else {
    await page.getByRole("button", { name: decision === "reject" ? "Reject" : /Ask for a change|Send back/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=note]").fill(note);
    await dlg.getByRole("button", { name: decision === "reject" ? "Reject" : "Send back for a change" }).click();
  }
  for (let i = 0; i < 30; i++) {
    const s = sql(`select status from approval where id='${approvalId}'`)[0][0];
    if (s !== "WAITING") return s;
    await page.waitForTimeout(500);
  }
  return "WAITING";
}
