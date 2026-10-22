// Screens in the school's languages (gap list G39; 00-global.md §1.4 and P17).
// The catalogues must agree with English: every key a language translates is an English key,
// every {blank} matches, no translation is empty, and every word a screen asks for is in English.
// A missing translation shows the English words, never a blank or a key.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { EN } from "@/lib/i18n/catalogues/en";
import { CATALOGUES, makeT, personLanguage } from "@/lib/i18n/server";
import { blanksOf, englishOf, fill, translator } from "@/lib/i18n/t";
import { SCREEN_LANGUAGES, cleanLang, pickLanguage, schoolLanguages } from "@/lib/i18n/languages";
import { screenMessage } from "@/lib/i18n/messages";
import { dayWords } from "@/lib/i18n/dates";
import { NAV_GROUPS, BOTTOM_BY_ROLE, QUICK_BY_ROLE } from "@/components/shell/nav-config";
import { MODULES } from "@/lib/modules";
import { allSections } from "@/lib/parent-link/section-list";
import { accessIn } from "@/lib/auth/access";
import { makeSchool, makeUser } from "./helpers";

const english = new Set<string>(EN);
const SRC = path.resolve(import.meta.dirname, "../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("the catalogues", () => {
  it("has each English key once", () => {
    expect(new Set(EN).size).toBe(EN.length);
  });

  for (const lang of SCREEN_LANGUAGES.filter((l) => l !== "en")) {
    it(`${lang}: every key is an English key, with the same blanks, and none is empty`, () => {
      const cat = CATALOGUES[lang] as Record<string, string>;
      for (const [key, words] of Object.entries(cat)) {
        expect(english.has(key), `${lang} has "${key}", which is not in English`).toBe(true);
        expect(words.trim(), `${lang} "${key}" is empty`).not.toBe("");
        expect(blanksOf(words), `${lang} "${key}" has other blanks than English`).toEqual(blanksOf(englishOf(key)));
        expect(words.includes("@@"), `${lang} "${key}" shows a note`).toBe(false);
      }
    });
  }

  it("Hindi and Telugu translate every word (the demo school's languages)", () => {
    for (const lang of ["hi", "te"] as const) {
      const missing = EN.filter((k) => !(k in CATALOGUES[lang]));
      expect(missing, `${lang} is missing translations`).toEqual([]);
    }
  });
});

describe("the screens ask only for English keys", () => {
  it("every t(\"…\") and <Words k=\"…\"> in the code is in the English catalogue", () => {
    const pattern = /(?<![\w.])(?:page\.)?t\(\s*"((?:[^"\\]|\\.)*)"|<Words k="((?:[^"\\]|\\.)*)"/g;
    const unknown: string[] = [];
    for (const file of files(SRC)) {
      if (file.includes(`${path.sep}catalogues${path.sep}`)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("i18n") && !text.includes("parent-link/language")) continue;
      for (const m of text.matchAll(pattern)) {
        const key = (m[1] ?? m[2]).replace(/\\"/g, "\"");
        if (!english.has(key)) unknown.push(`${path.relative(SRC, file)}: ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("the menu, the phone bar, the New menu, module names and Parent Link sections are in English", () => {
    const words = [
      ...NAV_GROUPS.flatMap((g) => [g.group, ...g.items.map((i) => i.label)]).filter((w): w is string => Boolean(w)),
      ...Object.values(BOTTOM_BY_ROLE).flat().map((b) => b.label),
      ...Object.values(QUICK_BY_ROLE).flat().flatMap((q) => [q.label, q.sub]),
      ...MODULES.map((m) => m.name),
      ...allSections().map((s) => s.label),
    ];
    expect([...new Set(words)].filter((w) => !english.has(w))).toEqual([]);
  });
});

describe("the translator", () => {
  it("falls back to English, never a blank or a key", () => {
    const t = translator("ta", {});
    expect(t("Sign in")).toBe("Sign in");
    expect(t("High@@priority")).toBe("High");
    expect(t.any("A word no catalogue has")).toBe("A word no catalogue has");
    const blank = translator("hi", { "Sign in": "  " });
    expect(blank("Sign in")).toBe("Sign in");
  });

  it("fills blanks and keeps an unfilled blank visible", () => {
    expect(fill("Pay {amount}", { amount: "₹500" })).toBe("Pay ₹500");
    expect(fill("Pay {amount}", {})).toBe("Pay {amount}");
    expect(makeT("en")("Pay {amount}", { amount: "₹1,16,400" })).toBe("Pay ₹1,16,400");
  });

  it("speaks Telugu and Hindi on the demo school's screens", () => {
    const te = makeT("te");
    const hi = makeT("hi");
    expect(te("Sign in")).not.toBe("Sign in");
    expect(hi("Sign in")).not.toBe("Sign in");
    // Money and dates keep their Indian forms inside the words.
    expect(te("Pay {amount}", { amount: "₹1,16,400" })).toContain("₹1,16,400");
    expect(dayWords(hi, "Thursday, 22 October")).toContain("22");
    expect(dayWords(hi, "Thursday, 22 October")).not.toContain("Thursday");
  });

  it("puts messages from the rules into the screen's language", () => {
    const te = makeT("te");
    expect(screenMessage(te, "Too many tries in a short time. Please wait 5 minutes and try again.")).toContain("5");
    expect(screenMessage(te, "Too many tries in a short time. Please wait 5 minutes and try again.")).not.toContain("Too many");
    expect(screenMessage(te, "Mobile number is needed.")).not.toBe("Mobile number is needed.");
    expect(screenMessage(te, "Something the catalogue does not have.")).toBe("Something the catalogue does not have.");
    expect(screenMessage(makeT("en"), "Mobile number is needed.")).toBe("Mobile number is needed.");
  });
});

describe("which language a screen uses", () => {
  it("keeps to the school's languages, its default, then English", () => {
    expect(schoolLanguages(["te", "en", "xx"], "en")).toEqual(["en", "te"]);
    expect(schoolLanguages([], null)).toEqual(["en"]);
    expect(pickLanguage(["te"], ["en", "te"], "en")).toBe("te");
    expect(pickLanguage(["ta"], ["en", "te"], "te")).toBe("te");
    expect(pickLanguage([null, "hi"], ["en", "hi"], "en")).toBe("hi");
    expect(pickLanguage(["fr"], ["en"], "en")).toBe("en");
    expect(cleanLang("kn")).toBe("kn");
    expect(cleanLang("<script>")).toBe("en");
  });

  let school: Awaited<ReturnType<typeof makeSchool>>;
  let user: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    school = await makeSchool("Language School");
    user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Language Teacher" });
  });

  it("a new login has no language of its own and follows the school's default", async () => {
    const row = await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id }, select: { language: true } });
    expect(row.language).toBeNull();
    await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.school.update({ where: { id: school.id }, data: { languages: ["en", "te"], defaultLanguage: "te" } }));
    const access = await accessIn(user.id, school.id);
    expect(access?.school.languages).toEqual(["en", "te"]);
    expect(personLanguage(row, access!.school)).toBe("te");
  });

  it("a person's own choice wins while the school has it on", async () => {
    await prisma.userLogin.update({ where: { id: user.id }, data: { language: "en" } });
    const access = await accessIn(user.id, school.id);
    expect(personLanguage({ language: "en" }, access!.school)).toBe("en");
    // The school switches the language off: the person sees the school's default again.
    await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.school.update({ where: { id: school.id }, data: { languages: ["te"], defaultLanguage: "te" } }));
    const after = await accessIn(user.id, school.id);
    expect(personLanguage({ language: "en" }, after!.school)).toBe("te");
  });
});
