// Imports every module's approval handlers (onDecision), so a decision made
// anywhere — on the Approvals page, in bulk, or by escalation — runs the
// module's follow-up. Add one import line per module that asks for approvals.
import "server-only";

import "./data-security/privacy";
import "./staff/handlers";
import "./exams/handlers";
import "./admission/handlers";
import "./communication/handlers";
import "./students/handlers";
import "./attendance/handlers";
