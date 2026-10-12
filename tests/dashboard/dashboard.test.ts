// Dashboard: each person's home holds only what they may see, widgets of
// modules that are not built or are switched off never load, and one school
// never sees another's numbers (01-dashboard.md, 05-roles.md).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { BUILT_MODULES, type ModuleKey } from "@/lib/modules";
import { buildHome, widgetsFor } from "@/lib/dashboard/compose";
import { homesFor } from "@/lib/dashboard/homes";
import { WIDGETS, SLOTS } from "@/lib/dashboard/registry";
import type { Panel, Widget } from "@/lib/dashboard/types";
import type { Current } from "@/lib/current";
import { academicSchool } from "../academic/fixture";
import { makeSchool, makeUser } from "../helpers";

// Monday 12 October 2026, 8:00 AM in India: before period 1.
const NOW = new Date("2026-10-12T02:30:00Z");

let f: Awaited<ReturnType<typeof academicSchool>>;
let principal: Current, teacher: Current, librarian: Current;

beforeAll(async () => {
  f = await academicSchool();
  const lib = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["librarian"] }] });
  [principal, teacher, librarian] = await Promise.all([f.currentFor(f.principal.id), f.currentFor(f.teacherUser.id), f.currentFor(lib.id)]);
  // Another school with its own staff and tasks, which must never show here.
  const other = await makeSchool("Other School");
  const otherUser = await makeUser({ schools: [{ id: other.id, roleKeys: ["principal"] }] });
  await withSchool({ schoolId: other.id, userId: otherUser.id }, async (tx) => {
    for (let i = 0; i < 3; i++) {
      await tx.staff.create({ data: { schoolId: other.id, campusId: other.campus.id, staffCode: `O-${i}`, firstName: "Other", lastName: `${i}`, fullName: `Other ${i}`, phone: `91111111${i}0`, designation: "Teacher", staffType: "Teaching", joiningDate: new Date("2020-06-01") } });
    }
    await tx.task.create({ data: { schoolId: other.id, title: "Other school task", assignedToId: otherUser.id, givenById: otherUser.id } });
  });
}, 120_000);

const panels = (h: Awaited<ReturnType<typeof buildHome>>): Panel[] => [...h.panels.first, ...h.panels.main, ...h.panels.side];
const ids = (h: Awaited<ReturnType<typeof buildHome>>) => [...h.band.map((b) => b.id), ...h.attention.map((a) => a.id), ...h.agenda.map((a) => a.id)];

describe("homes", () => {
  it("gives the Principal the control centre, and other roles their own home", () => {
    expect(homesFor(principal)[0]).toBe("leader");
    expect(homesFor(teacher)).toEqual(["teacher", "staff"]);
    expect(homesFor(librarian)).toEqual(["librarian", "staff"]);
  });
});

describe("what each role's home loads", () => {
  it("a teacher sees only their own periods, never another teacher's class", async () => {
    const home = await buildHome(teacher, { now: NOW });
    expect(home.leader).toBe(false);
    const today = panels(home).find((p) => p.kind === "classes-today");
    expect(today?.kind).toBe("classes-today");
    const sections = today?.kind === "classes-today" ? today.rows.map((r) => r.sectionId) : [];
    expect(sections.sort()).toEqual([f.s5a.id, f.s5b.id].sort());
    expect(sections).not.toContain(f.s6a.id);
    // No school-wide numbers or cards on a teacher's home.
    expect(ids(home)).not.toContain("students.head-count");
    expect(ids(home)).not.toContain("staff.head-count");
    expect(panels(home).some((p) => p.kind === "classes-overview")).toBe(false);
    expect(home.band.find((b) => b.id === "academic.classes-today-count")?.big).toBe("2");
  });

  it("the Principal sees the whole school's numbers, and only this school's", async () => {
    const home = await buildHome(principal, { now: NOW });
    expect(home.leader).toBe(true);
    const staff = home.band.find((b) => b.id === "staff.head-count");
    expect(staff?.big).toBe("4");
    expect(staff?.href).toBe("/staff-hr-management");
    expect(home.tasks.mine.every((t) => t.title !== "Other school task")).toBe(true);
    expect(home.approvals).not.toBeNull();
  });

  it("a librarian gets a focused home with no teaching or school-wide cards", async () => {
    const home = await buildHome(librarian, { now: NOW });
    expect(panels(home)).toHaveLength(0);
    expect(ids(home).some((i) => i.startsWith("students.") || i.startsWith("academic.classes") || i === "approvals.waiting")).toBe(false);
    expect(home.approvals).toBeNull();
  });

  it("every number links to the list behind it", async () => {
    for (const who of [principal, teacher, librarian]) {
      const home = await buildHome(who, { now: NOW });
      for (const b of home.band) if (b.id !== "academic.next-holiday") expect(b.href, b.id).toMatch(/^\//);
      for (const a of home.attention) expect(a.href).toMatch(/^\//);
    }
  });
});

describe("modules that are not built or are switched off", () => {
  it("registers widgets only for built modules; the others wait in named slots", () => {
    for (const w of WIDGETS) expect(BUILT_MODULES.has(w.module), w.id).toBe(true);
    for (const s of SLOTS) {
      expect(BUILT_MODULES.has(s.module), s.id).toBe(false);
      expect(WIDGETS.some((w) => w.id === s.id)).toBe(false);
    }
  });

  it("loads nothing from a module that is not built", async () => {
    const built = new Set<ModuleKey>([...BUILT_MODULES].filter((m) => m !== "academic-management"));
    const home = await buildHome(teacher, { now: NOW, built });
    expect(panels(home).some((p) => p.kind === "classes-today" || p.kind === "bars")).toBe(false);
    expect(ids(home).some((i) => i.startsWith("academic.") && i !== "academic.next-holiday" && !i.startsWith("calendar"))).toBe(false);
  });

  it("loads nothing from a module the person's role cannot open", async () => {
    const noStudents = { ...principal, permissions: { ...principal.permissions, "student-management": { see: "none", change: "none" } } } as Current;
    const home = await buildHome(noStudents, { now: NOW });
    expect(ids(home).some((i) => i.startsWith("students."))).toBe(false);
    expect(panels(home).some((p) => p.kind === "classes-overview")).toBe(false);
  });

  it("loads nothing from an optional module the school has switched off", async () => {
    let loaded = 0;
    const lib: Widget<"band"> = { id: "library.test", module: "library-management", kind: "band", homes: "any", load: async () => { loaded++; return { id: "library.test", label: "Books", big: "1" }; } };
    const built = new Set<ModuleKey>([...BUILT_MODULES, "library-management"]);
    const allowed = { ...librarian, permissions: { ...librarian.permissions, "library-management": { see: "all", change: "all" } } } as Current;
    const off = { ...allowed, modulesOn: new Set<ModuleKey>() } as Current;
    expect(widgetsFor(off, homesFor(off), [lib], built)).toHaveLength(0);
    const on = { ...allowed, modulesOn: new Set<ModuleKey>(["library-management"]) } as Current;
    expect(widgetsFor(on, homesFor(on), [lib], built)).toHaveLength(1);
    // And a module that is switched on but not built still loads nothing.
    expect(widgetsFor(on, homesFor(on), [lib])).toHaveLength(0);
    await buildHome(off, { now: NOW, widgets: [lib], built });
    expect(loaded).toBe(0);
  });
});
