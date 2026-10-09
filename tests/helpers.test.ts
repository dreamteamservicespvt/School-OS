import { describe, expect, it } from "vitest";
import { decryptField, encryptField, maskLast4 } from "@/lib/crypto";
import { checkIndianMobile, formatDate, formatRupees, formatTime } from "@/lib/format";

describe("sensitive fields", () => {
  it("are encrypted and read back", () => {
    const stored = encryptField("1234 5678 9012");
    expect(stored).not.toContain("1234");
    expect(decryptField(stored)).toBe("1234 5678 9012");
  });
  it("cannot be changed without being noticed", () => {
    const parts = encryptField("1234 5678 9012").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });
  it("are shown with only the last 4 characters", () => {
    expect(maskLast4("1234 5678 9012")).toBe("••••••••9012");
  });
});

describe("numbers and dates", () => {
  it("shows money in rupees with Indian grouping", () => {
    expect(formatRupees(11640000n)).toBe("₹1,16,400");
    expect(formatRupees(50050)).toBe("₹500.50");
  });
  it("shows dates as DD-MM-YYYY and times with AM and PM, in India time", () => {
    const d = new Date("2026-10-06T05:30:00Z");
    expect(formatDate(d)).toBe("06-10-2026");
    expect(formatTime(d)).toBe("11:00 AM");
  });
  it("explains a wrong phone number in plain words", () => {
    expect(checkIndianMobile("98765432101")).toBe("Phone number has 11 digits. Indian mobile numbers have 10 digits.");
    expect(checkIndianMobile("+91 98765 43210")).toBeNull();
  });
});
