// Security review 2026-11-15 (finding: "Import files are not bound to campus or uploader"). A
// file being brought in belongs to the campus of the person who uploaded it: someone kept to one
// campus lists, opens, downloads the problem rows of, fixes, imports and removes only the files
// uploaded by people of their campus, and the rows an import left out likewise; another
// campus's file is "not found". Someone who works for the whole school sees every file.
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
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));

import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { addUpload, fileCampusWhere, getFile, workOn, MoveInProblem } from "@/lib/move-in/service";
import { placeErrorsResponse, placeProblemsResponse } from "@/lib/imports/place-routes";
import { PLACES } from "@/lib/imports/places";
import { studentSchool } from "../students/fixtures";
import { makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof studentSchool>>;
let north: string;
let northAdmin: { id: string };
let wholeFile: string;
let northFile: string;
const ctxOf = (userId: string): SchoolContext => ({ schoolId: s.school.id, userId });

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, s.school.id);
  return { ...access!, ctx: ctxOf(userId), user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

async function upload(userId: string, name: string) {
  const ctx = ctxOf(userId);
  const perms = (await accessIn(userId, s.school.id))!.permissions;
  const csv = "Admission No,First Name,Last Name,Class,Section,Date of Birth,Gender,Father Name,Father Mobile\nC-1,Arjun,Rao,Class 5,A,14-03-2016,Male,Srinivas Rao,9876511111\n";
  return withSchool(ctx, async (tx) => {
    const saved = await saveFile(tx, ctx, { file: new File([csv], name, { type: "text/csv" }), purpose: "move-in", allowed: SHEET_TYPES });
    return (await addUpload(tx, ctx, perms, { fileId: saved.id, fileName: name, kind: "students" }))[0];
  });
}

beforeAll(async () => {
  s = await studentSchool();
  north = await withSchool(ctxOf(s.admin.id), async (tx) => (await tx.campus.create({ data: { schoolId: s.school.id, name: "North Campus" } })).id);
  northAdmin = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["school-admin"] }], name: "North Admin" });
  await withSchool({ schoolId: s.school.id, userId: null }, (tx) => tx.schoolAccess.updateMany({ where: { userLoginId: northAdmin.id }, data: { scope: "CAMPUS", campusId: north } }));
  wholeFile = await upload(s.admin.id, "whole-school.csv");
  northFile = await upload(northAdmin.id, "north.csv");
}, 180_000);

describe("a file being brought in, for someone kept to one campus", () => {
  it("is found only when someone of their campus uploaded it", async () => {
    const nctx = ctxOf(northAdmin.id);
    await withSchool(nctx, async (tx) => {
      expect(await getFile(tx, wholeFile, nctx)).toBeNull();
      expect((await getFile(tx, northFile, nctx))?.id).toBe(northFile);
      await expect(workOn(tx, nctx, wholeFile, { check: false })).rejects.toBeInstanceOf(MoveInProblem);
      const listed = await tx.moveInFile.findMany({ where: { archivedAt: null, ...(await fileCampusWhere(tx, nctx)) }, select: { id: true } });
      expect(listed.map((f) => f.id)).toEqual([northFile]);
    });
  }, 60_000);

  it("refuses its problem rows download and its Remove", async () => {
    who.current = await currentFor(northAdmin.id);
    const r = await placeProblemsResponse(PLACES.students, wholeFile);
    expect(r.status).toBe(404);
    const { removeAction } = await import("@/app/(school)/_imports/file-actions");
    expect(await removeAction("students", wholeFile)).toMatch(/not found/);
    expect(await withSchool(ctxOf(s.admin.id), (tx) => getFile(tx, wholeFile))).not.toBeNull();
  }, 60_000);

  it("refuses the rows a whole-school person's import left out", async () => {
    const batch = await withSchool(ctxOf(s.admin.id), (tx) => tx.importBatch.create({ data: { schoolId: s.school.id, kind: "students", fileName: "whole.csv", importedById: s.admin.id, errorReport: [{ line: 2, row: { firstName: "Arjun" }, problems: ["Class is needed."] }] } }));
    who.current = await currentFor(northAdmin.id);
    expect((await placeErrorsResponse(PLACES.students, batch.id)).status).toBe(404);
    who.current = await currentFor(s.admin.id);
    expect((await placeErrorsResponse(PLACES.students, batch.id)).status).toBe(200);
  }, 60_000);

  it("leaves someone who works for the whole school every file", async () => {
    const actx = ctxOf(s.admin.id);
    await withSchool(actx, async (tx) => {
      expect((await getFile(tx, northFile, actx))?.id).toBe(northFile);
      expect((await getFile(tx, wholeFile, actx))?.id).toBe(wholeFile);
    });
    who.current = await currentFor(s.admin.id);
    expect((await placeProblemsResponse(PLACES.students, northFile)).status).toBe(200);
  }, 60_000);
});
