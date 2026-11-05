// Every bad box marked at once with its own plain-words message, and a message
// gone as soon as the box is right (testing issues 10, 20, 25; owner test
// 2026-11-05 on Add Staff). The browser part is src/components/ui/form-problems.tsx.
import { describe, expect, it } from "vitest";
import { cleanLabel, firstInOrder, problemMessage, shownProblem } from "@/lib/form-problems";

describe("the message for a bad box", () => {
  it("says what is missing in the school's words, not the browser's", () => {
    expect(problemMessage({ valueMissing: true }, { label: "Full name *", kind: "text" })).toBe("Full name is needed.");
    expect(problemMessage({ valueMissing: true }, { label: "Designation", kind: "select" })).toBe("Choose designation.");
    expect(problemMessage({ valueMissing: true }, { label: "New status *", kind: "select-one" })).toBe("Choose new status.");
    expect(problemMessage({ valueMissing: true }, { label: "Photo", kind: "file" })).toBe("Add photo.");
  });

  it("explains a wrong value and how to fix it", () => {
    expect(problemMessage({ typeMismatch: true }, { label: "Email", kind: "email" })).toBe("Email: type a full email address, like name@example.com.");
    expect(problemMessage({ patternMismatch: true }, { label: "Aadhaar", kind: "text", title: "12 digits" })).toBe("Aadhaar: 12 digits.");
    expect(problemMessage({ tooShort: true }, { label: "Reason", kind: "textarea", minLength: 5 })).toBe("Reason needs at least 5 characters.");
    expect(problemMessage({ rangeOverflow: true }, { label: "Date of birth", kind: "date", max: "2026-11-05" })).toBe("Date of birth cannot be after 05-11-2026.");
    expect(problemMessage({ rangeUnderflow: true }, { label: "Max marks", kind: "number", min: "1" })).toBe("Max marks must be 1 or more.");
  });

  it("keeps the screen's own message for a box it checks itself (a date typed wrong, no student ticked)", () => {
    expect(problemMessage({ customError: true }, { label: "Students", kind: "checkbox", validationMessage: "Tick at least one student to correct." })).toBe("Tick at least one student to correct.");
  });

  it("cleans the label of its star and colon", () => {
    expect(cleanLabel("  Reason *  ")).toBe("Reason");
    expect(cleanLabel("Class teacher:")).toBe("Class teacher");
  });
});

describe("which message a box shows", () => {
  const none = new Map<string, string>();
  it("the one found on the page first, then the server's", () => {
    expect(shownProblem("title", "Give the homework a title.", { title: "Title is needed." }, none)).toBe("Title is needed.");
    expect(shownProblem("title", "Give the homework a title.", {}, none)).toBe("Give the homework a title.");
    expect(shownProblem("title", undefined, {}, none)).toBeUndefined();
  });

  it("drops the server's message once the box is changed to a good value (issue 25), and shows a new one", () => {
    const changed = new Map([["title", "Give the homework a title."]]);
    expect(shownProblem("title", "Give the homework a title.", {}, changed)).toBeUndefined();
    expect(shownProblem("title", "The title is too long.", {}, changed)).toBe("The title is too long.");
  });

  it("brings the first bad box of the page into view, in the page's order", () => {
    expect(firstInOrder(["fullName", "phone", "designation", "aadhaar"], ["aadhaar", "phone"])).toBe("phone");
    expect(firstInOrder(["fullName"], ["allocations"])).toBeNull();
  });
});
