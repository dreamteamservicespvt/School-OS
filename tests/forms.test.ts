// Shared form checks (src/lib/forms.ts). QA PEOPLE-10: an optional box that is
// not on the screen (like "Reason to save anyway", shown only for a possible
// duplicate) must not block the save with "Required".
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalDate, optionalEmail, optionalIndianMobile, optionalText, parseForm, text } from "@/lib/forms";

const schema = z.object({
  fullName: text("Full name", 120),
  duplicateReason: optionalText("Reason", 300),
  otherPhone: optionalIndianMobile("Other phone"),
  email: optionalEmail(),
  leftOn: optionalDate("Left on"),
});

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("optional fields", () => {
  it("read a box missing from the form as empty", () => {
    const r = parseForm(schema, form({ fullName: "Demo Varun Teja" }));
    expect(r).toEqual({ ok: true, data: { fullName: "Demo Varun Teja", duplicateReason: null, otherPhone: null, email: null, leftOn: null } });
  });

  it("still check what is typed", () => {
    const r = parseForm(schema, form({ fullName: "Demo", duplicateReason: "x".repeat(301), otherPhone: "123", email: "nope", leftOn: "16-10-2026" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.state.errors).toEqual({
      duplicateReason: "Reason can be at most 300 characters.",
      otherPhone: "Other phone must have 10 digits.",
      email: "Email does not look right. It should be like name@example.com.",
      leftOn: "Left on is not a real date.",
    });
  });

  it("still need a required box", () => {
    const r = parseForm(schema, form({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.state.errors?.fullName).toBe("Required");
  });
});
