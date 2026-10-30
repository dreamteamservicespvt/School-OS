// The application form shows every problem at once, next to its field (QA PEOPLE-07).
import { describe, expect, it } from "vitest";
import { counterConsent, readApplicationForm } from "@/lib/admission/application-form";
import { AdmissionProblem, problemState } from "@/lib/admission/act";

const form = (v: Record<string, string>) => { const fd = new FormData(); for (const [k, x] of Object.entries(v)) fd.set(k, x); return fd; };

describe("the application form", () => {
  it("lists every problem of the form at once", () => {
    const fd = form({ firstName: "", gender: "", phone: "12", address: "", email: "not-an-email" });
    let caught: unknown;
    try { readApplicationForm(fd, { restricted: false }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(AdmissionProblem);
    const state = problemState(caught, fd);
    expect(Object.keys(state.errors ?? {}).sort()).toEqual(["address", "classId", "dateOfBirth", "email", "fatherName", "firstName", "gender", "phone", "yearId"]);
    expect(state.message).toBe("Please fix 9 things before saving.");
  });

  it("adds the caller's own checks to the same list", () => {
    const fd = form({ classId: "8a3f8c2e-1d4b-4c55-9a77-0d3f1c6b2a10", yearId: "8a3f8c2e-1d4b-4c55-9a77-0d3f1c6b2a11", firstName: "Ravi", dateOfBirth: "2016-03-14", gender: "Male", fatherName: "Srinivas", phone: "9876543210", address: "Chekkapalli" });
    expect(() => readApplicationForm(fd, { restricted: false })).not.toThrow();
    expect(() => readApplicationForm(fd, { restricted: false, extra: (c) => c.add("consent", "Please agree.") })).toThrow("Please agree.");
  });

  // Self-test bug 4 (2026-10-30): "Please fix 3 things" left out the consent, which
  // came up only after the 3 were fixed.
  it("lists the missing consent of a new counter application with the other problems", () => {
    const fd = form({ firstName: "", gender: "", phone: "12", address: "", email: "not-an-email" });
    let caught: unknown;
    try { readApplicationForm(fd, { restricted: false, extra: counterConsent(fd) }); } catch (e) { caught = e; }
    const state = problemState(caught, fd);
    expect(state.errors?.code).toMatch(/data consent/);
    expect(state.message).toBe("Please fix 10 things before saving.");
    fd.set("consent_data-processing", "on");
    try { readApplicationForm(fd, { restricted: false, extra: counterConsent(fd) }); } catch (e) { caught = e; }
    expect(problemState(caught, fd).errors?.code).toBeUndefined();
  });
});
