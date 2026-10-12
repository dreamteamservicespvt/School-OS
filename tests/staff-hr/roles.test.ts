// Role-specific Staff & HR (05-roles): a teacher ("own" reach) opens only their own
// record and leave. The server refuses them HR changes, ID card printing and the
// pages that change staff records; they keep their photo and emergency contacts.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { accessIn } from "@/lib/auth/access";
import { withSchool } from "@/lib/db";
import { makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
type Signed = { ctx: { schoolId: string; userId: string }; permissions: unknown; roles: unknown };
let signedIn: Signed | null = null;

const asCurrent = () => {
  if (!signedIn) throw new Error("No one is signed in");
  return { ...signedIn, school: { id: signedIn.ctx.schoolId, timeZone: "Asia/Kolkata", name: "HR Test School" }, user: { id: signedIn.ctx.userId, displayName: "Test person" } };
};

vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  return { ...real, requireAction: async () => ({ current: asCurrent() }), requirePage: async () => asCurrent() };
});
vi.mock("next/navigation", async (orig) => {
  const real = await orig<typeof import("next/navigation")>();
  return { ...real, redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT FOUND"); } };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/flash", () => ({ flash: async () => {} }));

async function signIn(userId: string) {
  const access = await accessIn(userId, f.school.id);
  signedIn = { ctx: { schoolId: f.school.id, userId }, permissions: access!.permissions, roles: access!.roles };
}

const blankPersonal = { dateOfBirth: "", bloodGroup: "", address: "", permanentAddress: "", qualification: "", experienceYears: "" };
const form = (fields: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

beforeAll(async () => { f = await makeHrSchool(); });

describe("own reach on their own staff record", () => {
  it("cannot change the HR record (personal details) or use the HR photo action, even on their own record", async () => {
    const { savePersonal, uploadPhoto } = await import("@/app/(school)/staff-hr-management/[staffId]/actions");
    await signIn(f.teacherLogin.id);
    const personal = await savePersonal(null, form({ ...blankPersonal, staffId: f.teacher.id, fullName: "Ravi Teja Changed", gender: "Male" }));
    expect(personal?.ok).toBe(false);
    const photo = await uploadPhoto(null, form({ staffId: f.teacher.id }));
    expect(photo?.ok).toBe(false);
    expect(photo?.message).toMatch(/HR|Principal|School Admin/);
    const after = await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.staff.findUniqueOrThrow({ where: { id: f.teacher.id } }));
    expect(after.fullName).toBe("Ravi Teja");
  });

  it("may use the photo-only action on their own record, never on someone else's", async () => {
    const { uploadOwnPhoto } = await import("@/app/(school)/staff-hr-management/[staffId]/actions");
    await signIn(f.teacherLogin.id);
    const other = await uploadOwnPhoto(null, form({ staffId: f.head.id }));
    expect(other?.ok).toBe(false);
    expect(other?.errors?.photo).toBeUndefined();
    // On their own record it gets as far as checking the photo.
    const own = await uploadOwnPhoto(null, form({ staffId: f.teacher.id }));
    expect(own?.ok).toBe(false);
    expect(own?.errors?.photo).toBe("Choose a photo.");
  });

  it("keeps their own emergency contacts editable", async () => {
    const { saveEmergency } = await import("@/app/(school)/staff-hr-management/[staffId]/actions");
    await signIn(f.teacherLogin.id);
    const r = await saveEmergency(null, form({ staffId: f.teacher.id, name0: "Lavanya Teja", relation0: "Wife", phone0: "9818304411" }));
    expect(r?.ok).toBe(true);
    const other = await saveEmergency(null, form({ staffId: f.head.id, name0: "Someone", relation0: "Friend", phone0: "9818304412" }));
    expect(other?.ok).toBe(false);
  });

  it("is refused ID card printing on the server, for their own card too", async () => {
    const { GET } = await import("@/app/(school)/staff-hr-management/id-cards/route");
    await signIn(f.teacherLogin.id);
    const res = await GET(new Request(`http://localhost/staff-hr-management/id-cards?staff=${f.teacher.id}`));
    expect(res.status).toBe(403);
  });

  it("is sent to No access from the pages that change staff records", async () => {
    const { hrPage, staffPage } = await import("@/lib/staff/page");
    await signIn(f.teacherLogin.id);
    await expect(hrPage("create")).rejects.toThrow("REDIRECT /no-access?m=staff-hr-management");
    await expect(hrPage("edit")).rejects.toThrow("REDIRECT /no-access?m=staff-hr-management");
    await expect(hrPage("view")).rejects.toThrow("REDIRECT /no-access?m=staff-hr-management");
    const own = await staffPage();
    expect(own.viewer.see).toBe("own");
    expect(own.viewer.staffId).toBe(f.teacher.id);
  });
});

describe("HR", () => {
  it("the School Admin may change the HR record and passes the page check", async () => {
    const { savePersonal } = await import("@/app/(school)/staff-hr-management/[staffId]/actions");
    const { hrPage } = await import("@/lib/staff/page");
    await signIn(f.admin.id);
    const p = await hrPage("edit");
    expect(p.viewer.change).toBe("all");
    const r = await savePersonal(null, form({ ...blankPersonal, staffId: f.scienceTeacher.id, fullName: "Prakash Kulkarni", gender: "Male", qualification: "M.Sc." }));
    expect(r?.ok, r?.message).toBe(true);
  });
});
