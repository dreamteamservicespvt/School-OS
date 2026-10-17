// Are two names written for the same person? (src/lib/students/name-match.ts)
// Used when a file from old software may hold a child or parent already on
// record: other spellings and a typo match, different children never do.
import { describe, expect, it } from "vitest";
import { namesAlike, nameWords } from "@/lib/students/name-match";

describe("names written for the same person", () => {
  it("are the same with other capitals, spaces, dots and titles", () => {
    expect(namesAlike("ARJUN  RAO", "Arjun Rao")).toBe("same");
    expect(namesAlike("Mr. Srinivas Rao", "srinivas rao")).toBe("same");
    expect(namesAlike("Rao Srinivas", "Srinivas Rao")).toBe("same");
    expect(nameWords("Smt. K. Lakshmi")).toEqual(["k", "lakshmi"]);
  });

  it("are close with the usual other spellings of Indian names", () => {
    expect(namesAlike("Mohd Irfan", "Mohammed Irfan")).toBe("close");
    expect(namesAlike("Md. Irfan", "Muhammad Irfan")).toBe("close");
    expect(namesAlike("Laxmi Devi", "Lakshmi Devi")).toBe("close");
    expect(namesAlike("Shrinivas Rao", "Srinivas Rao")).toBe("close");
    expect(namesAlike("Seeta Sharma", "Sita Sharma")).toBe("close");
    expect(namesAlike("Shaikh Ahmed", "Sheikh Ahmed")).toBe("close");
  });

  it("are close with one letter wrong in a longer word, an initial or a missing surname", () => {
    expect(namesAlike("Sirnivas Rao", "Srinivas Rao")).toBe("close");
    expect(namesAlike("K. Ravi", "Kiran Ravi")).toBe("close");
    expect(namesAlike("Ravi", "Ravi Teja")).toBe("close");
  });

  it("never match different children or parents", () => {
    expect(namesAlike("Ram Kumar", "Laxman Kumar")).toBeNull(); // twins
    expect(namesAlike("Ram", "Rama")).toBeNull(); // short names need the whole word
    expect(namesAlike("Ravi Rao", "Mohan Das")).toBeNull();
    expect(namesAlike("Srinivas Rao", "Lakshmi Rao")).toBeNull(); // father and mother
    expect(namesAlike("K. R.", "Kiran Rao")).toBeNull(); // initials alone are not enough
    expect(namesAlike("Student 1 Kumar", "Student 10 Kumar")).toBeNull(); // numbers are never guessed at
    expect(namesAlike("", "Ravi")).toBeNull();
  });
});
