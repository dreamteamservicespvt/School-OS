// What every Admission Management page starts with: the signed-in person,
// checked on the server, what they may see here, the settings and the
// admission year (of the person's own campus: each campus has its own years).
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "../current";
import { withSchool } from "../db";
import { narrowToCampus, personCampusId } from "../campus";
import type { Action } from "../permissions";
import { viewerFor, type Viewer } from "./access";
import { admissionYear, loadSettings } from "./settings";
import { todayIn } from "./act";

export const MODULE = "admission-management" as const;
export const BASE = "/admission-management";

export const admissionPage = cache(async (action: Action = "view") => {
  const current = await requirePage(MODULE, action);
  const { viewer, settings, year, campusId } = await withSchool(current.ctx, async (tx) => {
    const settings = await loadSettings(tx, current.ctx);
    const campusId = await personCampusId(tx, current.ctx, current);
    return { viewer: await viewerFor(tx, current.ctx, current), settings, year: await admissionYear(tx, current.ctx, settings, campusId), campusId };
  });
  const tz = current.school.timeZone;
  /** campusId: the person's own campus (theirs when limited to one; else their staff record's; else the main campus). */
  return { current, viewer, settings, year, campusId, tz, today: todayIn(tz) };
});

/** Pages for people who see every admission (the team, and View reach). People with Own reach get the "no access" page (05-roles.md). */
export async function fullPage(action: Action = "view") {
  const p = await admissionPage(action);
  if (p.viewer.see !== "all") redirect(`/no-access?m=${MODULE}`);
  return p;
}

/** Pages where the work is done (documents, tests, decisions, settings, new applications): Full reach only. */
export async function workPage(action: Action = "view") {
  const p = await admissionPage(action);
  if (p.viewer.see !== "all" || p.viewer.change !== "all") redirect(`/no-access?m=${MODULE}`);
  return p;
}

/**
 * The admission viewer narrowed to a campus chosen in the page address
 * (?campus=, from the Dashboard's filter, src/lib/campus.ts narrowToCampus):
 * that campus's enquiries and applications. Never wider than their own limit.
 */
export async function viewerOnCampus(p: { current: Awaited<ReturnType<typeof admissionPage>>["current"]; viewer: Viewer }, raw: string | string[] | undefined): Promise<Viewer> {
  if (!raw) return p.viewer;
  const who = await withSchool(p.current.ctx, (tx) => narrowToCampus(tx, p.current, raw));
  return who.campusId === p.viewer.campusId ? p.viewer : { ...p.viewer, campusId: who.campusId ?? null };
}
