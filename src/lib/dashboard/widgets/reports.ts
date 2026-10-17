// Reports & Analytics on the Dashboard (19 "Connects to": "01 Dashboard:
// early warnings and pinned charts"). Leaders see the open Act-now flags they
// watch; class teachers see their own students' flags that wait for a review;
// anyone who pinned an Analytics chart sees it under their numbers. Students
// with an Attendance Flag are counted by the Attendance cards, not here, so
// each child is counted once.
import "server-only";

import { reportAccess } from "../../reports/access";
import { dashboardWarningStudents } from "../../reports/warnings";
import { pinsOf } from "../../reports/pins";
import { pinnedCharts, type AChart } from "../../reports/analytics";
import { forecastsFor } from "../../reports/forecasts";
import { plural } from "../common";
import type { DashContext, Panel, Viewer, Widget } from "../types";

const BASE = "/reports-analytics";
const access = (v: Viewer) => reportAccess(v);

/** Open Act-now flags (leaders), or flags waiting for this teacher's review. */
const earlyWarnings: Widget<"attention"> = {
  id: "reports.early-warnings",
  module: "reports-analytics",
  kind: "attention",
  homes: ["leader", "teacher", "class-teacher", "academic-head"],
  allowed: (v) => access(v).warnings.on,
  async load(c: DashContext) {
    const a = access(c.viewer);
    const n = (await dashboardWarningStudents(c.tx, c.viewer, a)).length;
    if (!n) return null;
    if (a.warnings.review === "none") {
      return {
        id: "reports.early-warnings", tone: "bad", icon: "TriangleAlert",
        title: `Early warnings: ${plural(n, "student")} to act on now`,
        detail: "From marks and fees, and attendance not flagged in Attendance. Class teachers review; you can remind them.",
        action: "Open", href: `${BASE}/early-warnings`, value: String(n),
      };
    }
    return {
      id: "reports.early-warnings", tone: "warn", icon: "TriangleAlert",
      title: `Early warnings: ${plural(n, "student")} to review`,
      detail: "Nothing happens to a student until you review the flag.",
      action: "Review", href: `${BASE}/early-warnings?status=NEW`, value: String(n),
    };
  },
};

/** Looking ahead (forecasts.ts): suggestions about what may happen next, for the leaders who have Forecasts on. */
const lookingAhead: Widget<"attention"> = {
  id: "reports.looking-ahead",
  module: "reports-analytics",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => access(v).ai.forecasts,
  async load(c: DashContext) {
    const a = access(c.viewer);
    const list = await forecastsFor(c.tx, { fees: a.warnings.fees, finance: a.finance !== null });
    if (!list.length) return null;
    const decided = new Set((await c.tx.aiSignalDecision.findMany({ where: { signalKey: { in: list.map((f) => f.key) } }, select: { signalKey: true } })).map((d) => d.signalKey));
    const open = list.filter((f) => !decided.has(f.key));
    if (!open.length) return null;
    const soon = open.filter((f) => f.strength === "ACT_NOW").length;
    return {
      id: "reports.looking-ahead", tone: soon ? "warn" : "info", icon: "Sparkles",
      title: `Looking ahead: ${plural(open.length, "thing")} that may need you soon`,
      detail: `${soon ? `${soon} to act on soon. ` : ""}For example: ${open[0].title}. Suggestions only; you decide.`,
      action: "See all", href: `${BASE}/early-warnings#looking-ahead`, value: String(open.length),
    };
  },
};

/** One Dashboard card from a pinned chart: percent bars as bars, anything else as a short list. */
function panelOf(ch: AChart): Panel {
  const rows = ch.kind === "hbars" ? (ch.hbars ?? []).map((r) => ({ k: r.k, v: r.v, label: r.label ?? `${r.v}${ch.unit ?? "%"}` }))
    : ch.kind === "bars" ? (ch.bars ?? []).map((r) => ({ k: r.k, v: r.v, label: `${r.v.toLocaleString("en-IN")}${ch.unit ?? ""}` }))
      : [];
  const href = `${BASE}/analytics?area=${ch.key.split(".")[0]}`;
  if (ch.kind === "hbars" && (ch.unit ?? "%") === "%" && (ch.max ?? 100) <= 100) {
    return { kind: "bars", title: ch.title, sub: ch.sub, icon: "Sparkles", rows: rows.slice(0, 12).map((r) => ({ key: r.k, label: r.k, value: r.v })), goal: ch.goal, lowBelow: ch.lowBelow, href, linkLabel: "Analytics", empty: ch.empty ?? "Nothing yet." };
  }
  return { kind: "list", title: ch.title, sub: ch.sub, icon: "Sparkles", rows: rows.slice(0, 8).map((r) => ({ id: r.k, title: r.k, sub: "", right: r.label })), href, linkLabel: "Analytics", empty: ch.empty ?? "Nothing yet." };
}

/** Charts the person pinned from Analytics, under their numbers. */
const pinned: Widget<"panel"> = {
  id: "reports.pinned-charts",
  module: "reports-analytics",
  kind: "panel",
  homes: "any",
  allowed: (v) => access(v).pages.analytics,
  async load(c) {
    const keys = await pinsOf(c.tx, c.viewer.ctx, "chart");
    if (!keys.length) return null;
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = c.year && c.year.startDate <= c.today ? c.year.startDate : new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth(), 1));
    const range = { period: "acyear" as const, from: iso(from), to: iso(c.today), label: c.year ? `${c.year.name} so far` : "This month" };
    const setup = { timeZone: c.tz, weekStart: (c.viewer.school as { weekStart?: "monday" | "sunday" }).weekStart ?? "monday", calendar: {} };
    const charts = await pinnedCharts(c.tx, c.viewer, keys.slice(0, 4), setup, c.today, range);
    return charts.filter((ch) => ch.kind === "hbars" || ch.kind === "bars").map((ch) => ({ slot: "main" as const, panel: panelOf(ch) }));
  },
};

export const REPORTS_WIDGETS: readonly Widget[] = [earlyWarnings, lookingAhead, pinned];
