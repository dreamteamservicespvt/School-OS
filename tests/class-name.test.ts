// One way to show a class (layman loop 6, L6-16) and never "class class 1 A" (loop 6 re-check, NEW-01).
// Pure helpers, plus a scan of the source: no screen line puts the word "class" in front of a
// name that may already start with it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classIn, classSection, classShort, classTitle } from "@/lib/class-name";
import { classWords } from "@/lib/i18n/messages";
import { englishT } from "@/lib/i18n/t";

const SRC = path.resolve(import.meta.dirname, "../src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("a class reads the same on every screen", () => {
  it("says Class once, however the school typed the name", () => {
    for (const typed of ["class 1", "Class 1", "CLASS 1", "1", " class  1 "]) expect(classTitle(typed)).toBe("Class 1");
    expect(classTitle("XII")).toBe("Class XII");
    expect(classTitle("LKG")).toBe("LKG");
    expect(classTitle("Nursery")).toBe("Nursery");
    expect(classTitle("Grade 3")).toBe("Grade 3");
  });

  it("joins the section: Class 1 A, never class class 1 A", () => {
    for (const typed of ["class 1", "Class 1", "1"]) expect(classSection(typed, "A")).toBe("Class 1 A");
    expect(classSection("UKG", "B")).toBe("UKG B");
    expect(classSection("class 2", null)).toBe("Class 2");
    // A label that is already whole stays whole when a screen titles it again.
    expect(classTitle(classSection("class 1", "A"))).toBe("Class 1 A");
    expect(classTitle("1 A")).toBe("Class 1 A");
  });

  it("cuts to the short form for tiles, and says the word Class in the screen's language", () => {
    expect(classShort("class 1")).toBe("1");
    expect(classShort("Class 10")).toBe("10");
    expect(classIn(englishT, "class 1 A")).toBe("Class 1 A");
    expect(classIn(englishT, "LKG A")).toBe("LKG A");
    expect(classWords(englishT, "Class 1 A")).toBe("Class 1 A");
    expect(classWords(englishT, "class 1 A")).toBe("class 1 A");
  });

  it("no screen line writes the word class in front of a class name itself (NEW-01)", () => {
    // `class ${x.name}` and `Class ${label}` doubled the word for a class named "class 1". Use classTitle or classSection.
    const doubling = /`[^`]*\b[Cc]lass \$\{[^}]*(?:name|label|Label|place|section)\b[^}]*\}/;
    const found: string[] = [];
    for (const file of files(SRC)) {
      if (file.endsWith(`${path.sep}class-name.ts`) || file.includes(`${path.sep}catalogues${path.sep}`)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (doubling.test(line)) found.push(`${path.relative(SRC, file)}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});
