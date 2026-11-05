// The console's "Signed in" for a school's admin follows the real sign-in at
// once, not only the next re-count (owner test 2026-11-05: a School Admin who
// had signed in many times showed "Not signed in" on the Schools list).
import { describe, expect, it } from "vitest";
import { withConsole, withConsoleSchool } from "@/lib/db";
import { completeSignIn, signIn } from "@/lib/auth/sign-in";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const device = { userAgent: "Test browser", ipAddress: "10.0.0.31" };

async function schoolWithCard(name: string) {
  const s = await makeSchool(name);
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Nagpur", state: "Maharashtra", status: "ACTIVE", statusSince: new Date(), startedAs: "ACTIVE", adminName: "Saiveni" } }));
  return s;
}
const card = (id: string) => withConsole((tx) => tx.consoleSchool.findUniqueOrThrow({ where: { id } }));

describe("the console card of a school whose admin signs in", () => {
  it("shows the School Admin as signed in right after they sign in", async () => {
    const s = await schoolWithCard("Chaitanya Test School");
    const admin = await makeUser({ schools: [{ id: s.id, roleKeys: ["school-admin"] }], name: "Saiveni" });
    expect((await card(s.id)).adminSignedIn).toBe(false);
    const at = new Date();
    // The last step of every sign-in (after the password, and the code when the role needs one).
    await completeSignIn(admin.id, s.id, device, at);
    const c = await card(s.id);
    expect(c.adminSignedIn).toBe(true);
    expect(c.firstAdminSignInAt?.getTime()).toBe(at.getTime());
    // A later sign-in keeps the first time.
    await completeSignIn(admin.id, s.id, device, new Date(at.getTime() + 60_000));
    expect((await card(s.id)).firstAdminSignInAt?.getTime()).toBe(at.getTime());
  });

  it("a teacher signing in does not mark the School Admin as signed in", async () => {
    const s = await schoolWithCard("Teacher Only School");
    const teacher = await makeUser({ schools: [{ id: s.id, roleKeys: ["teacher"] }], name: "Teacher" });
    const r = await signIn(teacher.username, PASSWORD, device, { sleep: noSleep });
    expect(r.ok).toBe(true);
    expect((await card(s.id)).adminSignedIn).toBe(false);
  });
});
