// HANDOFF 3a2: Meta refuses a WhatsApp template that starts or ends with a
// blank, has two blanks with no word between them, or has too many blanks for
// its length. Every ready WhatsApp text must pass, and the check must catch
// the texts Meta refused on 2026-10-26.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { READY_TEMPLATES, whatsappProblems } from "@/lib/messaging/templates";

describe("whatsappProblems", () => {
  it("finds a blank at the end, even with a full stop after it", () => {
    expect(whatsappProblems("Dear {guardian_name}, the school bus is late today. - {school_name}").join(" ")).toMatch(/End the text with words/);
    expect(whatsappProblems("Dear {guardian_name}, the school bus is running late today, {school_name}.").join(" ")).toMatch(/End the text with words/);
  });

  it("finds a blank at the start", () => {
    expect(whatsappProblems("{code} is your one-time code for the Parent Link. It works for ten minutes only.").join(" ")).toMatch(/Start the text with words/);
  });

  it("finds two blanks with only a space between them", () => {
    expect(whatsappProblems("Dear {guardian_name}, your child {student_name} {class} was absent from school today. Please call us.").join(" ")).toMatch(/Put a word between the blanks in "\{student_name\} \{class\}"/);
  });

  it("finds too many blanks for the length, counting words in any script", () => {
    expect(whatsappProblems("Dear {guardian_name}, {message} from the {school_name} team.").join(" ")).toMatch(/at least 8 words besides the 3 blanks/);
    expect(whatsappProblems("ప్రియమైన {student_name}, పుట్టినరోజు శుభాకాంక్షలు! మీకు ఈ సంవత్సరం ఆనందంగా గడవాలి.")).toEqual([]);
  });

  it("leaves out the line that becomes the receipt button", () => {
    expect(whatsappProblems("Dear {guardian_name}, we have received your payment today. Thank you very much for paying on time.\nOpen your receipt: {receipt_link}")).toEqual([]);
  });

  it("has nothing to say about a text without blanks", () => {
    expect(whatsappProblems("School is closed tomorrow.")).toEqual([]);
  });
});

describe("ready WhatsApp texts", () => {
  const texts = READY_TEMPLATES.filter((t) => t.channel === "whatsapp").flatMap((t) => Object.entries(t.texts).map(([lang, body]) => ({ name: `${t.key} (${lang})`, body })));

  it.each(texts)("$name is a text Meta takes", ({ body }) => {
    expect(whatsappProblems(body)).toEqual([]);
  });
});

describe("migration for schools made before", () => {
  const dir = path.join(process.cwd(), "prisma/schema/migrations");
  const name = readdirSync(dir).find((x) => x.endsWith("_whatsapp_ready_texts"));
  const sql = name ? readFileSync(path.join(dir, name, "migration.sql"), "utf8") : "";

  it("exists and puts row-level security back", () => {
    expect(name).toBeTruthy();
    expect(sql).toMatch(/ALTER TABLE "template_version" FORCE ROW LEVEL SECURITY;\s*$/);
  });

  it("only touches untouched texts never sent to WhatsApp", () => {
    expect(sql).toContain("COALESCE(tv.\"whatsapp_status\", 'NOT_SUBMITTED') = 'NOT_SUBMITTED'");
    expect(sql).toContain("t.\"channel\" = 'whatsapp'");
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it("writes the same words as the ready texts, and only texts Meta takes", () => {
    const rows = [...sql.matchAll(/\('([a-z-]+)', '([a-z]+)',\s*E'(?:[^'\\]|\\.)*',\s*E'((?:[^'\\]|\\.)*)'/g)];
    expect(rows.length).toBeGreaterThan(20);
    for (const [, key, lang, body] of rows) {
      const ready = READY_TEMPLATES.find((t) => t.key === key && t.channel === "whatsapp")?.texts[lang];
      const words = body.replace(/\\n/g, "\n").replace(/\\'/g, "'");
      expect(words, `${key} (${lang})`).toBe(ready);
      expect(whatsappProblems(words)).toEqual([]);
    }
  });
});
