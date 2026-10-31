// Security audit run-2, leads that needed checking
// (~/security-audit-skill/School-OS/run-2/NEEDS-VALIDATION.md), checked here
// on a dummy school: what a person reaches by asking a page or file address
// directly, not by following the screens' own links.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: async () => who.current as Current,
    requireCurrent,
    requirePage: async () => who.current as Current,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: "school.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { STUDENT_IMPORT } from "@/lib/students/import";
import { makeSchool, makeUser } from "./helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
let users: { admin: string; teacher: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  school = await makeSchool("Run-2 Leads School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = { admin: (await make(["school-admin"], "School Admin")).id, teacher: (await make(["teacher"], "Class Teacher")).id };
  ctx = { schoolId: school.id, userId: users.admin };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 240_000);

describe("L6: the rows a student import skipped are for those who import students", () => {
  // The skipped rows hold the file's own cells, Aadhaar numbers among them.
  // Importing students is Student Management full (05-roles.md); a Teacher's
  // "Own" change reach lets them add their own class's work, not import.
  let batchId = "";
  beforeAll(async () => {
    batchId = (await run((tx) => tx.importBatch.create({ data: { schoolId: school.id, kind: STUDENT_IMPORT, fileName: "students.csv", skipped: 1, importedById: users.admin, errorReport: [{ line: 2, row: { fullName: "Ravi Kumar", aadhaar: "999988887777" }, problems: ["Class is missing."] }] } }))).id;
  });
  const download = async (as: Current) => {
    who.current = as;
    const { GET } = await import("@/app/(school)/student-management/import/[batchId]/errors/route");
    const res = await GET(new Request(`http://school.test/student-management/import/${batchId}/errors`), { params: Promise.resolve({ batchId }) });
    return { status: res.status, text: await res.text() };
  };

  it("downloads for the School Admin", async () => {
    const r = await download(cur.admin);
    expect(r.status).toBe(200);
    expect(r.text).toContain("999988887777");
  }, 120_000);

  it("is refused to a Teacher, without the rows", async () => {
    const r = await download(cur.teacher);
    expect(r.status).toBe(403);
    expect(r.text).not.toContain("999988887777");
  });
});
