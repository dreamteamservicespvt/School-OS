// Imports every module's Parent Link sections, so the guardian's page knows
// them. Add one import line per module (see ./sections.ts).
import "server-only";

import "./builtin-sections";
import "../fees/parent-link-section";

export { allSections, shownSections, sectionSwitches } from "./sections";
