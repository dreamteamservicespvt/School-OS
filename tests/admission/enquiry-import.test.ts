// Import enquiries (02 §2, workflow 15), follow-up B: one enquiry per child.
// A brother or sister with the same phone and the same parent is added and
// linked to the family's enquiry; the same child twice is flagged, not added
// twice; a phone on record under another parent's name waits for a person to
// say same family or different family. Through the server actions with a
// real session, on the one import engine (Switching to School OS, G16): the
// file is checked row by row, the choice is kept with the file, and the ready
// rows are brought in by the import job.
import { beforeAll, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { randomUUID } from "node:crypto";
import { createSession } from "@/lib/auth/sessions";
import { withSchool, type SchoolContext } from "@/lib/db";
import { runDueJobs } from "@/lib/jobs";
import { settleImports, workOn } from "@/lib/move-in/service";
import { chooseRowAction, importAction, uploadAction } from "@/app/(school)/_imports/file-actions";
import { admissionSchool } from "./fixtures";

let t: Awaited<ReturnType<typeof admissionSchool>>;
let sys: SchoolContext;
const run = <T,>(fn: Parameters<typeof withSchool<T>>[1]) => withSchool(sys, fn);
let me: SchoolContext;
const signIn = async (userId: string) => { token = (await createSession(userId, t.school.id, { userAgent: "test" })).token; me = { schoolId: t.school.id, userId }; };

const P1 = "9440011001";
const P2 = "9440011002";
const P3 = "9440011003";

const form = (csv: string) => {
  const fd = new FormData();
  fd.set("place", "enquiries");
  fd.set("kind", "admission-enquiries");
  fd.set("file", new File([csv], "enquiries.csv", { type: "text/csv" }));
  return fd;
};

/** Uploads on Admission Management, Import: the person is sent to the file's own page. */
async function upload(csv: string) {
  try {
    const r = await uploadAction(null, form(csv));
    throw new Error(r?.message ?? "Not uploaded");
  } catch (e) {
    const m = /^REDIRECT \/admission-management\/enquiries\/import\/review\/([0-9a-f-]{36})$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1];
  }
}

const check = (id: string) => withSchool(me, (tx) => workOn(tx, me, id, { check: true }), { timeout: 120_000 });

async function bringIn(id: string) {
  expect(await importAction("enquiries", id)).toBeUndefined();
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: t.school.id })) === 0) break;
  return withSchool(me, async (tx) => {
    await settleImports(tx);
    const f = await tx.moveInFile.findUniqueOrThrow({ where: { id } });
    return tx.importBatch.findUniqueOrThrow({ where: { id: f.batchId! } });
  });
}

beforeAll(async () => {
  t = await admissionSchool("Enquiry Import School");
  sys = { schoolId: t.school.id, userId: null };
  await run(async (tx) => {
    // An open enquiry already in School OS for Meera, from Anil Joshi.
    await tx.enquiry.create({ data: { schoolId: t.school.id, campusId: t.campusId, academicYearId: t.nextYearId, enquiryNo: "ENQ-9001", childName: "Meera", parentName: "Anil Joshi", phone: P2, source: "walk-in", firstSource: "walk-in", status: "new" } });
    // A parent of a student already in school.
    const g = await tx.guardian.create({ data: { schoolId: t.school.id, name: "Sunil Rao", relationship: "Father", phone: P3 } });
    const s = await tx.student.create({ data: { schoolId: t.school.id, campusId: t.campusId, admissionNo: `S-${randomUUID().slice(0, 6)}`, firstName: "Vikram", fullName: "Vikram Rao", status: "ACTIVE" } });
    await tx.studentGuardian.create({ data: { schoolId: t.school.id, studentId: s.id, guardianId: g.id, relationship: "Father", isPrimary: true } });
  });
}, 120_000);

