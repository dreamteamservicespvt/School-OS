// Live test 16 Nov: WhatsApp refused 40 of 41 cards ("Invalid parameter") because their text header
// started with an emoji. Headers now carry letters only; the emoji stays in the words.
import { describe, expect, it } from "vitest";
import { cardProblems, headerWithoutEmoji, readCard } from "@/lib/messaging/card";
import { READY_WHATSAPP, readyCard } from "@/lib/messaging/ready-whatsapp";

describe("WhatsApp card headers", () => {
  it("lose their emoji, keeping the words", () => {
    expect(headerWithoutEmoji("✅ Fee received")).toBe("Fee received");
    expect(headerWithoutEmoji("🔔 ఈరోజు గైర్హాజరు")).toBe("ఈరోజు గైర్హాజరు");
    expect(headerWithoutEmoji("✍️ Consent needed")).toBe("Consent needed");
  });
  it("no ready card has an emoji in its header, in any language", () => {
    for (const t of READY_WHATSAPP) for (const lang of Object.keys(t.texts)) {
      const card = readyCard(t.key, lang);
      expect(cardProblems(card), `${t.key} ${lang}`).toEqual([]);
      if (card?.header?.text) expect(headerWithoutEmoji(card.header.text)).toBe(card.header.text);
    }
  });
  it("a card saved with an emoji header reads back without it", () => {
    expect(readCard({ header: { type: "text", text: "📚 New homework" } })?.header).toEqual({ type: "text", text: "New homework" });
  });
  it("an emoji typed into a header is named as a problem", () => {
    expect(cardProblems({ header: { type: "text", text: "🎂 Happy birthday" } }).join(" ")).toMatch(/cannot have an emoji/);
  });
});
