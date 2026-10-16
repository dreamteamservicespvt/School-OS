// What every Student Management page and action starts with: the person,
// what they may do here, the school's student settings and the current year.
import "server-only";

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { requireAction, requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { currentYear } from "@/lib/academic/years";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities, requireManage } from "@/lib/students/access";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import { StudentProblem } from "@/lib/students/students";
import { ClosedYearError } from "@/lib/academic/years";
import { FileProblem } from "@/lib/files";
import { DecisionProblem } from "@/lib/approvals";
import { ParentLinkProblem } from "@/lib/parent-link/links";
import { MessagingProblem } from "@/lib/messaging/send";
import type { FormState } from "@/lib/forms";
// Every module's hooks (fee plan, clearance checks, import kinds, approval follow-ups) are loaded here.
import "@/lib/job-registry";
import "@/lib/undo-handlers";
import "@/lib/students/provider-modules";

export const MODULE = "student-management" as const;
export const BASE = "/student-management";

export const studentPage = cache(async () => {
  const current = await requirePage(MODULE);
  const { settings, year } = await withSchool(current.ctx, async (tx) => ({
    settings: await getStudentSettings(tx, current.ctx),
    year: await currentYear(tx, current.ctx),
  }));
  return { current, settings, year, can: abilities(current, settings), tz: current.school.timeZone };
});

/** For server actions: checks the role on the server first; "manage" also needs Full. */
export async function studentAction(action: Action, opts: { manage?: boolean } = {}) {
  const { current } = await requireAction(MODULE, action);
  const { settings, year } = await withSchool(current.ctx, async (tx) => ({
    settings: await getStudentSettings(tx, current.ctx),
    year: await currentYear(tx, current.ctx),
  }));
  if (opts.manage) requireManage(current);
  return { current, settings, year, can: abilities(current, settings) };
}

/** Turns a rule's refusal into plain words next to the right field; anything else is a calm general message. */
export function problem(e: unknown, values?: Record<string, string>): NonNullable<FormState> {
  if (e instanceof StudentProblem) return { ok: false, message: e.message, errors: e.field ? { [e.field]: e.message } : undefined, values };
  if (e instanceof PermissionDeniedError || e instanceof ClosedYearError || e instanceof FileProblem || e instanceof DecisionProblem || e instanceof ParentLinkProblem || e instanceof MessagingProblem) return { ok: false, message: e.message, values };
  if (e instanceof Error && e.name === "StudentNotFound") return { ok: false, message: e.message, values };
  console.error(e);
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs a one-click action: nothing back when it worked, or the problem in plain words. */
export async function attempt(fn: () => Promise<unknown>): Promise<string | void> {
  try {
    await fn();
  } catch (e) {
    unstable_rethrow(e);
    return problem(e).message;
  }
}

/** For forms: runs the change and turns any refusal into a form result. */
export async function attemptForm(values: Record<string, string>, fn: () => Promise<NonNullable<FormState> | void>): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return problem(e, values);
  }
}

/** The address the app is opened at, for links in QR codes and set-password links. */
/** The site address printed on certificates (their verify QR). APP_URL wins over the request's host. */
export async function origin() {
  return appOrigin();
}

/** Today's date (YYYY-MM-DD) in the school's time zone. */
export const todayIso = (timeZone = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
