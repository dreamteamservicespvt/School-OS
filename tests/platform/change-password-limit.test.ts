// PLATFORM-07 (Chaitanya QA audit): Profile > Change password let a signed-in
// session try wrong current passwords without any limit, so an unattended open
// session could be used to guess the password. Now 10 tries per 10 minutes, as
// sign-in has.
import { describe, expect, it, vi } from "vitest";
import { makeSchool, makeUser, PASSWORD } from "../helpers";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", () => ({
  requireCurrent: async () => who.current,
  deviceInfo: async () => ({ ipAddress: "127.0.0.1", userAgent: "vitest" }),
  clearSessionCookie: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { changePassword } = await import("@/app/(school)/actions");

const form = (current: string, next = "Brand-new#Pass1") => {
  const fd = new FormData();
  fd.set("currentPassword", current);
  fd.set("newPassword", next);
  fd.set("confirmPassword", next);
  return fd;
};

describe("Change password", () => {
  it("stops answering wrong current passwords after 10 tries, even with the right one", async () => {
    const school = await makeSchool();
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    who.current = { user: { id: user.id }, ctx: { schoolId: school.id, userId: user.id }, session: { id: "none" } };

    for (let i = 0; i < 10; i++) {
      const r = await changePassword(null, form("Not-it#123"));
      expect(r?.message).toMatch(/current password is not right/);
    }
    const blocked = await changePassword(null, form(PASSWORD));
    expect(blocked).toMatchObject({ ok: false });
    expect(blocked?.message).toMatch(/Too many tries/);
  });
});
