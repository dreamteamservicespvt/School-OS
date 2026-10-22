// Staff ID cards and letters use the school's Document Designs (09 §2
// Documents & ID Cards, 20 §2; gap G33 c): the title, layout, fields and
// text the school chose in Settings, Document Designs, filled from the staff
// record, with every value escaped.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { currentDesign, saveDesign } from "@/lib/documents/designs";
import { experienceLetter, offerLetter, staffIdCards } from "@/lib/staff/print";
import { d, makeHrSchool } from "./fixture";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });
const TZ = "Asia/Kolkata";

beforeAll(async () => { f = await makeHrSchool(); }, 120_000);

describe("staff documents in the school's own designs (G33 c)", () => {
  it("ID cards follow the Staff ID card design: its title and the fields chosen", async () => {
    const html = await withSchool(as(f.admin.id), async (tx) => {
      const design = await currentDesign(tx, "staff-id-card");
      await saveDesign(tx, as(f.admin.id), "staff-id-card", "modern", { ...design.options, title: "Faculty Pass 2026", fields: ["staff_code", "designation", "staff_phone"] });
      const staff = await tx.staff.findMany({ where: { id: { in: [f.teacher.id, f.head.id] } }, include: { department: { select: { name: true } } }, orderBy: { fullName: "asc" } });
      return (await staffIdCards(tx, as(f.admin.id), staff, TZ)).html;
    });
    expect(html).toContain("Faculty Pass 2026");
    expect(html).toContain("Ravi Teja");
    expect(html).toContain("Divya Menon");
    expect(html).toContain(f.teacher.staffCode);
    expect(html).toContain("9876500001");
    // Department was left out of the chosen fields; the old fixed card always showed it.
    expect(html).not.toContain("Mathematics");
    expect(html).not.toContain("Staff Identity Card");
  });

  it("the experience letter uses the school's text, with the number and the first issue date", async () => {
    const html = await withSchool(as(f.admin.id), async (tx) => {
      const design = await currentDesign(tx, "experience-letter");
      await saveDesign(tx, as(f.admin.id), "experience-letter", "classic", { ...design.options, body: "Ref {{letter_no}}, dated {{today}}. {{staff_name}} ({{staff_code}}) served us as {{designation}} from {{joining_date}} to {{leaving_date}}." });
      const staff = await tx.staff.findUniqueOrThrow({ where: { id: f.scienceTeacher.id }, include: { department: true } });
      return (await experienceLetter(tx, as(f.admin.id), { staff, number: "HR/2026/0003", lastDay: d("2026-10-31"), issuedOn: d("2026-11-02"), timeZone: TZ })).html;
    });
    expect(html).toContain(`Ref HR/2026/0003, dated 02-11-2026. Prakash Kulkarni (${f.scienceTeacher.staffCode}) served us as Teacher from 01-06-2020 to 31-10-2026.`);
  });

  it("the offer letter uses the school's Offer letter design and escapes what was typed", async () => {
    const html = await withSchool(as(f.admin.id), (tx) => offerLetter(tx, as(f.admin.id), {
      name: "Asha <b>Varma</b>", offerNo: "OF/2026/0009", designation: "PGT Physics", department: "Science", joiningDate: d("2026-12-01"),
      monthlyPaise: 4_800_000n, respondBy: d("2026-11-20"), issuedOn: d("2026-11-05"), timeZone: TZ,
    }).then((doc) => doc.html));
    expect(html).toContain("Offer Letter");
    expect(html).toContain("Asha &lt;b&gt;Varma&lt;/b&gt;");
    expect(html).toContain("PGT Physics in the Science department");
    expect(html).toContain("₹48,000");
    expect(html).toContain("20-11-2026");
  });
});
