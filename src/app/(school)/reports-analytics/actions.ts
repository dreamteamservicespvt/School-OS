"use server";

// Every change made on the Reports & Analytics pages. Each one checks the
// person's role on the server (requireAction, then what Reports & Analytics
// allows them), runs inside the school's walls and writes the audit log in the
// same transaction where the change is a school record.

import type { FormState } from "@/lib/forms";
import { inReports, problemState, repAction, repQuick, str, id, all, UUID_RE } from "@/lib/reports/act";
import { entryAllowed, findEntry } from "@/lib/reports/catalogue";
import { togglePin } from "@/lib/reports/pins";
import { prepareReport, ReportProblem } from "@/lib/reports/run";
import { analyticsAreas, areaOfChart } from "@/lib/reports/analytics";
import { decideAiSignal, DECISION_LABEL, flagArea, mayReview, remindFlag, reviewFlag, saveDropRule, WarningProblem, type Decision } from "@/lib/reports/warnings";
import { archiveCustom, cleanSpec, CustomProblem, mayChangeSchedule, saveCustom, saveSchedule, sendSchedule, setScheduleStatus } from "@/lib/reports/custom";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { BASE, CUSTOM_FEATURE } from "@/lib/reports/access";
import { writeAudit } from "@/lib/audit";

type S = FormState<unknown>;

/* ---------- All Reports ---------- */

/** Pins a report to the top of All Reports, or a chart to the person's Dashboard (their own shortcut). */
export async function togglePinAction(kind: "report" | "chart", key: string, name: string): Promise<string | null> {
  return repQuick("view", async (w) => {
    if (kind === "report") {
      const e = findEntry(key);
      if (!e || !entryAllowed(e, w.a, w.current)) throw new ReportProblem("This report is not open to your role.");
    } else if (!/^[\w.-]{1,80}$/.test(key) || !analyticsAreas(w.current, w.a).includes(areaOfChart(key))) throw new ReportProblem("This chart is not open to your role.");
    return togglePin(w.tx, w.ctx, kind, key);
  }, (on) => {
    const n = name.slice(0, 120);
    if (kind === "chart") return on ? `Pinned to your Dashboard: ${n}. It shows under your numbers on the Dashboard.` : `Removed from your Dashboard: ${n}.`;
    return on ? `Pinned: ${n}. It stays at the top of All Reports for you.` : `Unpinned: ${n}.`;
  });
}

/** Starts a heavy report in the background; the person is notified with the download link. */
export async function prepareAction(key: string, params: Record<string, string>, words: string, format: string): Promise<{ problem: string | null; runId?: string }> {
  try {
    const run = await inReports("export", async (w) => {
      const e = findEntry(key);
      if (!e) throw new ReportProblem("This report was not found.");
      const clean = Object.fromEntries(Object.entries(params).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 100)]));
      return prepareReport(w.tx, w.current, e, clean, words.slice(0, 500), format === "csv" || format === "pdf" ? format : "xlsx");
    });
    return { problem: null, runId: run.id };
  } catch (e) {
    return { problem: problemState(e).message ?? "That did not work. Please try again." };
  }
}

/* ---------- Early Warnings ---------- */

export async function reviewAction(_: S, fd: FormData): Promise<S> {
  return repAction("edit", fd, async (w) => {
    const flagId = id(fd, "flagId", "flag");
    const decision = str(fd, "decision") as Decision;
    if (!(decision in DECISION_LABEL)) throw new WarningProblem("Choose the decision.", "decision");
    const area = await flagArea(w.tx, flagId);
    if (area && !mayReview(w.a, area)) throw new WarningProblem("Your role watches these flags. Use Remind to ask the class teacher.");
    return reviewFlag(w.tx, w.current, w.a, flagId, { decision, note: str(fd, "note"), action: str(fd, "action") || null });
  }, (r) => ({ message: r.status === "CLOSED" ? `Closed: ${r.name}. Recorded with your name and note in the audit log.` : `${DECISION_LABEL[r.decision as Decision]}: ${r.name}. ${r.made ? `${r.made} ` : ""}Recorded in the audit log.` }));
}

export async function remindFlagAction(flagId: string): Promise<string | null> {
  if (!UUID_RE.test(flagId)) return "That flag was not found.";
  return repQuick("view", (w) => remindFlag(w.tx, w.current, w.a, flagId), (r) => `Reminded ${r.names.join(", ")} about ${r.student}.`);
}

export async function dropRuleAction(_: S, fd: FormData): Promise<S> {
  return repAction("edit", fd, async (w) => {
    const raw = str(fd, "drop");
    if (!/^\d{1,2}$/.test(raw)) throw new WarningProblem("Enter a number from 5 to 50.", "drop");
    return saveDropRule(w.tx, w.ctx, w.a, Number(raw));
  }, (v) => `Marks-drop rule: ${v}%. Flags use it from the next check. Recorded in the audit log.`);
}

export async function aiDecisionAction(key: string, decision: "FLAGGED" | "DISMISSED"): Promise<string | null> {
  if (!/^[\w:.-]{1,200}$/.test(key) || !["FLAGGED", "DISMISSED"].includes(decision)) return "That suggestion was not found.";
  return repQuick("view", async (w) => {
    if (!w.a.ai.insights && !w.a.ai.forecasts) throw new WarningProblem("AI signals are off for this school.");
    return decideAiSignal(w.tx, w.current, w.a, key, decision);
  }, (r) => (decision === "DISMISSED" ? "Closed as not a concern. Thanks, this helps the suggestions." : r.flagId ? "Added to the list for review. Nothing changes until someone reviews it." : "Added to your tasks to check."));
}

