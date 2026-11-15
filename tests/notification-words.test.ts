// Owner decision 14 (15-11-2026): bell notifications in each reader's language. A notification
// keeps its English text and also the catalogue sentence and values it was made from; the bell,
// the Notifications page and the push alert say it in the reader's own language. Names, amounts
// and dates stay exactly as they are. An old notification without a key shows its English text.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { englishNote, noteText, word } from "@/lib/notification-words";
import { pushBody } from "@/lib/push";
import { tellOldContact } from "@/lib/auth/contact-alert";
import { CATALOGUES, makeT, personLanguage } from "@/lib/i18n/server";
import { EN } from "@/lib/i18n/catalogues/en";
import { makeSchool, makeUser } from "./helpers";

const te = makeT("te");
const hi = makeT("hi");
const en = makeT("en");

let school: Awaited<ReturnType<typeof makeSchool>>;
let telugu: { id: string };
let english: { id: string };

beforeAll(async () => {
  school = await makeSchool();
  await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.school.update({ where: { id: school.id }, data: { languages: ["en", "te", "hi"], defaultLanguage: "en" } }));
  telugu = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Ravi Teja" });
  english = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }], name: "Anita Rao" });
  await prisma.userLogin.update({ where: { id: telugu.id }, data: { language: "te" } });
});

/** The bell's words for one person, the way the layout makes them. */
async function bellFor(userLoginId: string) {
  const ctx = { schoolId: school.id, userId: null };
  return withSchool(ctx, async (tx) => {
    const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId }, select: { language: true } });
    const s = await tx.school.findUniqueOrThrow({ where: { id: school.id }, select: { languages: true, defaultLanguage: true } });
    const t = makeT(personLanguage(login, s));
    const rows = await tx.notification.findMany({ where: { userLoginId }, orderBy: { createdAt: "desc" } });
    return rows.map((n) => noteText(t, n));
  });
}

describe("the words of a notification", () => {
  it("fills the English text from the key, the same words as before", () => {
    expect(englishNote("Query {number} is now yours.", { number: "Q-0042" })).toBe("Query Q-0042 is now yours.");
    expect(englishNote("{name} gave you a task: {title}", { name: word("Someone"), title: "Fix the fan" })).toBe("Someone gave you a task: Fix the fan");
    expect(englishNote("Online fee payment: {amount} for {name}", { amount: "₹12,500", name: 5n })).toBe("Online fee payment: ₹12,500 for 5");
  });

  it("says a key in the reader's language, with names, amounts and dates exactly as they are", () => {
    const n = { text: "Online fee payment: ₹12,500 for Aarav Sharma", textKey: "Online fee payment: {amount} for {name}", textValues: { amount: "₹12,500", name: "Aarav Sharma" } };
    expect(noteText(te, n)).toBe("ఆన్‌లైన్ ఫీజు చెల్లింపు: Aarav Sharma కోసం ₹12,500");
    expect(noteText(hi, n)).toBe("ऑनलाइन फ़ीस भुगतान: Aarav Sharma के लिए ₹12,500");
    expect(noteText(en, n)).toBe("Online fee payment: ₹12,500 for Aarav Sharma");
  });

  it("says English words from the rules in the reader's language too ({ t })", () => {
    const n = {
      text: "You take Meena's classes from 16-11-2026 to 18-11-2026 (3 periods).",
      textKey: "You take {name}'s classes from {from} to {to} ({periods}).",
      textValues: { name: "Meena", from: "16-11-2026", to: "18-11-2026", periods: { t: "3 periods" } },
    };
    expect(noteText(te, n)).toBe("16-11-2026 నుండి 18-11-2026 వరకు మీరు Meena క్లాసులు తీసుకుంటారు (3 పీరియడ్‌లు).");
  });

  it("shows an old notification without a key as its stored English text", () => {
    const old = { text: "Fee reminder sent to 5 A parents", textKey: null, textValues: null };
    expect(noteText(te, old)).toBe("Fee reminder sent to 5 A parents");
    expect(noteText(en, old)).toBe("Fee reminder sent to 5 A parents");
  });

  it("keeps the English words when a key has no translation in that language", () => {
    const n = { text: "Query Q-7 is now yours.", textKey: "Query {number} is now yours.", textValues: { number: "Q-7" } };
    expect(noteText(makeT("ta"), n)).toBe("Query Q-7 is now yours.");
  });
});

