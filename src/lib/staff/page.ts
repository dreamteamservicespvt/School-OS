// What every Staff & HR page starts with: the signed-in person, checked on
// the server, and what they may see here.
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requirePage } from "../current";
import { withSchool } from "../db";
import type { Action } from "../permissions";
import { viewerFor } from "./access";
import { ensureHrDefaults, hrFeaturesOn } from "./settings";
import { todayIn } from "./dates";

export const MODULE = "staff-hr-management" as const;
export const BASE = "/staff-hr-management";

export const staffPage = cache(async (action: Action = "view") => {
  const current = await requirePage(MODULE, action);
  const { viewer, features } = await withSchool(current.ctx, async (tx) => {
    await ensureHrDefaults(tx, current.ctx);
    return { viewer: await viewerFor(tx, current.ctx, current), features: await hrFeaturesOn(tx, current.ctx) };
  });
  const tz = current.school.timeZone;
  return { current, viewer, features, tz, today: todayIn(tz) };
});

/**
 * Pages only HR (full reach) may open: lists of everyone, and every page that changes
 * staff records (add, import, settings, exit). People with "own" reach are told why
 * on No access; their own record and leave stay open to them (05-roles).
 */
export async function hrPage(action: Action = "view") {
  const p = await staffPage(action);
  const needed = action === "view" || action === "export" || action === "print" ? p.viewer.see : p.viewer.change;
  if (needed !== "all") redirect(`/no-access?m=${MODULE}`);
  return p;
}
