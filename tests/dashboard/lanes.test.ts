// Dashboard speed (QA PLATFORM-13): the widgets load in a few transactions
// at the same time. The page must come out exactly as when everything loads
// in one transaction, one widget after another; a shared read is made once
// per transaction and never used in another; and a failing widget, wherever
// it sits, leaves every other widget on the page.
import { beforeAll, describe, expect, it } from "vitest";
import { buildHome, bundlesOf, laneCount, poolSize } from "@/lib/dashboard/compose";
import { WIDGETS } from "@/lib/dashboard/registry";
import type { Widget } from "@/lib/dashboard/types";
import type { Current } from "@/lib/current";
import { academicSchool } from "../academic/fixture";
import { makeUser } from "../helpers";

// Monday 12 October 2026, 11:00 AM in India: school is on.
const NOW = new Date("2026-10-12T05:30:00Z");

let f: Awaited<ReturnType<typeof academicSchool>>;
let principal: Current, teacher: Current, librarian: Current;

beforeAll(async () => {
  f = await academicSchool();
  const lib = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["librarian"] }] });
  [principal, teacher, librarian] = await Promise.all([f.currentFor(f.principal.id), f.currentFor(f.teacherUser.id), f.currentFor(lib.id)]);
}, 120_000);

const byId = (id: string) => {
  const w = WIDGETS.find((x) => x.id === id);
  if (!w) throw new Error(`no widget ${id}`);
  return w;
};

describe("how the work is shared out", () => {
  it("never opens more transactions than the connection pool holds", () => {
    expect(poolSize("postgresql://u:p@db.example/school?connection_limit=3&sslmode=require")).toBe(3);
    expect(poolSize("postgresql://u:p@localhost/school", 8)).toBe(9);
    expect(laneCount(20, 3)).toBe(3);
    expect(laneCount(20, 1)).toBe(1);
    expect(laneCount(2, 17)).toBe(2);
    expect(laneCount(20, 17)).toBe(6);
  });

  it("keeps a module's widgets together, fees with finance, in registry order", () => {
    const jobs = WIDGETS.map((w, i) => ({ w, i }));
    const bundles = bundlesOf(jobs);
    expect(bundles.flat()).toHaveLength(WIDGETS.length);
    const fee = bundles.find((b) => b.some((j) => j.w.module === "fee-management"))!;
    expect(fee.some((j) => j.w.module === "finance-management")).toBe(true);
    for (const b of bundles) expect(b.map((j) => j.i)).toEqual([...b.map((j) => j.i)].sort((x, y) => x - y));
    for (let i = 1; i < bundles.length; i++) expect(bundles[i].length).toBeLessThanOrEqual(bundles[i - 1].length);
  });
});

describe("the page is the same however many transactions load it", () => {
  it("for the Principal, a teacher and a librarian", async () => {
    for (const who of [principal, teacher, librarian]) {
      const one = await buildHome(who, { now: NOW, lanes: 1 });
      const many = await buildHome(who, { now: NOW, lanes: 6 });
      const usual = await buildHome(who, { now: NOW });
      expect(many).toEqual(one);
      expect(usual).toEqual(one);
      expect(one.failed).toEqual([]);
    }
  });
});

describe("a shared read", () => {
  it("is made once in a transaction and never used in another", async () => {
    // Two widgets of one module share a bundle; a third, of another module, has its own.
    const reads: number[] = [];
    const seen: Record<string, { pid: number; memo: number }> = {};
    const probe = (id: string, module: Widget["module"]): Widget<"band"> => ({
      id, module, kind: "band", homes: ["leader"],
      async load(c) {
        const [{ pid }] = await c.tx.$queryRawUnsafe<{ pid: number }[]>("SELECT pg_backend_pid() AS pid");
        const memo = await c.memo("probe", async () => {
          const [{ pid: p }] = await c.tx.$queryRawUnsafe<{ pid: number }[]>("SELECT pg_backend_pid() AS pid");
          reads.push(p);
          return p;
        });
        seen[id] = { pid, memo };
        return null;
      },
    });
    const widgets = [probe("probe.a1", "staff-hr-management"), probe("probe.a2", "staff-hr-management"), probe("probe.b", "student-management")];
    await buildHome(principal, { now: NOW, widgets, lanes: 3 });
    // Each widget got the read made on its own connection (its own transaction).
    for (const id of Object.keys(seen)) expect(seen[id].memo, id).toBe(seen[id].pid);
    expect(seen["probe.a1"].pid).toBe(seen["probe.a2"].pid);
    // Once for the shared bundle and once for the other.
    expect(reads).toHaveLength(2);
  });
});

describe("a widget that fails", () => {
  const broken = (id: string, module: Widget["module"], how: "query" | "code"): Widget<"band"> => ({
    id, module, kind: "band", homes: ["leader"],
    load: async (c) => {
      if (how === "query") await c.tx.$queryRawUnsafe("SELECT * FROM no_such_table");
      throw new Error("broken widget");
    },
  });

  it("leaves every other widget on the page, wherever it sits in its transaction", async () => {
    const usual = await buildHome(principal, { now: NOW, lanes: 1 });
    const staff = WIDGETS.filter((w) => w.module === "staff-hr-management");
    expect(staff.length).toBeGreaterThan(1);
    // Failing first, in the middle of and last in a bundle, with a failed query or a plain error.
    const list = [
      broken("test.first", "staff-hr-management", "query"),
      ...WIDGETS.slice(0, WIDGETS.indexOf(staff[1])),
      broken("test.middle", "staff-hr-management", "code"),
      ...WIDGETS.slice(WIDGETS.indexOf(staff[1])),
      broken("test.last", "student-management", "query"),
    ];
    for (const lanes of [1, 3, 6]) {
      const home = await buildHome(principal, { now: NOW, widgets: list, lanes });
      expect(home.failed, `lanes ${lanes}`).toEqual(["test.first", "test.middle", "test.last"]);
      expect({ ...home, failed: [] }, `lanes ${lanes}`).toEqual(usual);
    }
  });

  it("is named once, and widgets after it in its own bundle still load", async () => {
    const real = [byId("staff.head-count"), byId("staff.away-today")];
    const home = await buildHome(principal, { now: NOW, widgets: [broken("test.broken", "staff-hr-management", "query"), ...real], lanes: 1 });
    expect(home.failed).toEqual(["test.broken"]);
    expect(home.band.map((b) => b.id)).toContain("staff.head-count");
  });
});
