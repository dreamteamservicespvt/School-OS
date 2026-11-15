// One-time codes on WhatsApp (live test school, 15 Nov 2026): Meta rejected the
// "Parent Link code" and "Admission consent code" templates with
// INCORRECT_CATEGORY, because School OS sent every template as Utility. Meta
// takes a code only as an Authentication template, in its own fixed words.
// developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
// developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/copy-code-button-authentication-templates
import { describe, expect, it } from "vitest";
import { READY_TEMPLATES } from "@/lib/messaging/templates";
import { isCodeTemplate, whatsappCategoryOf } from "@/lib/messaging/blanks";
import { authTemplateComponents, CODE_EXPIRY_MINUTES, templateComponents, templateSubmission, whatsappMessageBody } from "@/lib/messaging/providers/whatsapp";
import { CODE_SEND_WINDOW_MS } from "@/lib/messaging/one-time-code";
import { rejectedAsWrongType, whatsappNameFor } from "@/lib/communication/templates-admin";

const CODE_KEYS = ["parent-link-code", "admission-consent-code", "sign-in-code", "pickup-code"];
// Birthday wishes are sent for approval as Marketing (their card says so; docs/design/whatsapp-messages.md).
const MARKETING_KEYS = ["birthday-student", "birthday-staff"];

describe("each template's WhatsApp category", () => {
  it("is Authentication for every one-time code template and Utility for the rest", () => {
    for (const t of READY_TEMPLATES) {
      for (const body of Object.values(t.texts)) {
        expect(whatsappCategoryOf(body), `${t.key} (${t.channel})`).toBe(CODE_KEYS.includes(t.key) ? "AUTHENTICATION" : "UTILITY");
        if (t.channel === "whatsapp" && MARKETING_KEYS.includes(t.key)) expect(whatsappCategoryOf(body, { category: "MARKETING" })).toBe("MARKETING");
      }
    }
    // The WhatsApp code templates School OS has today.
    expect(READY_TEMPLATES.filter((t) => t.channel === "whatsapp" && Object.values(t.texts).some(isCodeTemplate)).map((t) => t.key).sort()).toEqual(["admission-consent-code", "parent-link-code", "pickup-code"]);
  });
});

describe("the payload sent to Meta for approval", () => {
  it("is Meta's fixed Authentication form for a code template: no words of our own, copy-code button, 10-minute footer", () => {
    const body = "Your one-time code for Parent Link of {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.";
    expect(templateSubmission({ name: "parent_link_code_abc123_otp", language: "hi", category: "AUTHENTICATION", body })).toEqual({
      name: "parent_link_code_abc123_otp",
      language: "hi",
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
      ],
    });
    // Meta refuses a text of our own on an Authentication template.
    expect(JSON.stringify(authTemplateComponents())).not.toMatch(/"text"/);
  });

  it("says the same expiry as the code really has", () => {
    expect(CODE_EXPIRY_MINUTES * 60_000).toBe(CODE_SEND_WINDOW_MS);
  });

  it("is unchanged for a Utility template: its own words, blanks as {{1}}, {{2}}…", () => {
    const body = "Dear {guardian_name}, {student_name} is absent from school today. Please call the school office.";
    const p = templateSubmission({ name: "absent_today_abc123", language: "en", category: "UTILITY", body });
    expect(p).toEqual({ name: "absent_today_abc123", language: "en", category: "UTILITY", components: templateComponents(body) });
    expect((p.components[0] as { text: string }).text).toBe("Dear {{1}}, {{2}} is absent from school today. Please call the school office.");
  });
});

describe("the message sent to a parent", () => {
  it("carries the code twice for a code template: the body's blank and the copy-code button's", () => {
    expect(whatsappMessageBody({ to: "9876543210", text: "", whatsappTemplate: { name: "parent_link_code_abc123_otp", language: "en", params: ["482913"], buttonParam: "482913" } })).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: {
        name: "parent_link_code_abc123_otp",
        language: { code: "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "482913" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
        ],
      },
    });
  });

  it("is unchanged for a Utility template without a button", () => {
    const b = whatsappMessageBody({ to: "9876543210", text: "", whatsappTemplate: { name: "absent_today_abc123", language: "te", params: ["Srinivas", "Ravi"] } });
    expect((b as { template: { components: unknown } }).template.components).toEqual([{ type: "body", parameters: [{ type: "text", text: "Srinivas" }, { type: "text", text: "Ravi" }] }]);
  });
});

describe("a code template WhatsApp rejected as Utility", () => {
  const body = "Your one-time code to confirm consent for admission at {school_name} is {code}. It works for 10 minutes. Do not share it with anyone.";
  it("goes again under a new name ending in _otp", () => {
    const id = "1a2b3c4d-0000-0000-0000-000000000000";
    expect(whatsappNameFor("Admission consent code", id)).toBe("admission_consent_code_1a2b3c");
    expect(whatsappNameFor("Admission consent code", id, "AUTHENTICATION")).toBe("admission_consent_code_1a2b3c_otp");
    expect(rejectedAsWrongType({ body, whatsappStatus: "REJECTED", whatsappName: "admission_consent_code_1a2b3c" })).toBe(true);
    // Already sent as a code template, or not rejected, or not a code template: not "wrong type".
    expect(rejectedAsWrongType({ body, whatsappStatus: "REJECTED", whatsappName: "admission_consent_code_1a2b3c_otp" })).toBe(false);
    expect(rejectedAsWrongType({ body, whatsappStatus: "PENDING", whatsappName: "admission_consent_code_1a2b3c" })).toBe(false);
    expect(rejectedAsWrongType({ body: "Dear {guardian_name}, welcome to the school. We are happy to have you.", whatsappStatus: "REJECTED", whatsappName: "x" })).toBe(false);
  });
});