/* ---------- Custom & Scheduled Reports ---------- */

function needCustom(a: { pages: { custom: boolean } }) {
  if (!a.pages.custom) throw new CustomProblem("Custom & Scheduled Reports are not open to your role.");
}

export async function saveCustomAction(_: S, fd: FormData): Promise<S> {
  const res = await repAction("create", fd, async (w) => {
    needCustom(w.a);
    const spec = cleanSpec({ area: str(fd, "area"), columns: all(fd, "columns"), classId: str(fd, "classId") || null, show: str(fd, "show"), group: str(fd, "group"), totals: str(fd, "totals") !== "0" }, w.current);
    const r = await saveCustom(w.tx, w.current, str(fd, "name"), spec);
    return { r, schedule: str(fd, "then") === "schedule" };
  }, (x) => ({ message: `Saved: ${x.r.name}. ${x.schedule ? "Now choose when to send it." : "It is in My custom reports. Schedule it to get it by email."}` }));
  // "Save and schedule it" goes straight on to the schedule sheet for the new report.
  if (res?.ok && res.data?.schedule) redirect(`${BASE}/custom?schedule=c:${res.data.r.id}`);
  return res;
}

export async function archiveCustomAction(_: S, fd: FormData): Promise<S> {
  return repAction("archive", fd, async (w) => {
    needCustom(w.a);
    return archiveCustom(w.tx, w.current, id(fd, "reportId", "report"));
  }, (r) => `Archived: ${r.name}. Its schedules are paused.`);
}

export async function saveScheduleAction(_: S, fd: FormData): Promise<S> {
  return repAction("create", fd, async (w) => {
    needCustom(w.a);
    const scheduleId = str(fd, "scheduleId");
    const s = await saveSchedule(w.tx, w.current, {
      reportKey: str(fd, "reportKey"), datePreset: str(fd, "datePreset") || "default", frequency: str(fd, "frequency"), day: Number(str(fd, "day")) || 1,
      timeMin: Number(str(fd, "timeMin")), format: str(fd, "format"), recipientIds: all(fd, "recipientIds"),
    }, UUID_RE.test(scheduleId) ? scheduleId : null);
    return { s, tz: w.tz, edit: UUID_RE.test(scheduleId) };
  }, ({ s, tz, edit }) => `${edit ? "Schedule saved" : "Scheduled"}: ${s.reportName}. Next send ${formatDateTime(s.nextAt, tz)}.`);
}

export async function scheduleStatusAction(scheduleId: string, to: "ACTIVE" | "PAUSED"): Promise<string | null> {
  if (!UUID_RE.test(scheduleId) || !["ACTIVE", "PAUSED"].includes(to)) return "That schedule was not found.";
  return repQuick("edit", async (w) => { needCustom(w.a); return setScheduleStatus(w.tx, w.current, scheduleId, to); },
    (s) => (to === "ACTIVE" ? `Schedule started again: ${s.reportName}.` : `Schedule paused: ${s.reportName}.`));
}

export async function archiveScheduleAction(_: S, fd: FormData): Promise<S> {
  return repAction("archive", fd, async (w) => {
    needCustom(w.a);
    return setScheduleStatus(w.tx, w.current, id(fd, "scheduleId", "schedule"), "ARCHIVED");
  }, (s) => `Schedule archived: ${s.reportName}. Its send history is kept.`);
}

export async function sendNowAction(scheduleId: string): Promise<string | null> {
  if (!UUID_RE.test(scheduleId)) return "That schedule was not found.";
  let problem: string | null = null;
  const r = await repQuick("create", async (w) => {
    needCustom(w.a);
    await mayChangeSchedule(w.tx, w.current, scheduleId);
    const out = await sendSchedule(w.tx, w.ctx, scheduleId);
    if (!out.sent && out.problems.length) problem = `Not sent: ${out.problems.join("; ")}`;
    const s = await w.tx.reportSchedule.findFirstOrThrow({ where: { id: scheduleId }, select: { reportName: true } });
    return { ...out, name: s.reportName };
  }, (x) => (x.sent ? `Sent: ${x.name} to ${x.sent} ${x.sent === 1 ? "person" : "people"}${x.problems.length ? `. Not sent to: ${x.problems.join("; ")}` : ""}.` : null));
  return r ?? problem;
}

/** Custom & Scheduled Reports on or off for the school (optional, P19). Its reports and schedules stay when off. */
export async function customFeatureAction(on: boolean): Promise<string | null> {
  return repQuick("edit", async (w) => {
    if (!w.a.full) throw new CustomProblem("Only the Principal or School Admin switches this on or off.");
    const row = await w.tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: w.ctx.schoolId, featureKey: CUSTOM_FEATURE } } });
    if ((row?.isOn ?? false) === on) return;
    await w.tx.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId: w.ctx.schoolId, featureKey: CUSTOM_FEATURE } },
      create: { schoolId: w.ctx.schoolId, featureKey: CUSTOM_FEATURE, isOn: on },
      update: { isOn: on },
    });
    if (!on) await w.tx.reportSchedule.updateMany({ where: { status: "ACTIVE", archivedAt: null }, data: { status: "PAUSED" } });
    await writeAudit(w.tx, w.ctx, { action: on ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { feature: "Custom & Scheduled Reports", on: !on }, after: { feature: "Custom & Scheduled Reports", on } });
  }, () => (on ? "Custom & Scheduled Reports is on. Find it in the Reports tabs." : "Custom & Scheduled Reports is off. Saved reports are kept; schedules are paused."));
}
