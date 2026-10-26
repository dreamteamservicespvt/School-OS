// The /no-access page says the right thing: switched off, not in the menu at
// all, or (with "Own" or "View" reach) not this page, naming the pages that are.
import { beforeAll, describe, expect, it } from "vitest";
import { noAccessWords } from "@/lib/no-access";
import { reachFor } from "@/lib/permissions";
import { accessIn } from "@/lib/auth/access";
import { makeSchool, makeUser } from "./helpers";

const base = { name: "Admission Management", schoolName: "Sunrise Public School", roles: "Receptionist / Front Office" };

describe("no-access words", () => {
  it("keeps the words for a module switched off", () => {
    const w = noAccessWords({ ...base, off: true, hasModule: true });
    expect(w.kind).toBe("off");
    expect(w.title).toBe("Admission Management is switched off for Sunrise Public School");
    expect(w.body).toBe("The School Admin can switch it on in Settings, Modules On/Off. Nothing is lost while it is off.");
  });

  it("tells a person who may switch modules on to do it, not to ask the School Admin", () => {
    const w = noAccessWords({ ...base, roles: "School Admin", off: true, hasModule: true, turnsOn: true });
    expect(w.body).toBe("Switch it on in Settings, Modules On/Off. Nothing is lost while it is off.");
  });

  it("keeps the words for a module not in the person's menu", () => {
    const w = noAccessWords({ ...base, roles: "Teacher", off: false, hasModule: false });
    expect(w.kind).toBe("not-in-menu");
    expect(w.title).toBe("Admission Management is not in your menu");
    expect(w.body).toBe("As Teacher, you do not have this module. The School Admin can change roles in Settings, Users & Permissions.");
  });

  it("names the pages a person with part of the module can use", () => {
    const w = noAccessWords({ ...base, off: false, hasModule: true, pages: ["Enquiries"] });
    expect(w.kind).toBe("not-this-page");
    expect(w.title).toBe("This page of Admission Management is not part of your role");
    expect(w.body).toMatch(/^You can use: Enquiries\./);
  });

  it("still makes sense when the pages are not listed", () => {
    const w = noAccessWords({ ...base, off: false, hasModule: true });
    expect(w.body).toMatch(/you can use the other pages of Admission Management in your menu/);
  });
});

describe("who gets which words (05-roles.md)", () => {
  let school: Awaited<ReturnType<typeof makeSchool>>;
  beforeAll(async () => { school = await makeSchool("No Access Test School"); });

  it("a Receptionist has Own reach to Admission Management, so they are told which pages they can use; a Teacher has none", async () => {
    const reception = await makeUser({ schools: [{ id: school.id, roleKeys: ["receptionist"] }] });
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const r = await accessIn(reception.id, school.id);
    const t = await accessIn(teacher.id, school.id);
    expect(reachFor(r!.permissions, "admission-management", "view")).toBe("own");
    expect(reachFor(t!.permissions, "admission-management", "view")).toBe("none");
  });
});
