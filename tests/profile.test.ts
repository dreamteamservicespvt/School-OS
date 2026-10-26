// My profile: a new mobile number or email is saved only after the code sent to it,
// and a person may switch on two-step login for themselves (00-global.md §1.4).
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanMobile, confirmContactChange, needsTwoStep, startContactChange, twoStepHelp, verifyChallenge } from "@/lib/auth/two-step";
import { readNotePrefs, channelsForType } from "@/lib/notification-kinds";
import { makeSchool, makeUser } from "./helpers";

const device = { userAgent: "Test browser", ipAddress: "10.0.0.7" };
let school: Awaited<ReturnType<typeof makeSchool>>;
let user: Awaited<ReturnType<typeof makeUser>>;
const phone = `9${String(Date.now()).slice(-9)}`;

function catcher() {
  const got: { code: string; to: { email: string | null; phone: string | null } }[] = [];
  const deliver = async (to: { email: string | null; phone: string | null; name: string }, code: string) => {
    got.push({ code, to });
    return { channel: "test", sentTo: to.phone ?? to.email ?? "" };
  };
  return { got, deliver };
}

beforeAll(async () => {
  school = await makeSchool();
  user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Profile Teacher" });
});

describe("changing my mobile number", () => {
  it("cleans Indian mobile numbers", () => {
    expect(cleanMobile("098765 43210")).toBe("+91 98765 43210");
    expect(cleanMobile("+91-9876543210")).toBe("+91 98765 43210");
    expect(cleanMobile("12345")).toBeNull();
  });

  it("sends the code to the new number and saves it only after the right code", async () => {
    const c = catcher();
    const started = await startContactChange(user.id, school.id, "phone", phone, device, { deliver: c.deliver });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(c.got[0].to.phone).toContain(phone.slice(5));
    expect(c.got[0].to.email).toBeNull();
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).phone).toBeNull();

    const wrong = c.got[0].code === "000000" ? "111111" : "000000";
    expect(await confirmContactChange(user.id, started.token, wrong, device)).toMatchObject({ ok: false });
    // Another person cannot use this code.
    const other = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    expect(await confirmContactChange(other.id, started.token, c.got[0].code, device)).toMatchObject({ ok: false, restart: true });

    expect(await confirmContactChange(user.id, started.token, c.got[0].code, device)).toMatchObject({ ok: true, kind: "phone" });
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(cleanMobile(phone));
    // Used once only.
    expect(await confirmContactChange(user.id, started.token, c.got[0].code, device)).toMatchObject({ ok: false });
  });

  it("will not give one number to two logins", async () => {
    const other = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const r = await startContactChange(other.id, school.id, "phone", phone, device, { deliver: catcher().deliver });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Another login") });
  });

  it("a contact code can never finish a sign-in", async () => {
    const c = catcher();
    const started = await startContactChange(user.id, school.id, "email", `new.${Date.now()}@school.in`, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    expect(await verifyChallenge(started.token, c.got[0].code, device)).toMatchObject({ ok: false, restart: true });
  });
});

describe("two-step login I choose", () => {
  it("is asked once the person switches it on, even when the role does not need it", async () => {
    expect(await needsTwoStep(user.id, school.id)).toBe(false);
    await prisma.userLogin.update({ where: { id: user.id }, data: { twoStepChosen: true } });
    expect(await needsTwoStep(user.id, school.id)).toBe(true);
  });

  // The School Admin's own profile told them to "ask your School Admin" (2026-10-26).
  it("tells a person who may set up SMS to do it, and only others to ask the School Admin", () => {
    for (const contact of [{ email: "a@b.in", phone: "9876543210" }, { email: null, phone: "9876543210" }]) {
      const mine = twoStepHelp(contact, true);
      expect(mine).toContain("Settings, SMS, WhatsApp & Email");
      expect(mine).not.toMatch(/school admin/i);
      expect(twoStepHelp(contact, false)).toMatch(/ask your School Admin to set up SMS/i);
    }
  });
});

describe("my notification choices", () => {
  it("keep security alerts and approvals in the app, and default to the app", () => {
    const prefs = readNotePrefs({ security: ["sms"], tasks: [] });
    expect(prefs.security).toEqual(["app", "sms"]);
    expect(prefs.tasks).toEqual([]);
    expect(prefs.notices).toEqual(["app"]);
    expect(channelsForType({ substitutions: ["app", "whatsapp"] }, "substitution")).toEqual(["app", "whatsapp"]);
    expect(channelsForType({}, "something-new")).toEqual(["app"]);
  });
});
