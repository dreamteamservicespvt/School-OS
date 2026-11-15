// The WhatsApp cards (docs/design/whatsapp-messages.md): every ready WhatsApp
// card passes Meta's rules in English, Hindi and Telugu (header 60 characters,
// no Markdown or blank; footer 60, no blank; buttons 25 characters, letters
// only, no emoji, at most 2 links and 1 phone; no blank at the start or end;
// enough words per blank; a word between any two blanks); the words for Meta
// never hold a link; submission carries realistic samples and the school's
// name and phone; and sending puts each link button's secret at its own index.
import { describe, expect, it } from "vitest";
import { READY_WHATSAPP, readyCard } from "@/lib/messaging/ready-whatsapp";
import { cardBody, cardProblems, cardSubmission, effectiveButtons, footerFor, gluedBlanks, readCard, samplePdf } from "@/lib/messaging/card";
import { whatsappProblems, whatsappCategoryOf, variablesIn } from "@/lib/messaging/blanks";
import { templateSubmissionParts, whatsappMessageBody } from "@/lib/messaging/providers/whatsapp";
import { READY_TEMPLATES } from "@/lib/messaging/templates";
import { PAST_READY_WHATSAPP } from "@/lib/messaging/ready-history";

const cards = READY_WHATSAPP.flatMap((t) => Object.entries(t.texts).map(([language, body]) => ({ name: `${t.key} (${language})`, key: t.key, language, body, card: readyCard(t.key, language)! })));
const opts = { appUrl: "https://app.schoolos.in", schoolName: "Chaitanya School", schoolPhone: "9876500001", parentLinkOn: true };

