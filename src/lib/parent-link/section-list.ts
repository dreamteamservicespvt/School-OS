// Imports every module's Parent Link sections, so the guardian's page knows
// them. Add one import line per module (see ./sections.ts).
import "server-only";

import "./builtin-sections";
import "../attendance/parent-link";
import "../fees/parent-link-section";
import "../exams/parent-link-sections";
import "../events/parent-link";

export { allSections, shownSections, sectionSwitches } from "./sections";
