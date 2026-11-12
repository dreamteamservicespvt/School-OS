// Library and Inventory screens in Telugu and Hindi (layman test LE8): the words the
// helpers build (a member's class, where a fine is paid, a staff member's name on the
// desk) come out in the screen's language; names stay as typed; exports stay English.
import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n/t";
import { te } from "@/lib/i18n/catalogues/te";
import { hi } from "@/lib/i18n/catalogues/hi";
import { groupWords } from "@/lib/library/words";
import { fineWhere } from "@/lib/library/fines";
import { holderWords } from "@/lib/library/desk";

const tTe = translator("te", te as Record<string, string>);
const tHi = translator("hi", hi as Record<string, string>);
const fine = { status: "DUE", feeDueId: "fee-1", staffId: null, paidHow: null, receiptNo: null, paidAt: null, salaryAt: null } as const;

describe("library words in the screen's language", () => {
  it("says a member's class in Telugu and Hindi, and keeps a department as typed", () => {
    expect(groupWords(tTe, "Class 7 B")).toBe("తరగతి 7 B");
    expect(groupWords(tHi, "Class 7 B")).toBe("कक्षा 7 B");
    expect(groupWords(tTe, "Administration · Principal")).toBe("Administration · Principal");
  });

  it("says where a fine is paid in Telugu, and in English for the export", () => {
    expect(fineWhere(fine, "Asia/Kolkata", tTe)).toBe("ఫీజులో కలిపారు");
    expect(fineWhere({ ...fine, feeDueId: null, staffId: "s1" }, "Asia/Kolkata", tHi)).toBe("यहाँ या वेतन से लें");
    expect(fineWhere(fine, "Asia/Kolkata")).toBe("Added to fees");
  });

  it("keeps the name and translates only (staff)", () => {
    expect(holderWords({ firstName: "Ravi", short: "Staff", kind: "STAFF" }, tTe)).toBe("Ravi (సిబ్బంది)");
    expect(holderWords({ firstName: "Pooja", short: "5 A", kind: "STUDENT" }, tTe)).toBe("Pooja, 5 A");
    expect(holderWords({ firstName: "Ravi", short: "Staff", kind: "STAFF" })).toBe("Ravi (staff)");
  });

  it("has Telugu and Hindi for the desk, stock and settings words the testers found in English", () => {
    for (const k of ["Issued today", "Returned today", "Due today", "Reservations", "Member", "Book", "Library card or name", "Export", "Block", "Added: all dates", "Books for {group}", "Loan days for {group}", "To students today", "Items and quantities", "Stock in hand", "Item codes", "{n} ready at the desk", "since {date}"]) {
      expect(te[k as keyof typeof te], `te ${k}`).toBeTruthy();
      expect(hi[k as keyof typeof hi], `hi ${k}`).toBeTruthy();
    }
    expect(tTe("{n} ready at the desk", { n: 1 })).toBe("1 డెస్క్ వద్ద సిద్ధం");
    expect(tHi("since {date}", { date: "27-10-2026" })).toBe("27-10-2026 से");
  });
});
