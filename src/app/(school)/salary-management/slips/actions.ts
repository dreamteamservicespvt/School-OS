"use server";

import { id, str, UUID_RE } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { sendSlips } from "@/lib/salary/slips";
import { skippedWords } from "@/lib/messaging/send";
import { campusRun, runsOnCampus } from "@/lib/salary/campus";
import { salaryAction } from "../_lib/action";

/** Send the chosen slips (or every slip of a month not sent yet) by WhatsApp, email or in the app. */
export async function sendSlipsAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const how = str(fd, "how");
    const channel = how === "email" ? "email" : how === "app" ? "app" : "whatsapp";
    let ids = str(fd, "ids").split(",").filter((x) => UUID_RE.test(x));
    // One campus: slips of another campus's month are not found.
    if (ids.length && current.campusId) {
      ids = (await tx.payslip.findMany({ where: { id: { in: ids }, run: runsOnCampus(current) }, select: { id: true } })).map((s) => s.id);
      if (!ids.length) throw new MoneyProblem("These slips were not found.");
    }
    if (!ids.length && str(fd, "runId")) {
      const runId = (await campusRun(tx, id(fd, "runId", "salary month"), current)).id;
      ids = (await tx.payslip.findMany({ where: { runId, status: "MADE" }, select: { id: true } })).map((s) => s.id);
      if (!ids.length) throw new MoneyProblem("Every slip of this month is already sent.");
    }
    const r = await sendSlips(tx, ctx, ids, channel);
    return { ...r, channel };
  }, (r) => `${r.count} slips sent by ${r.channel === "whatsapp" ? "WhatsApp" : r.channel}. Each person gets only their own; the slip opens in My profile.${r.skipped.length ? ` Not sent: ${skippedWords(r.skipped)}.` : ""}`);
}
