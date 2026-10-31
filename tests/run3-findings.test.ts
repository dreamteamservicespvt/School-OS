// Security audit run-3 (~/security-audit-skill/School-OS/run-3), checked here
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
import { narrowToOwn } from "@/lib/permissions";
import { makeSchool, makeUser } from "./helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
let users: { admin: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  school = await makeSchool("Run-3 Findings School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = { admin: (await make(["school-admin"], "School Admin")).id };
  ctx = { schoolId: school.id, userId: users.admin };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 240_000);

describe("Settings, Imports: the rows an import left out keep the kind's own module rule (run-3, medium)", () => {
  // The rows hold the file's own cells, Aadhaar numbers among them. A Settings
  // role under the scope "Own records only" reads Settings (Own) and adds only
  // its own records in Student Management and Staff & HR. Importing students
  // is Student Management full, staff is Staff & HR full (05-roles.md), as on
  // their own import pages and /student-management/import/<id>/errors (L6).
  const AADHAAR = "999988887777";
  const batches: Record<string, string> = {};
  let ownOnly: Current;
  beforeAll(async () => {
    for (const kind of ["students", "students-update", "staff", "consent-paper-forms"]) {
      batches[kind] = (await run((tx) => tx.importBatch.create({ data: { schoolId: school.id, kind, fileName: `${kind}.csv`, skipped: 1, importedById: users.admin, errorReport: [{ line: 2, row: { fullName: "Ravi Kumar", aadhaar: AADHAAR }, problems: ["Class is missing."] }] } }))).id;
    }
    ownOnly = { ...cur.admin, permissions: narrowToOwn(cur.admin.permissions) };
  });
  const download = async (as: Current, kind: string) => {
    who.current = as;
    const id = batches[kind];
    const { GET } = await import("@/app/(school)/settings/data-security/imports/[id]/errors/route");
    const res = await GET(new Request(`http://school.test/settings/data-security/imports/${id}/errors`), { params: Promise.resolve({ id }) });
    return { status: res.status, text: await res.text() };
  };

  it.each(["students", "students-update", "staff", "consent-paper-forms"])("downloads %s rows for the School Admin", async (kind) => {
    const r = await download(cur.admin, kind);
    expect(r.status).toBe(200);
    // Student and staff files have an Aadhaar column; the other kinds' columns do not.
    if (kind === "students" || kind === "staff") expect(r.text).toContain(AADHAAR);
  }, 120_000);

  it.each(["students", "students-update", "staff", "consent-paper-forms"])("refuses %s rows to Own reach, without the rows", async (kind) => {
    const r = await download(ownOnly, kind);
    expect(r.status).toBe(403);
    expect(r.text).not.toContain(AADHAAR);
  }, 120_000);

  it("refuses Undo of a students import to full Settings with Own reach in Student Management", async () => {
    const id = (await run((tx) => tx.importBatch.create({ data: { schoolId: school.id, kind: "students", fileName: "undo.csv", importedById: users.admin } }))).id;
    who.current = { ...cur.admin, permissions: { ...cur.admin.permissions, "student-management": { see: "own", change: "own" } } };
    const { undoImportAction } = await import("@/app/(school)/settings/data-security/actions");
    expect(await undoImportAction(id)).toBe("This import cannot be undone by your role. Ask your School Admin.");
    expect((await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id } }))).undoneAt).toBeNull();
  }, 120_000);
});
