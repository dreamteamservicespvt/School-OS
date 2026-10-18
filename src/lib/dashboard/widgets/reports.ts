// Reports & Analytics on the Dashboard (19 "Connects to": "01 Dashboard:
// early warnings and pinned charts"; 01 Principal summary). Leaders get
// the students who need a closer look (Act now: strong signs
// in attendance or marks, never fees alone); class teachers their own
// students' flags; anyone who pinned an Analytics chart sees it under their
// numbers. The Early Warnings card counts students with an Attendance Flag
// too, so the Attendance "below the threshold" card stays away from people
// who see Early Warnings: each child is counted once.
import "server-only";

import { reportAccess } from "../../reports/access";
import { ACT_NOW_HREF, aiSignals, dashboardWarnings } from "../../reports/warnings";
import { closerLookWords } from "../../reports/strength";
import { lookingAheadView } from "../../reports/looking-ahead";
import { pinsOf } from "../../reports/pins";
import { pinnedCharts, type AChart } from "../../reports/analytics";
import { plural } from "../common";
import type { DashContext, Panel, Viewer, Widget } from "../types";

const BASE = "/reports-analytics";
const access = (v: Viewer) => reportAccess(v);

/**
 * Early Warnings: the students who need a closer look (an open Act now row:
 * attendance, marks, or both), once each, with what it is about. Fee rows are
 * never counted: overdue fees are followed up from Fee Defaulters. People who
 * review also see how many students wait for their review.
 */
const earlyWarnings: Widget<"attention"> = {
  id: "reports.early-warnings",
  module: "reports-analytics",
  kind: "attention",
  homes: ["leader", "teacher", "class-teacher", "academic-head"],
  allowed: (v) => access(v).warnings.on,
  async load(c: DashContext) {
    const a = access(c.viewer);
    const w = await dashboardWarnings(c.tx, c.viewer, a);
    if (!w) return null;
    const reviews = a.warnings.review !== "none";
    if (w.look.students) {
      return {
        id: "reports.early-warnings", tone: "bad", icon: "TriangleAlert",
        title: `Early warnings: ${closerLookWords(w.look)}`,
        detail: reviews
          ? `${w.actNowToReview ? `${w.actNowToReview} not reviewed yet. ` : ""}Strong signs only. Nothing happens to a student until you review the flag.`
          : "Strong signs only, from attendance and marks. Class teachers review; you can remind them. Fees stay in Fee Defaulters.",
        action: reviews ? "Review" : "Open", href: ACT_NOW_HREF, value: `${w.look.students}:${w.look.attendance}:${w.look.marks}:${w.look.both}`,
      };
    }
    if (reviews && w.toReview) {
      return {
        id: "reports.early-warnings", tone: "warn", icon: "TriangleAlert",
        title: `Early warnings: ${plural(w.toReview, "student")} to review`,
        detail: "Watch signs, from attendance and marks. Nothing happens to a student until you review the flag.",
        action: "Review", href: `${BASE}/early-warnings?status=NEW&period=all`, value: String(w.toReview),
      };
    }
    return null;
  },
};

/** Looking ahead (forecasts.ts): suggestions about what may happen next, most important first, for the leaders who have Forecasts or Student insights on. */
const lookingAhead: Widget<"attention"> = {
  id: "reports.looking-ahead",
  module: "reports-analytics",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => access(v).ai.forecasts || access(v).ai.insights,
  async load(c: DashContext) {
    const a = access(c.viewer);
    const open = await aiSignals(c.tx, c.viewer, a);
    if (!open.length) return null;
    const view = lookingAheadView(open);
    const soon = open.filter((f) => f.strength === "ACT_NOW").length;
    return {
      id: "reports.looking-ahead", tone: soon ? "warn" : "info", icon: "Sparkles",
      title: `Looking ahead: ${plural(open.length, "suggestion")} about what may happen next`,
      detail: `${soon ? `${soon} to act on soon. ` : ""}Most important: ${view.top[0].title}. Suggestions only; you decide.`,
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
