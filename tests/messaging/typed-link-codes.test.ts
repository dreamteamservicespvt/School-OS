// Security review 15 Nov: link codes (⟦parent-link:…⟧, ⟦receipt:…⟧) become real secret links only when a
// message is handed to the provider. A person's typed words must never carry one: a typed code could send
// another family's Parent Link or receipt. School OS's own codes travel in blanks (values) and stay.
import { describe, expect, it } from "vitest";
import { stripTypedLinkCodes, type SendInput } from "@/lib/messaging/send";

const id = "11111111-2222-3333-4444-555555555555";
const base: SendInput = { to: { guardianIds: [] }, channels: ["whatsapp"] } as unknown as SendInput;

describe("typed words carry no link codes", () => {
  it("removes codes from text, title and translations, and keeps the blanks' values", () => {
    const out = stripTypedLinkCodes({
      ...base,
      text: `Hello ⟦parent-link:${id}⟧ and ⟦receipt:${id}:${id}⟧ bye`,
      title: `Title ⟦parent-link:${id}⟧`,
      translations: { te: { text: `తెలుగు ⟦parent-link:${id}⟧`, title: null } },
      values: { link: `⟦parent-link:${id}⟧` },
    } as SendInput);
    expect(out.text).toBe("Hello  and  bye");
    expect(out.title).toBe("Title ");
    expect(out.translations?.te?.text).toBe("తెలుగు ");
    expect((out as { values?: Record<string, string> }).values?.link).toBe(`⟦parent-link:${id}⟧`);
  });
});
