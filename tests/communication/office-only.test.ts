// Office work in Communication (templates, notices, Parent Link, consent requests, Message Settings)
// needs school-wide reach (11-communication.md, 05-roles.md). A class teacher, whose reach is their
// own sections, is refused on the server by every page and action, even by direct address, while
// what they may do (send to their own sections) keeps working.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;

async function signIn(userId: string) {
  token = (await createSession(userId, s.school.id, { userAgent: "test" })).token;
}

/** Refused: the action throws, or returns the plain-words refusal, and changes nothing. */
async function refused(run: () => Promise<unknown>) {
  let result: unknown;
  try {
    result = await run();
  } catch (e) {
    expect(String(e)).not.toMatch(/REDIRECT \/communication\/(notices|history)\//);
    return;
  }
  const text = typeof result === "string" ? result : JSON.stringify(result ?? "");
  expect(text).toMatch(/Only the Principal and School Admin|not allowed|permission/i);
}

beforeAll(async () => {
  s = await makeCommSchool();
});
beforeEach(async () => {
  await signIn(s.teacher.id);
});

describe("Communication office pages refuse a class teacher", () => {
  const pages: [string, () => Promise<{ default: (p: never) => Promise<unknown> }>, object][] = [
    ["New notice", () => import("@/app/(school)/communication/notices/new/page"), {}],
    ["New template", () => import("@/app/(school)/communication/templates/new/page"), {}],
    ["Message Settings", () => import("@/app/(school)/communication/settings/page"), {}],
    ["Automation log", () => import("@/app/(school)/communication/settings/log/page"), {}],
    ["Consent requests", () => import("@/app/(school)/communication/parent-link/consent/page"), {}],
    ["Send to families", () => import("@/app/(school)/communication/parent-link/send/page"), {}],
  ];
  for (const [name, load, extra] of pages) {
    it(`${name} goes to the no-access page`, async () => {
      const Page = (await load()).default;
      await expect(Page({ params: Promise.resolve({}), searchParams: Promise.resolve({}), ...extra } as never)).rejects.toThrow(/REDIRECT \/no-access\?m=communication/);
    });
  }

  it("Parent Link pages go to the no-access page", async () => {
    const Layout = (await import("@/app/(school)/communication/parent-link/layout")).default;
    await expect(Layout({ children: null })).rejects.toThrow(/REDIRECT \/no-access\?m=communication/);
  });

  it("the principal can open them", async () => {
    await signIn(s.principal.id);
    const Layout = (await import("@/app/(school)/communication/parent-link/layout")).default;
    await expect(Layout({ children: null })).resolves.toBeTruthy();
  });
});

describe("Communication office actions refuse a class teacher", () => {
  it("notices: write, archive, remind and resend", async () => {
    const n = await import("@/app/(school)/communication/notices/actions");
    const form = new FormData();
    form.set("title", "Sports day");
    form.set("body", "On Friday.");
    const before = await withSchool({ schoolId: s.school.id, userId: s.principal.id }, (tx) => tx.notice.count({ where: { schoolId: s.school.id } }));
    await refused(() => n.saveNoticeAction(null as never, form));
    const fakeId = "00000000-0000-4000-8000-000000000000";
    await refused(() => n.archiveNoticeAction(fakeId));
    await refused(() => n.remindAction(fakeId));
    await refused(() => n.previewNoticeResend(fakeId, "whatsapp"));
    await refused(() => n.resendNotice(fakeId, "whatsapp"));
    const after = await withSchool({ schoolId: s.school.id, userId: s.principal.id }, (tx) => tx.notice.count({ where: { schoolId: s.school.id } }));
    expect(after).toBe(before);
  });

  it("templates: save and archive", async () => {
    const t = await import("@/app/(school)/communication/templates/actions");
    await refused(() => t.saveTemplateAction(null, { name: "Hello", category: "general", channel: "app", texts: [{ language: "en", body: "Hello" }] }));
    await refused(() => t.archiveTemplateAction("00000000-0000-4000-8000-000000000000", true));
  });

  it("Message Settings: rules, delivery and Parent Link settings", async () => {
    const a = await import("@/app/(school)/communication/settings/actions");
    await refused(() => a.saveRuleAction({ key: "absence", isOn: false, channels: [], sendTo: "main", timing: {} }));
    await refused(() => a.saveDeliveryAction({ retryLimit: 3, backup: {}, noticeApproval: "none" }));
    await refused(() => a.saveParentLinkAction({ on: false, shows: {}, autoSendOnAdmission: false, codeMinutes: 10, deviceDays: 30 }));
  });

  it("Parent Link: send to families and consent requests", async () => {
    const p = await import("@/app/(school)/communication/parent-link/actions");
    await refused(() => p.sendFamiliesAction(new FormData()));
    await refused(() => p.consentRequestAction(null as never, new FormData()));
    await refused(() => p.resendManyAction(["00000000-0000-4000-8000-000000000000"], "whatsapp"));
  });

  it("a teacher can still send to their own section", async () => {
    const a = await import("@/app/(school)/communication/actions");
    const form = new FormData();
    form.append("kinds", "parents");
    form.append("sectionIds", s.a.id);
    form.append("channels", "whatsapp");
    form.set("title", "Homework");
    form.set("text", "Please check the diary.");
    const r = await a.livePreview(form);
    expect(r.preview?.people).toBeGreaterThan(0);
  });
});
