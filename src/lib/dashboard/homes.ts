// Which home each person gets (01-dashboard.md §2, 05-roles.md). A person
// with several roles gets the widgets of each of their homes, first role first.
// Custom roles get the control centre with full Dashboard access, else the staff home.

import type { HomeKind, Viewer } from "./types";

const HOME_OF_ROLE: Record<string, HomeKind> = {
  principal: "leader",
  "school-admin": "leader",
  "vice-principal": "leader",
  accountant: "accountant",
  teacher: "teacher",
  "class-teacher": "class-teacher",
  receptionist: "receptionist",
  "transport-in-charge": "transport",
  librarian: "librarian",
  "hostel-warden": "warden",
  "store-keeper": "store",
  "academic-head": "academic-head",
  hr: "hr",
  "office-staff": "office",
  "exam-in-charge": "exam",
  "admission-counsellor": "admission",
  counsellor: "counsellor",
  "gate-security": "gate",
};

/** The person's homes, most important first; always ends with "staff" (their own leave, notices, holidays). */
export function homesFor(v: Pick<Viewer, "roles" | "permissions">): HomeKind[] {
  const out: HomeKind[] = [];
  const add = (h: HomeKind) => { if (!out.includes(h)) out.push(h); };
  // The control centre comes first whenever the person has full Dashboard access.
  if (v.permissions.dashboard.see === "all") add("leader");
  for (const r of v.roles) {
    const h = r.key ? HOME_OF_ROLE[r.key] : undefined;
    if (h) add(h);
  }
  // A class teacher also teaches: their periods and subjects come from the teacher home.
  if (out.includes("class-teacher")) add("teacher");
  add("staff");
  return out;
}

/** The control centre layout (dashboard.jsx) or a role home (dashboards.jsx). */
export function isLeader(homes: readonly HomeKind[]) {
  return homes[0] === "leader";
}
