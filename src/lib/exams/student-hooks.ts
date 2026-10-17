// Examination & Results plugs into Student Management (G23): when a student
// changes section, or the change is undone, their marks, draft results and
// report cards of that year go with them; published results stay as they
// were. Imported by src/lib/students/students.ts.
import "server-only";

import { onSectionChanged } from "../students/hooks";
import { followSectionChange } from "./results";

onSectionChanged((tx, ctx, e) => followSectionChange(tx, ctx, e));
