// A small school for Inventory Management tests: the Admission test school
// (this year, a Principal, a Vice Principal, a Receptionist and a teacher)
// plus a Store Keeper, an Accountant and a School Admin, with Inventory
// Management switched on and the default settings, categories and stores.
// Class 1 has one section this year with four students; the teacher and the
// store keeper are staff members; there are two rooms.
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { invCan, invViewer } from "@/lib/inventory/access";
import { inventorySettings } from "@/lib/inventory/settings";
import { addItem, type ItemInput } from "@/lib/inventory/items";
import { admissionSchool, day } from "../admission/fixtures";
import { makeUser } from "../helpers";

export { day };
export const TODAY = day("2026-10-12");
export const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const R = (rupees: number) => BigInt(Math.round(rupees * 100));

export async function makeInventorySchool(name = "Inventory Test School") {
  const a = await admissionSchool(name);
  const sid = a.school.id;
  const sys = { schoolId: sid, userId: null };
  await withSchool(sys, (tx) => tx.role.updateMany({ where: { key: { in: ["store-keeper", "accountant"] } }, data: { isEnabled: true } }));
  const store = await makeUser({ schools: [{ id: sid, roleKeys: ["store-keeper"] }], name: "Store Keeper" });
  const accountant = await makeUser({ schools: [{ id: sid, roleKeys: ["accountant"] }], name: "Accountant" });
  const admin = await makeUser({ schools: [{ id: sid, roleKeys: ["school-admin"] }], name: "Admin Person" });

  const ids = await withSchool(sys, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: sid, moduleKey: "inventory-management" } }, create: { schoolId: sid, moduleKey: "inventory-management", isOn: true }, update: { isOn: true } });
    const campusId = a.school.campus.id;
    const section = await tx.section.create({ data: { schoolId: sid, classId: a.c1, academicYearId: a.yearId, name: "A" } });
    const students = [];
    for (const [i, first] of ["Meena", "Ravi", "Sita", "Arjun"].entries()) {
      const st = await tx.student.create({ data: { schoolId: sid, campusId, admissionNo: `INV-10${i + 1}`, firstName: first, lastName: "Reddy", fullName: `${first} Reddy`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: a.yearId, classId: a.c1, sectionId: section.id, rollNo: i + 1 } });
      students.push(st);
    }
    const staff = (u: { id: string }, code: string, first: string, phone: string, designation: string) =>
      tx.staff.create({ data: { schoolId: sid, campusId, staffCode: code, firstName: first, lastName: "Rao", fullName: `${first} Rao`, phone, designation, joiningDate: day("2020-06-01"), userLoginId: u.id } });
    const teacherStaff = await staff(a.teacher, "S-31", "Kiran", "9876500131", "Teacher");
    const storeStaff = await staff(store, "S-32", "Mahesh", "9876500132", "Store Keeper");
    const room1 = await tx.room.create({ data: { schoolId: sid, campusId, name: "Room 12", kind: "classroom", capacity: 40 } });
    const lab = await tx.room.create({ data: { schoolId: sid, campusId, name: "Science lab", kind: "lab", capacity: 30 } });
    const dept = await tx.department.create({ data: { schoolId: sid, name: "Science" } });
    const [meena, ravi, sita, arjun] = students;
    return { section, meena, ravi, sita, arjun, teacherStaff, storeStaff, room1, lab, dept };
  });
  const storeCtx = { schoolId: sid, userId: store.id };
  const base = await withSchool(storeCtx, async (tx) => {
    await inventorySettings(tx, storeCtx);
    const cats = await tx.itemCategory.findMany();
    const stores = await tx.storeLocation.findMany();
    return {
      stationery: cats.find((c) => c.name === "Stationery")!.id, uniforms: cats.find((c) => c.name === "Uniforms")!.id, labCat: cats.find((c) => c.name === "Lab")!.id, books: cats.find((c) => c.name === "Books")!.id,
      main: stores.find((s) => s.isMain)!.id, labStore: stores.find((s) => s.name === "Lab store")!.id,
    };
  });
  return { ...a, store, accountant, admin, ...ids, ...base };
}

export type InvFixture = Awaited<ReturnType<typeof makeInventorySchool>>;

export const as = (f: InvFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });
export const keeper = (f: InvFixture) => as(f, f.store.id);

/** What a person may do in Inventory Management, worked out as the pages and actions do. */
export async function invFor(f: InvFixture, userId: string) {
  const view = await accessIn(userId, f.school.id);
  if (!view) throw new Error("no access");
  const v = invViewer({ ...view, user: { id: userId } });
  return { v, can: invCan(v), view };
}

/** Adds an item with opening stock in the main store, as the store keeper. */
export async function addTestItem(f: InvFixture, name: string, qty: number, over: Partial<ItemInput> & { store?: string } = {}) {
  const ctx = keeper(f);
  const { store, ...rest } = over;
  return withSchool(ctx, (tx) => addItem(tx, ctx, { code: null, name, categoryId: f.stationery, unit: "piece", size: null, reorderLevel: null, pricePaise: R(50), tracksExpiry: false, note: null, ...rest },
    qty ? [{ locationId: store ?? f.main, qty, ...(rest.tracksExpiry ? { batchNo: "B1", expiresOn: plus(TODAY, 200) } : {}) }] : [], TODAY));
}
