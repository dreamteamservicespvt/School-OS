// The permission table in docs/blueprint/05-roles.md is the source of truth.
// This test reads the blueprint itself, so the code and the spec cannot drift.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { READY_ROLES, ROLE_TEMPLATES, type AccessLevel } from "@/lib/roles";
import { can, combineRoles, menuModules, requirePermission, PermissionDeniedError } from "@/lib/permissions";

const md = readFileSync("docs/blueprint/05-roles.md", "utf8");

/** Reads the markdown table that starts with "| Module |" after the given heading. */
function readTable(heading: string) {
  const start = md.indexOf(heading);
  const lines = md.slice(start).split("\n");
  const first = lines.findIndex((l) => l.startsWith("| Module |"));
  const rows: string[][] = [];
  for (const line of lines.slice(first)) {
    if (!line.startsWith("|")) break;
    rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
  }
  const [header, , ...body] = rows;
  return { roles: header.slice(1), body };
}

const MARK: Record<string, AccessLevel> = { Full: "full", View: "view", Own: "own", "-": "none" };

function check(heading: string, roles: typeof READY_ROLES) {
  const table = readTable(heading);
  expect(table.roles).toEqual(roles.map((r) => r.name));
  expect(table.body).toHaveLength(MODULES.length);
  table.body.forEach((row, i) => {
    const mod = MODULES[i];
    expect(row[0].replace(/\s*\*\(optional\)\*/, "")).toBe(`${mod.number}. ${mod.name}`);
    roles.forEach((role, j) => {
      expect({ role: role.name, module: mod.name, level: role.permissions[mod.key] }).toEqual({
        role: role.name,
        module: mod.name,
        level: MARK[row[j + 1]],
      });
    });
  });
}

describe("roles match docs/blueprint/05-roles.md", () => {
  it("has the ten ready roles, exactly as in the blueprint", () => check("## The ten ready roles", READY_ROLES));
  it("has the ten role templates, exactly as in the blueprint", () => check("## Role templates the school can switch on", ROLE_TEMPLATES));
  it("names the modules exactly as the blueprint does", () => {
    const names = md.match(/^\| \d+\. [^|]+\|/gm)!.slice(0, 20).map((c) => c.replace(/^\| \d+\. /, "").replace(/\s*\*\(optional\)\*/, "").replace(/\s*\|$/, "").trim());
    expect(names).toEqual(MODULES.map((m) => m.name));
  });
  it("asks Principal, Accountant and School Admin for two-step login", () => {
    expect(READY_ROLES.filter((r) => r.requiresTwoStep).map((r) => r.key).sort()).toEqual(["accountant", "principal", "school-admin"]);
  });
});

const byKey = (key: string) => [...READY_ROLES, ...ROLE_TEMPLATES].find((r) => r.key === key)!.permissions;

describe("what each role may do", () => {
  it("lets an accountant collect fees but not open Settings", () => {
    const p = combineRoles([byKey("accountant")]);
    expect(can(p, "fee-management", "create")).toBe(true);
    expect(can(p, "settings", "view")).toBe(false);
  });

  it("lets View see and export but never change", () => {
    const p = combineRoles([byKey("accountant")]);
    expect(can(p, "student-management", "view")).toBe(true);
    expect(can(p, "student-management", "export")).toBe(true);
    for (const action of ["create", "edit", "archive", "approve"] as const) {
      expect(can(p, "student-management", action)).toBe(false);
    }
  });

  it("limits a teacher to their own classes", () => {
    const p = combineRoles([byKey("teacher")]);
    expect(p["attendance-management"]).toEqual({ see: "own", change: "own" });
    expect(can(p, "fee-management", "view")).toBe(false);
  });

  it("gives a person with two roles the wider reach of each", () => {
    const p = combineRoles([byKey("teacher"), byKey("accountant")]);
    expect(p["fee-management"].change).toBe("all");
    expect(p["attendance-management"].see).toBe("own");
    expect(p["student-management"]).toEqual({ see: "all", change: "own" });
  });

  it("refuses with a plain-words reason", () => {
    const p = combineRoles([byKey("librarian")]);
    expect(() => requirePermission(p, "fee-management", "create")).toThrow(PermissionDeniedError);
    expect(() => requirePermission(p, "fee-management", "create")).toThrow(/Fee Management/);
  });
});

describe("the menu", () => {
  it("shows only modules the person's roles allow", () => {
    const menu = menuModules(combineRoles([byKey("librarian")]), new Set(["library-management"]));
    expect(menu.map((m) => m.name)).toEqual([
      "Dashboard", "Student Management", "Staff & HR Management", "Salary Management", "Library Management", "Events & Calendar",
    ]);
  });

  it("hides optional modules until the school switches them on", () => {
    const p = combineRoles([byKey("principal")]);
    expect(menuModules(p, new Set()).map((m) => m.key)).not.toContain("transport-management");
    expect(menuModules(p, new Set()).length).toBe(16);
    expect(menuModules(p, new Set(["transport-management"])).map((m) => m.key)).toContain("transport-management");
  });
});