describe("one enquiry per child, linked to the same parent (follow-up B)", () => {
  const csv = [
    "Child's name,Parent's name,Phone,Source",
    `Aarav Sharma,Rohit Sharma,${P1},Walk-in`, // line 2
    `Diya Sharma,Rohit Sharma,${P1},Walk-in`, // line 3: sister, same parent
    `Aarav Sharma,Rohit Sharma,${P1},Walk-in`, // line 4: the same child again
    `Kabir Sharma,Priya Sharma,${P1},Walk-in`, // line 5: same phone, another parent's name
    `Meera Joshi,Anil Joshi,${P2},Walk-in`, // line 6: already an open enquiry
    `Tara Joshi,Anil Joshi,${P2},Walk-in`, // line 7: Meera's sister
    `Asha Rao,Sunil Rao,${P3},Walk-in`, // line 8: a student's sister
  ].join("\n");

  it("refuses the Receptionist (Own), as before", async () => {
    await signIn(t.frontdesk.id);
    expect(await uploadAction(null, form(csv))).toMatchObject({ ok: false, message: expect.stringMatching(/Only the admission team/) });
  });

  it("checks: brothers and sisters are ready, the same child is flagged, another parent's name asks", async () => {
    await signIn(t.counsellor.id);
    const id = await upload(csv);
    const r = (await check(id)).checked!;
    expect(r.ready).toHaveLength(4);
    const bad = Object.fromEntries(r.problems.map((b) => [b.line, b]));
    expect(Object.keys(bad).map(Number).sort()).toEqual([4, 5, 6]);
    expect(bad[4].problems.join(" ")).toMatch(/Row 2 has the same child \(Aarav Sharma\) with this phone/);
    expect(bad[6].problems.join(" ")).toMatch(/Already in School OS: an open enquiry for Meera, from Anil Joshi\. Not added twice\./);
    expect(bad[5].problems.join(" ")).toMatch(/not Priya Sharma\. Say whether this is the same family\./);
    expect(bad[5].choices.map((c) => c.value)).toEqual(["sibling", "other-family"]);
  });

  it("imports one enquiry per child, each brother or sister linked to the family's enquiry", async () => {
    await signIn(t.counsellor.id);
    const id = await upload(csv);
    expect(await chooseRowAction("enquiries", id, 5, "sibling")).toBeUndefined();
    const checked = (await check(id)).checked!;
    expect(checked.ready).toHaveLength(5);
    expect(checked.problems.map((p) => p.line)).toEqual([4, 6]);
    // Only the ready rows go in; the two with problems stay with the file to fix or leave out.
    expect(await bringIn(id)).toMatchObject({ kind: "admission-enquiries", added: 5, skipped: 0, importedById: t.counsellor.id });
    const rows = await run((tx) => tx.enquiry.findMany({ where: { phone: { in: [P1, P2, P3] } }, orderBy: { enquiryNo: "asc" } }));
    const by = (child: string) => rows.find((e) => e.childName === child)!;
    expect(rows.filter((e) => e.childName === "Aarav Sharma")).toHaveLength(1);
    expect(by("Aarav Sharma").siblingOfId).toBeNull();
    expect(by("Diya Sharma").siblingOfId).toBe(by("Aarav Sharma").id);
    expect(by("Kabir Sharma").siblingOfId).toBe(by("Aarav Sharma").id);
    expect(by("Tara Joshi").siblingOfId).toBe(by("Meera").id);
    expect(by("Asha Rao")).toMatchObject({ siblingOfId: null, parentName: "Sunil Rao" });
    expect(rows.some((e) => e.childName === "Meera Joshi")).toBe(false);
  });

  it("a different family with the same phone is its own enquiry, never linked", async () => {
    await signIn(t.counsellor.id);
    const id = await upload(["Child's name,Parent's name,Phone,Source", `Zoya Khan,Imran Khan,${P1},Walk-in`].join("\n"));
    expect((await check(id)).checked!.ready).toHaveLength(0);
    expect(await chooseRowAction("enquiries", id, 2, "other-family")).toBeUndefined();
    expect(await bringIn(id)).toMatchObject({ added: 1 });
    const zoya = await run((tx) => tx.enquiry.findFirstOrThrow({ where: { childName: "Zoya Khan" } }));
    expect(zoya.siblingOfId).toBeNull();
  });
});