describe("notify() keeps the key and the values", () => {
  it("a notification made for a Telugu user shows Telugu in the bell; an English user sees English", async () => {
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      for (const to of [telugu.id, english.id]) {
        await notify(tx, ctx, { to, type: "query", key: "Query {number} is now yours.", values: { number: "Q-0042" }, link: "/communication/queries/x" });
      }
      const row = await tx.notification.findFirstOrThrow({ where: { userLoginId: telugu.id, type: "query" } });
      expect(row).toMatchObject({ text: "Query Q-0042 is now yours.", textKey: "Query {number} is now yours.", textValues: { number: "Q-0042" } });
    });
    expect(await bellFor(telugu.id)).toContain("ప్రశ్న Q-0042 ఇప్పుడు మీది.");
    expect(await bellFor(english.id)).toContain("Query Q-0042 is now yours.");
  });

  it("merged notifications use the merged sentence with the count, in the reader's language", async () => {
    const reader = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    await prisma.userLogin.update({ where: { id: reader.id }, data: { language: "te" } });
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      for (const name of ["Aarav", "Diya", "Kabir"]) {
        await notify(tx, ctx, {
          to: reader.id, type: "fee-online", link: "/fee-management", groupKey: "fee-online",
          key: "Online fee payment: {amount} for {name}", values: { amount: "₹1,000", name }, mergedKey: "{n} online fee payments came in",
        });
      }
      const rows = await tx.notification.findMany({ where: { userLoginId: reader.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ count: 3, text: "3 online fee payments came in", textKey: "{n} online fee payments came in" });
    });
    expect(await bellFor(reader.id)).toEqual(["3 ఆన్‌లైన్ ఫీజు చెల్లింపులు వచ్చాయి"]);
  });

  it("plain text (a person's own message) is kept with no key, as before", async () => {
    const reader = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      const n = await notify(tx, ctx, { to: reader.id, type: "message", text: "Parents meeting moved to Friday", link: "/messages" });
      expect(n).toMatchObject({ text: "Parents meeting moved to Friday", textKey: null, textValues: null });
    });
  });

  it("an old notification made before the change still shows its English text in the bell", async () => {
    const reader = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    await prisma.userLogin.update({ where: { id: reader.id }, data: { language: "te" } });
    await withSchool({ schoolId: school.id, userId: null }, (tx) =>
      tx.notification.create({ data: { schoolId: school.id, userLoginId: reader.id, type: "fee", text: "Old words from before the change", link: "/fee-management" } }));
    expect(await bellFor(reader.id)).toEqual(["Old words from before the change"]);
  });

  it("a real alert (an old mobile number changed) reaches a Telugu user in Telugu", async () => {
    const reader = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    await prisma.userLogin.update({ where: { id: reader.id }, data: { language: "te" } });
    await tellOldContact({ schoolId: school.id, userLoginId: reader.id, name: "Reader", kind: "phone", old: null });
    const [words] = await bellFor(reader.id);
    expect(words).toBe(te("Your School OS mobile number was changed. If this was not you, contact your school."));
    expect(words).not.toBe("Your School OS mobile number was changed. If this was not you, contact your school.");
  });

  it("the push alert says it in the person's own language", async () => {
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      const n = await tx.notification.findFirstOrThrow({ where: { userLoginId: telugu.id, type: "query" } });
      const s = await tx.school.findUniqueOrThrow({ where: { id: school.id }, select: { languages: true, defaultLanguage: true } });
      expect(await pushBody(tx, n, s)).toBe("ప్రశ్న Q-0042 ఇప్పుడు మీది.");
      const e = await tx.notification.findFirstOrThrow({ where: { userLoginId: english.id, type: "query" } });
      expect(await pushBody(tx, e, s)).toBe("Query Q-0042 is now yours.");
    });
  });
});

// Every sentence a notification is made from is said in Hindi and Telugu (a missing one would show English).
describe("the notification sentences are translated", () => {
  const SRC = path.resolve(import.meta.dirname, "../src/lib");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
  const english = new Set<string>(EN);
  // A string right after `key:`, `mergedKey:` or a `?`/`:` of a ternary on a line that names a key.
  const LITERAL = /(?:key|Key|\?|:)\s*\(?\s*"((?:[^"\\]|\\.)*)"/g;

  it("each one is in Hindi and Telugu", () => {
    const used = new Set<string>();
    for (const file of files(SRC)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("notify(") && !text.includes("NoteWords") && !text.includes("tellArrangers(")) continue;
      for (const line of text.split("\n")) {
        if (!/\b(?:key|mergedKey)\b|: MessageKey/.test(line)) continue;
        for (const m of line.matchAll(LITERAL)) {
          const k = m[1].replace(/\\"/g, "\"");
          if (english.has(k)) used.add(k);
        }
      }
    }
    expect(used.size).toBeGreaterThan(150);
    const missing = [...used].filter((k) => !(CATALOGUES.te as Record<string, string>)[k] || !(CATALOGUES.hi as Record<string, string>)[k]);
    expect(missing).toEqual([]);
  });
});
