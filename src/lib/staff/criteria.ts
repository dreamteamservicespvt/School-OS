// The points an appraisal rates (09 Recruitment & Appraisal). Teachers and the
// other staff (office, transport, support) are rated on different points, so a
// driver is never rated on "Classroom teaching" (layman test LD11, 12-11-2026).
// No server import here: the Start appraisal form uses the lists too.

/** The points a new cycle offers teachers. */
export const TEACHING_CRITERIA = ["Subject knowledge", "Classroom teaching", "Student results", "Punctuality", "Working with parents"];
/** The points a new cycle offers everyone else. */
export const STAFF_CRITERIA = ["Knowledge of the job", "Quality of work", "Punctuality", "Teamwork", "Care for students and visitors"];

/** The points one appraisal is rated on: its own (fixed at the start by staff type), else the cycle's. */
export const pointsOf = (a: { criteria: string[] }, cycle: { criteria: string[] }) => (a.criteria.length ? a.criteria : cycle.criteria);
