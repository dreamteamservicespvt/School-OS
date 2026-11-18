// Settings > Users & Permissions: "Two-step login: On, but not working" keeps the fact and says the
// next step. Live test 17 Nov 2026 (Principal): every user showed the long line "On, but not working:
// no code can reach them", cut off at the right edge at 1536 px, with the Last sign-in date squeezed
// onto 3 lines and nothing to say what to do. The cell is now short, and one note above the list says
// what to add so a code can reach them, and where.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as users from "@/lib/settings/user-list";

type Row = { twoStepState: users.TwoStepState; email: string | null; phone: string | null };
const stuck = (email: string | null, phone: string | null): Row => ({ twoStepState: "no-code", email, phone });
const fine: Row = { twoStepState: "on", email: "a@school.in", phone: "9876543210" };
const off: Row = { twoStepState: "off", email: null, phone: null };

describe("two-step login that is on but not working: the next step", () => {
  it("says nothing when a code reaches everyone it should", () => {
    expect(users.twoStepFix([fine, off], { mail: true, sms: true })).toBeNull();
  });

  it("neither SMS nor email can send a code: switch sending on first; people with no contact need one too", () => {
    const none = { mail: false, sms: false };
    expect(users.twoStepFix([stuck(null, "9876543210"), stuck("a@school.in", "9876543211"), fine, off], none)).toEqual({ people: 2, steps: ["no-sending"] });
    expect(users.twoStepFix([stuck(null, "9876543210"), stuck(null, null)], none)).toEqual({ people: 2, steps: ["no-sending", "no-contact"] });
  });

  it("email works but SMS is off: someone with only a mobile number needs an email address, or SMS switched on", () => {
    expect(users.twoStepFix([stuck(null, "9876543210"), fine], { mail: true, sms: false })).toEqual({ people: 1, steps: ["mobile-only"] });
  });

  it("SMS works but email is not set up: someone with only an email address needs a mobile number", () => {
    expect(users.twoStepFix([stuck("a@school.in", null), stuck(null, null)], { mail: false, sms: true })).toEqual({ people: 2, steps: ["email-only", "no-contact"] });
  });

  it("each step is a plain sentence that says what to add and where", () => {
    const w = users.TWO_STEP_FIX_WORDS;
    expect(Object.keys(w).sort()).toEqual(["email-only", "mobile-only", "no-contact", "no-sending"]);
    expect(w["no-sending"]).toMatch(/Switch SMS on in Settings, SMS, WhatsApp & Email/);
    expect(w["mobile-only"]).toMatch(/add their email address/);
    expect(w["email-only"]).toMatch(/add their mobile number/);
    expect(w["no-contact"]).toMatch(/open the person .* and add one/);
    for (const words of Object.values(w)) expect(words.length).toBeLessThanOrEqual(140);
  });

  it("the list cell is short enough for its column; the export keeps the whole fact", () => {
    expect(users.TWO_STEP_SHORT).toEqual({ on: "On", "no-code": "On, but not working", off: "Off" });
    expect(users.TWO_STEP_WORDS["no-code"]).toBe("On, but not working: no code can reach them");
  });

  it("the Users page: short cell, dates on one line, and the note with links to the people and to where SMS is switched on", () => {
    const src = readFileSync("src/app/(school)/settings/users/page.tsx", "utf8");
    expect(src).toMatch(/TWO_STEP_SHORT\[r\.twoStepState\]/);
    expect(src).not.toMatch(/>\{TWO_STEP_WORDS\[r\.twoStepState\]\}</);
    expect(src).toMatch(/key: "lastSignIn",[^\n]*className: "whitespace-nowrap"/);
    expect(src).toMatch(/twoStepFix\(rows, /);
    expect(src).toMatch(/href="\/settings\/users\?twostep=no-code"/);
    expect(src).toMatch(/href="\/settings\/messaging"/);
    const table = readFileSync("src/components/list/data-table.tsx", "utf8");
    // A column's className reaches its cells (the date column's "whitespace-nowrap").
    expect(table).toMatch(/<td key=\{c\.key\} className=\{`px-4 py-3 align-middle \$\{c\.className \?\? ""\}`\}>/);
  });
});
