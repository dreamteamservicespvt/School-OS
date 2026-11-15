// Owner decision 10 (15 November 2026): the ready consent texts get Hindi and
// Telugu translations, stored next to the English as drafts. A draft is shown
// only to staff in Settings > Data Backup & Security > Consent; it never goes
// into a school's form or onto a parent's screen until the owner approves it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  approvedReadyTranslation, approvedReadyWording, CONSENT_TYPES, DRAFT_STATUS, isReadyEnglish,
  READY_LANGUAGES, READY_TEXTS, readyTranslationDrafts,
} from "@/lib/data-security/consent";

const count = (s: string, part: string) => s.split(part).length - 1;

describe("ready consent translations", () => {
  it("every built-in type has a Hindi and a Telugu translation with the same {school} placeholders", () => {
    for (const { key } of CONSENT_TYPES) {
      const ready = READY_TEXTS[key];
      expect(ready, key).toBeDefined();
      for (const lang of READY_LANGUAGES) {
        const tr = ready.translations[lang];
        expect(tr, `${key} ${lang}`).toBeDefined();
        expect(["approved", DRAFT_STATUS]).toContain(tr!.status);
        expect(tr!.title.trim().length, `${key} ${lang} title`).toBeGreaterThan(0);
        expect(count(tr!.text, "{school}"), `${key} ${lang} {school}`).toBe(count(ready.en, "{school}"));
        expect(tr!.text).not.toMatch(/\{(?!school\})[^}]*\}/);
        expect(tr!.text).not.toBe(ready.en);
      }
    }
  });

  it("a draft is never handed out as an approved text", () => {
    for (const { key } of CONSENT_TYPES) {
      for (const lang of READY_LANGUAGES) {
        const tr = READY_TEXTS[key].translations[lang]!;
        if (tr.status !== DRAFT_STATUS) continue;
        expect(approvedReadyTranslation(key, lang), `${key} ${lang}`).toBeNull();
        expect(approvedReadyWording(key, READY_TEXTS[key].en, lang), `${key} ${lang}`).toBeNull();
        expect(readyTranslationDrafts(key).map((d) => d.lang)).toContain(lang);
      }
    }
  });

  it("an approved translation is only used while the school's English is still the ready text", () => {
    const key = "photo";
    const tr = READY_TEXTS[key].translations.hi!;
    const was = tr.status;
    try {
      tr.status = "approved";
      expect(approvedReadyTranslation(key, "hi")).toEqual({ title: tr.title, text: tr.text });
      expect(approvedReadyWording(key, `  ${READY_TEXTS[key].en.replace(/ /g, "\n")} `, "hi")?.text).toBe(tr.text);
      expect(approvedReadyWording(key, "Our own photo text that the school wrote itself.", "hi")).toBeNull();
      expect(approvedReadyWording(key, undefined, "hi")).toBeNull();
      expect(readyTranslationDrafts(key).map((d) => d.lang)).not.toContain("hi");
    } finally {
      tr.status = was;
    }
  });

  it("knows unknown types and languages have nothing", () => {
    expect(readyTranslationDrafts("custom-field-trips")).toEqual([]);
    expect(approvedReadyTranslation("photo", "ta")).toBeNull();
    expect(isReadyEnglish("photo", "")).toBe(false);
    expect(isReadyEnglish("custom-field-trips", "anything")).toBe(false);
  });
});

describe("parents never see a draft", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(process.cwd(), "src"));
  const own = new Set([join("src", "lib", "data-security", "consent.ts"), join("src", "app", "(school)", "settings", "data-security", "consent", "page.tsx")]);

  it("only the consent library and the Settings consent page read the translations", () => {
    const readers = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return s.includes("READY_TEXTS") && /\.translations\b/.test(s);
    }).map((f) => f.slice(process.cwd().length + 1));
    expect(readers.filter((f) => !own.has(f))).toEqual([]);
  });

  it("the Settings form starts from English plus approved translations only", () => {
    const page = readFileSync(join(process.cwd(), "src", "app", "(school)", "settings", "data-security", "consent", "page.tsx"), "utf8");
    expect(page).toContain("approvedReadyTranslation(key, lang)");
    expect(page).toContain("Draft translation: waiting for approval");
    expect(page).not.toMatch(/translations\[[^\]]+\]\??\.text/);
  });

  it("the owner's review file has every draft word for word", () => {
    const doc = readFileSync(join(process.cwd(), "docs", "qa", "consent-drafts.md"), "utf8");
    for (const { key } of CONSENT_TYPES) {
      expect(doc).toContain(READY_TEXTS[key].en);
      for (const d of readyTranslationDrafts(key)) {
        expect(doc, `${key} ${d.lang}`).toContain(d.text);
        expect(doc, `${key} ${d.lang} title`).toContain(d.title);
      }
    }
  });
});
