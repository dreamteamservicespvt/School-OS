// Where Student Management's facts about each student come from (03 §2
// Promotion, Student List and Parent 360; 03 §2 "Undo a batch while nothing
// has been recorded"): one explicit list, not a side effect of some other
// import. ./hooks.ts loads it itself, so every page, action and job that asks
// for facts gets every source, even on a server that has just started.
//
// A module that gives facts exports them from its own student-facts file and
// adds one line to each list below.
import "server-only";

import type { ActivitySource, FeeFilterSource, ListSource, PromotionSource } from "./hooks";
import * as attendance from "../attendance/student-facts";
import * as exams from "../exams/student-facts";
import * as fees from "../fees/student-facts";

/** Final result, attendance % and fees due, for the promotion suggestion. */
export const promotionSources: PromotionSource[] = [exams.promotionFacts, attendance.promotionFacts, fees.promotionFacts];

/** The Student List's and Parent 360's columns, each with who may see it. */
export const listSources: ListSource[] = [attendance.listFacts, exams.listFacts, fees.listFacts];

/** The Student List's "Has dues" and "Overdue" filter. */
export const feeFilter: FeeFilterSource = fees.studentsWithDues;

/** What stops a promotion being undone: anything recorded in the new year. */
export const activitySources: ActivitySource[] = [attendance.yearActivity, fees.yearActivity];
