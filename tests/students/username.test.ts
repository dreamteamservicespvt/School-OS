// QA (Chaitanya EM School audit), ACADEMICS-19: a student login read
// "cems-cems-2026-0180" because the admission number already starts with the code.
import { describe, expect, it } from "vitest";
import { usernameFor } from "@/lib/students/logins";

describe("student usernames", () => {
  it("names the school code once", () => {
    expect(usernameFor("CEMS", "CEMS/2026/0180")).toBe("cems-2026-0180");
    expect(usernameFor("CEMS", "2026/0180")).toBe("cems-2026-0180");
    expect(usernameFor("SPS", "SPSX/1")).toBe("sps-spsx-1");
  });
});
