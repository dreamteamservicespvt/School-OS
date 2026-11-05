// The owner's app-wide UX pass (testing, 2026-11-04): 12-hour times everywhere, drafts of
// forms that survive a close, UPI references of exactly 12 digits, and one share menu.
import { describe, expect, it } from "vitest";
import { formatClock, formatClockRange, formatDateTime, formatTime } from "@/lib/format";
import { time12 as academicTime12 } from "@/lib/academic/common";
import { time12 as attendanceTime12 } from "@/lib/attendance/time";
import { showTime } from "@/lib/date-text";
import { clockWords } from "@/lib/homework/words";
import { boxText, changedFrom, DRAFT_MAX_AGE_MS, draftKey, fingerprint, isPrivateField, readDraft, writeDraft } from "@/lib/form-draft";
import { isUpi, paymentRefProblem, upiTyping, UTR_PROBLEM } from "@/lib/payment-ref";
import { whatsappHref } from "@/lib/share";

describe("times are 12-hour with AM and PM (D1)", () => {
  it("shows stored clock times in 12-hour time, one formatter for all", () => {
    expect(formatClock("07:00")).toBe("7:00 AM");
    expect(formatClock("13:40")).toBe("1:40 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("23:59")).toBe("11:59 PM");
    expect(formatClock("7:05")).toBe("7:05 AM");
    expect(formatClock("21:45:00")).toBe("9:45 PM");
    expect(formatClockRange("07:00", "08:00")).toBe("7:00 AM to 8:00 AM");
  });

  it("leaves anything that is not a clock time as it is", () => {
    expect(formatClock("")).toBe("");
    expect(formatClock(null)).toBe("");
    expect(formatClock("25:00")).toBe("25:00");
    expect(formatClock("Lunch")).toBe("Lunch");
  });

  it("every older helper gives the same words", () => {
    for (const t of ["00:00", "08:45", "11:00", "12:30", "13:40", "18:00", "23:15"]) {
      expect(academicTime12(t)).toBe(formatClock(t));
      expect(attendanceTime12(t)).toBe(formatClock(t));
      expect(showTime(t)).toBe(formatClock(t));
    }
  });

  it("moments read like the receipt: 03-11-2026, 3:17 PM", () => {
    const at = new Date("2026-11-03T09:47:00Z"); // 3:17 PM in India
    expect(formatTime(at)).toBe("3:17 PM");
    expect(formatDateTime(at)).toBe("03-11-2026, 3:17 PM");
    expect(clockWords(at, "Asia/Kolkata")).toBe("3:17 PM");
    expect(formatTime(new Date("2026-11-03T18:30:00Z"))).toBe("12:00 AM");
  });
});

describe("form drafts (D2)", () => {
  it("never keeps passwords, codes, payment references or identity numbers", () => {
    for (const [name, type, ac] of [
      ["password", "password", ""], ["newPassword", "text", ""], ["otp", "text", ""], ["code", "text", "one-time-code"],
      ["reference", "text", ""], ["utr", "text", ""], ["upiRef", "text", ""], ["chequeNo", "text", ""], ["cardLast4", "text", ""],
      ["aadhaar", "text", ""], ["aadharNo", "text", ""], ["bankAccount", "text", ""], ["ifsc", "text", ""], ["photo", "file", ""],
      ["schoolId", "hidden", ""], ["anything", "text", "cc-number"], ["apiKey", "text", ""],
    ] as const) expect(isPrivateField(name, type, ac), name).toBe(true);
    for (const name of ["name", "sections", "seats", "level", "board", "title", "body", "firstName", "phone", "pincode", "amount", "note"]) {
      expect(isPrivateField(name, "text"), name).toBe(false);
    }
  });

  it("keeps only what changed, and nothing when nothing changed", () => {
    const start = { name: "", sections: "A", seats: "40", subjects: [] as string[] };
    expect(changedFrom(start, { ...start, name: "Class 6" })).toEqual({ name: "Class 6" });
    expect(writeDraft(fingerprint(start), start, start)).toBeNull();
    const text = writeDraft(fingerprint(start), start, { ...start, name: "Class 6", subjects: ["maths"] }, 1000);
    expect(JSON.parse(text!)).toEqual({ base: fingerprint(start), values: { name: "Class 6", subjects: ["maths"] }, savedAt: 1000 });
  });

  it("does not write private fields even when they changed", () => {
    const start = { name: "", password: "", reference: "" };
    const text = writeDraft("b", start, { name: "Ravi", password: "secret1", reference: "428391027714" }, 1000);
    expect(JSON.parse(text!).values).toEqual({ name: "Ravi" });
  });

  it("brings a draft back only into the same starting form, and not when old or broken", () => {
    const base = fingerprint({ name: "" });
    const text = writeDraft(base, { name: "" }, { name: "Class 6" }, 1000)!;
    expect(readDraft(text, base, 2000)?.values).toEqual({ name: "Class 6" });
    expect(readDraft(text, fingerprint({ name: "Class 5" }), 2000)).toBeNull(); // the record changed since
    expect(readDraft(text, base, 1000 + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(readDraft("{not json", base)).toBeNull();
    expect(readDraft(null, base)).toBeNull();
    expect(readDraft(JSON.stringify({ base, savedAt: 1000, values: { otp: "123456" } }), base, 2000)).toBeNull();
  });

  it("names a draft by person, page and form", () => {
    expect(draftKey("school-1:user-1", "/academic-management", "Add a class|yearId=y1")).toBe("sos:draft:school-1:user-1|/academic-management|Add a class|yearId=y1");
    expect(draftKey("school-1:user-2", "/academic-management", "Add a class")).not.toBe(draftKey("school-1:user-1", "/academic-management", "Add a class"));
  });

  it("puts dates and times back in the boxes' own words", () => {
    expect(boxText("2026-11-05")).toBe("05-11-2026");
    expect(boxText("15:17")).toBe("3:17 PM");
    expect(boxText("Class 6")).toBe("Class 6");
  });
});

describe("UPI references are 12 digits (D3)", () => {
  it("keeps only digits, at most 12, while typing", () => {
    expect(upiTyping("4283-9102 77AB14")).toBe("428391027714");
    expect(upiTyping("4283910277145555")).toBe("428391027714");
    expect(upiTyping("abc")).toBe("");
  });

  it("refuses anything but exactly 12 digits for UPI", () => {
    expect(paymentRefProblem("UPI", "428391027714")).toBeNull();
    expect(paymentRefProblem("upi", "4283 9102 7714")).toBeNull();
    for (const bad of ["42839102771", "4283910277145", "UPI1234567", "42839102771A", "4283-9102-771"]) {
      expect(paymentRefProblem("UPI", bad), bad).toBe(UTR_PROBLEM);
    }
    expect(paymentRefProblem("UPI", "")).toBeNull(); // whether it is needed is each screen's own rule
  });

  it("leaves bank transfer, card and cheque references to their own rules", () => {
    expect(paymentRefProblem("BANK_TRANSFER", "SBIN226211234567")).toBeNull(); // NEFT: 16 letters and digits
    expect(paymentRefProblem("CARD", "AUTH8812")).toBeNull();
    expect(paymentRefProblem("CHEQUE", "Cheque 118204 · Canara Bank")).toBeNull();
    expect(isUpi("UPI") && isUpi(" upi ") && !isUpi("CASH") && !isUpi(null)).toBe(true);
  });
});

describe("one share menu (D4)", () => {
  it("opens WhatsApp with the words, to a number when given", () => {
    expect(whatsappHref("Hello & welcome")).toBe("https://wa.me/?text=Hello%20%26%20welcome");
    expect(whatsappHref("Hi", "98765 43210")).toBe("https://wa.me/919876543210?text=Hi");
    expect(whatsappHref("Hi", "+91 98765 43210")).toBe("https://wa.me/919876543210?text=Hi");
    expect(whatsappHref("Hi", "12345")).toBe("https://wa.me/?text=Hi");
  });
});
