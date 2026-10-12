// What every Admission Management page starts with: the signed-in person,
// checked on the server, what they may see here, the settings and the
// admission year.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "../current";
import { withSchool } from "../db";
import type { Action } from "../permissions";
import { viewerFor } from "./access";
import { admissionYear, loadSettings } from "./settings";
import { todayIn } from "./act";

export const MODULE = "admission-management" as const;
export const BASE = "/admission-management";

export const admissionPage = cache(async (action: Action = "view") => {
  const current = await requirePage(MODULE, action);
  const { viewer, settings, year } = await withSchool(current.ctx, async (tx) => {
    const settings = await loadSettings(tx, current.ctx);
    return { viewer: await viewerFor(tx, current.ctx, current), settings, year: await admissionYear(tx, current.ctx, settings) };
  });
  const tz = current.school.timeZone;
  return { current, viewer, settings, year, tz, today: todayIn(tz) };
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
