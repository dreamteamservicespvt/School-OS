// Reports & Analytics background work: heavy reports (reports:run, in run.ts),
// scheduled report emails (custom.ts), and the early-warning refresh, which
// works the flags out again every hour from attendance, marks and fees, and
// the Looking ahead forecasts (forecasts.ts), and the morning management
// brief for the Principal and School Admin (brief.ts).
import "server-only";

import { defineSchedule } from "../jobs";
import { refreshFlags } from "./warnings";
import { refreshForecasts } from "./forecasts";
import { sendBriefs } from "./brief";
import "./run";
import "./custom";

defineSchedule("early-warnings", 60, (tx, ctx, now) => refreshFlags(tx, ctx, now));
// Looking ahead: after the flags (it reads them), at most every 3 hours, only where Forecasts is on.
defineSchedule("looking-ahead", 60, (tx, ctx, now) => refreshForecasts(tx, ctx, now));
// Management brief: each school morning from 7:30 (never after 11 AM), weekly on Monday; only where it is switched on.
defineSchedule("management-brief", 15, (tx, ctx, now) => sendBriefs(tx, ctx, now));
