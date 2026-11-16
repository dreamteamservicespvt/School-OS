// The closed row of a Parent Link message keeps the message's own lines (live test 16 Nov: the
// results message read "…Class 1 A 📝 Exam: Unit Test 1 Open your Parent Link…" as one run-on line).
import { describe, expect, it } from "vitest";
import { previewText } from "@/lib/parent-link/messages";

describe("previewText", () => {
  it("keeps each line on its own line and drops the empty ones", () => {
    const text = "Dear Venkatesh, the exam results are ready.\n\n👤 Sri Lakshmi of Class 1 A\n📝 Exam: Unit Test 1\n\nOpen your Parent Link to see the full report card.";
    expect(previewText(text)).toBe("Dear Venkatesh, the exam results are ready.\n👤 Sri Lakshmi of Class 1 A\n📝 Exam: Unit Test 1\nOpen your Parent Link to see the full report card.");
  });

  it("trims spaces at the line ends and leaves a one-line message as it is", () => {
    expect(previewText("  Fee received  \n   \n")).toBe("Fee received");
    expect(previewText("School is closed tomorrow.")).toBe("School is closed tomorrow.");
  });
});