describe("every ready WhatsApp card, in every language", () => {
  it("covers English, Hindi and Telugu for every parent and staff card", () => {
    for (const t of READY_WHATSAPP) {
      // Front Office and the connection test go to visitors and testers in English.
      if (/^(appointment|visitor|walk-in|gate-pass|connection-test)/.test(t.key)) continue;
      expect(Object.keys(t.texts).sort(), t.key).toEqual(["en", "hi", "te"]);
    }
  });

  it.each(cards)("$name passes Meta's rules", ({ body, card }) => {
    expect(whatsappProblems(body, card)).toEqual([]);
    expect(cardProblems(card)).toEqual([]);
    const words = cardBody(body, card);
    expect(gluedBlanks(words)).toBeNull();
    // Under about 320 characters of words (filled values add more): a short card.
    expect([...words].length).toBeLessThanOrEqual(420);
    // Raw links never sit in the words: a link is a button. The one exception is the fee reminder's
    // {how_to_pay} line: it says "pay at the school office" when online payment is off, so it cannot be a button.
    expect(words).not.toMatch(/https?:|\{(parent_link|link|receipt_link)\}/);
    if (card.header?.text) {
      expect([...card.header.text].length).toBeLessThanOrEqual(60);
      expect(card.header.text).not.toMatch(/[*_~`{}]/);
    }
    for (const b of card.buttons ?? []) {
      expect([...b.text].length, b.text).toBeLessThanOrEqual(25);
      expect(b.text, b.text).toMatch(/^[\p{L}\p{M}\p{N} ‌‍]+$/u);
    }
    expect((card.buttons ?? []).filter((b) => b.type === "URL").length).toBeLessThanOrEqual(2);
    expect((card.buttons ?? []).filter((b) => b.type === "PHONE").length).toBeLessThanOrEqual(1);
    // Each link button's blank sits alone on the body's last line, so the message keeps filling it.
    expect(effectiveButtons(body, card)).toEqual(card.buttons ?? []);
  });

  it("the ready templates use these cards, and every old ready text can become one", () => {
    for (const t of READY_WHATSAPP) expect(READY_TEMPLATES.find((x) => x.key === t.key && x.channel === "whatsapp")?.texts).toEqual(t.texts);
    for (const k of Object.keys(PAST_READY_WHATSAPP)) {
      const [key, language] = k.split("|");
      // Code templates stay in Meta's fixed Authentication form: no card.
      if (key.endsWith("-code")) continue;
      expect(readyCard(key, language), k).toBeTruthy();
    }
  });

  it("birthday wishes go as Marketing, the rest as Utility, codes as Authentication", () => {
    expect(whatsappCategoryOf(cards.find((c) => c.name === "birthday-student (te)")!.body, readyCard("birthday-student", "te"))).toBe("MARKETING");
    expect(whatsappCategoryOf(cards.find((c) => c.name === "birthday-staff (en)")!.body, readyCard("birthday-staff", "en"))).toBe("MARKETING");
    expect(whatsappCategoryOf(cards.find((c) => c.name === "absence (hi)")!.body, readyCard("absence", "hi"))).toBe("UTILITY");
    const code = READY_TEMPLATES.find((t) => t.key === "pickup-code")!.texts.en;
    expect(whatsappCategoryOf(code, null)).toBe("AUTHENTICATION");
  });

  it("the staff invite is an ordinary message Meta takes as Utility: no link, password, sign-in or account words", () => {
    for (const lang of ["en", "hi", "te"]) {
      const words = cardBody(READY_WHATSAPP.find((t) => t.key === "staff-invite")!.texts[lang], readyCard("staff-invite", lang));
      expect(words).not.toMatch(/password|sign in|account|http|\{link\}|पासवर्ड|खाता|పాస్‌వర్డ్|ఖాతా/i);
    }
    expect(readyCard("staff-invite", "en")!.buttons).toEqual([{ type: "URL", text: "Open School OS", target: "invite", blank: "link" }]);
  });
});

describe("the footer, and Meta's other checks", () => {
  it("writes the school's name in, or Sent via School OS when it is too long", () => {
    expect(footerFor("Chaitanya School")).toBe("Chaitanya School · School OS");
    expect(footerFor("Sri Sri Sri Venkateswara Vidya Niketan Residential High School")).toBe("Sent via School OS");
    expect(footerFor("{school}")).not.toMatch(/[{}]/);
  });

  it("refuses an emoji or punctuation in a button, a long header, a blank in a footer and a third link", () => {
    const bad = cardProblems({ header: { type: "text", text: "*Bold* {x}" }, footer: "{school_name}", buttons: [
      { type: "URL", text: "👍 Got it", path: "/a" }, { type: "URL", text: "Pay now!", path: "/b" }, { type: "URL", text: "A very very long button label", path: "/c" }, { type: "PHONE", text: "Call" }, { type: "PHONE", text: "Call" },
    ] }).join(" ");
    expect(bad).toMatch(/header cannot use/);
    expect(bad).toMatch(/header cannot hold a blank/);
    expect(bad).toMatch(/footer cannot hold a blank/);
    expect(bad).toMatch(/cannot have an emoji/);
    expect(bad).toMatch(/only letters, numbers and spaces/);
    expect(bad).toMatch(/at most 25/);
    expect(bad).toMatch(/At most 2 link buttons/);
    expect(bad).toMatch(/At most 1 phone button/);
  });

  it("finds two blanks with only marks or emoji between them", () => {
    expect(gluedBlanks("Dear {a}, the fee *{b}*\n👤 *{c}* of class")).toBe("{b}*\n👤 *{c}");
    expect(gluedBlanks("Dear {a}, child *{b}* of {c} now")).toBeNull();
    expect(whatsappProblems("Dear {guardian_name}, about *{student_name}*\n👤 *{class}* today and more words here please.").join(" ")).toMatch(/Put a word between/);
  });

  it("reads a card back from the database, leaving out what it does not know", () => {
    expect(readCard(null)).toBeNull();
    expect(readCard({ header: { type: "image" }, buttons: [{ type: "QUICK_REPLY", text: "Got it" }, { type: "PHONE", text: "Call school" }], category: "MARKETING" }))
      .toEqual({ buttons: [{ type: "PHONE", text: "Call school" }], category: "MARKETING" });
  });

  it("makes a real sample PDF for a document header", () => {
    const pdf = samplePdf().toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

describe("sending a card for approval", () => {
  it("fee received: the receipt PDF header, realistic samples, the footer and the receipt button", () => {
    const t = READY_WHATSAPP.find((x) => x.key === "fee-paid")!;
    const r = cardSubmission(t.texts.en, readyCard("fee-paid", "en")!, { ...opts, documentHandle: "4::aW1hZ2" });
    const [header, body, footer, buttons] = r.components as Record<string, unknown>[];
    expect(header).toEqual({ type: "HEADER", format: "DOCUMENT", example: { header_handle: ["4::aW1hZ2"] } });
    expect(body.text).toBe("Dear {{1}}, thank you. We have received your payment.\n\n👤 *{{2}}* of {{3}}\n💰 Amount: *{{4}}*\n💳 Paid by: *{{5}}*\n📅 Paid on: *{{6}}*\n🧾 Receipt no.: *{{7}}*\n⏳ Still due: *{{8}}*\n\nPlease keep this message for your records.");
    expect(body.example).toEqual({ body_text: [["Venkatesh", "Sri Lakshmi", "Class 1 A", "₹2,500", "UPI", "18-11-2026", "CHS/2026/00456", "₹7,500"]] });
    expect(JSON.stringify(body.example)).not.toMatch(/sample/i);
    expect(footer).toEqual({ type: "FOOTER", text: "Chaitanya School · School OS" });
    expect(buttons).toEqual({ type: "BUTTONS", buttons: [{ type: "URL", text: "Open receipt", url: "https://app.schoolos.in/r/{{1}}", example: [expect.stringMatching(/^https:\/\/app\.schoolos\.in\/r\/\w+$/)] }] });
    expect(r.submitted).toEqual({ header: "document", buttons: [{ type: "URL", target: "receipt", blank: "receipt_link" }] });
  });

  it("without the PDF sample the receipt card goes with its text header", () => {
    const t = READY_WHATSAPP.find((x) => x.key === "fee-paid")!;
    const r = cardSubmission(t.texts.te, readyCard("fee-paid", "te")!, opts);
    expect(r.components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "ఫీజు అందింది" });
    expect(r.submitted.header).toBe("text");
  });

  it("fee reminder: the way to pay stays a line of its words ({how_to_pay}); the only button is Call school", () => {
    const t = READY_WHATSAPP.find((x) => x.key === "fee-due")!;
    expect(t.texts.en).toContain("{how_to_pay}");
    const r = cardSubmission(t.texts.hi, readyCard("fee-due", "hi")!, opts);
    expect(r.components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "फ़ीस रिमाइंडर" });
    expect(r.components.at(-1)).toEqual({ type: "BUTTONS", buttons: [
      { type: "PHONE_NUMBER", text: "स्कूल को कॉल करें", phone_number: "+919876500001" },
    ] });
    expect(r.submitted.buttons).toEqual([{ type: "PHONE" }]);
  });


  it("leaves out a Parent Link button while Parent Link is off, and the phone button with no school phone", () => {
    const t = READY_WHATSAPP.find((x) => x.key === "fee-due")!;
    const r = cardSubmission(t.texts.en, readyCard("fee-due", "en")!, { ...opts, parentLinkOn: false, schoolPhone: null });
    expect(r.components.some((c) => c.type === "BUTTONS")).toBe(false);
    expect(r.submitted.buttons).toEqual([]);
  });

  it("a plain text (no card) goes as before, with realistic samples", () => {
    const { body, submitted } = templateSubmissionParts({ name: "x_v1", language: "en", category: "UTILITY", body: "Dear {guardian_name}, {student_name} is absent today. Please call us." });
    expect(submitted).toBeNull();
    expect(JSON.stringify(body)).toMatch(/"Venkatesh","Sri Lakshmi"/);
  });
});

describe("sending a card", () => {
  it("puts the header's media id, the blanks and each link button's secret at its own index", () => {
    const m = whatsappMessageBody({ to: "9876500001", text: "x", whatsappTemplate: { name: "fee_received_v2", language: "te", params: ["Venkatesh"], buttons: [{ index: 1, value: "tok123" }], header: { type: "document", filename: "receipt-1.pdf", id: "media-77" } } });
    expect(m).toEqual({
      messaging_product: "whatsapp", to: "919876500001", type: "template",
      template: { name: "fee_received_v2", language: { code: "te" }, components: [
        { type: "header", parameters: [{ type: "document", document: { id: "media-77", filename: "receipt-1.pdf" } }] },
        { type: "body", parameters: [{ type: "text", text: "Venkatesh" }] },
        { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "tok123" }] },
      ] },
    });
  });

  it("a code template keeps its code button at index 0", () => {
    const m = whatsappMessageBody({ to: "9876500001", text: "x", whatsappTemplate: { name: "code_otp", language: "en", params: ["482913"], buttonParam: "482913" } });
    expect((m as { template: { components: unknown[] } }).template.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] });
  });

  it("the words for Meta keep every blank the message fills, in order", () => {
    const t = READY_WHATSAPP.find((x) => x.key === "bus-arriving")!;
    expect(variablesIn(cardBody(t.texts.en, readyCard("bus-arriving", "en")))).toEqual(["guardian_name", "bus", "route", "stop", "minutes"]);
  });
});
