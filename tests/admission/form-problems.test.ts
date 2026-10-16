// QA PEOPLE-07: the application form lists every problem together (pattern P7),
// not one at a time.
import { describe, expect, it } from "vitest";
import { AdmissionProblem } from "@/lib/admission/act";
import { readApplicationForm } from "@/lib/admission/application-form";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("application form problems", () => {
  it("reports gender, class, address and a future birth date at once", () => {
    let caught: unknown;
    try {
      readApplicationForm(form({ firstName: "Ravi", fatherName: "Suresh", phone: "9876543210", dateOfBirth: "2030-01-01" }), { restricted: false });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AdmissionProblem);
    const errors = (caught as AdmissionProblem).errors ?? {};
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(["gender", "classId", "address", "dateOfBirth"]));
    expect((caught as AdmissionProblem).message).toMatch(/things need fixing/);
  });

  it("reads a complete form", () => {
    const input = readApplicationForm(form({
      gender: "Male", fatherName: "Suresh", firstName: "Ravi", phone: "9876543210", dateOfBirth: "2018-06-01", address: "Main Road, Kakinada",
      classId: "00000000-0000-4000-8000-000000000001", yearId: "00000000-0000-4000-8000-000000000002",
    }), { restricted: false });
    expect(input.firstName).toBe("Ravi");
  });
});
