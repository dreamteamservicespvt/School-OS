// Reports & Analytics background work: heavy reports (reports:run, in run.ts),
// scheduled report emails (custom.ts), and the early-warning refresh, which
// works the flags out again every hour from attendance, marks and fees.
import "server-only";

import { defineSchedule } from "../jobs";
import { refreshFlags } from "./warnings";
import "./run";
import "./custom";

defineSchedule("early-warnings", 60, (tx, ctx, now) => refreshFlags(tx, ctx, now));
