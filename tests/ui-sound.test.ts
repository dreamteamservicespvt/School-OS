// Owner 14 Nov: "there are no interesting sound effects". Each screen message gets the sound that fits it.
import { describe, expect, it } from "vitest";
import { soundFor } from "@/lib/ui-sound";

describe("which sound a message plays", () => {
  it("money, sent, saved, problem and info", () => {
    expect(soundFor("success", "₹12,000 collected. Receipt C-CHE-001/2026-27/00009.")).toBe("money");
    expect(soundFor("success", "Homework sent to 1 A (16 students).")).toBe("sent");
    expect(soundFor("success", "Employment details saved.")).toBe("saved");
    expect(soundFor("success", "Enquiry added for Ravi Teja.")).toBe("saved");
    expect(soundFor("danger", "Payment could not be saved.")).toBe("problem");
    expect(soundFor("info", "Nothing changed.")).toBe("info");
  });
});
