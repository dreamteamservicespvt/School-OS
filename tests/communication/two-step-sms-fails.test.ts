// Two-step login when the school's SMS is set up but the code cannot go
// (security audit 2026-10-31): no SMS credits left must not let a School Admin,
// Principal or Accountant in with the password alone. It is a passing fault,
// not "no code can reach them", so the person is told and no session is made.
// Test mode charges no credits, so the failed send is made here by the messaging API.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messaging/send", async (orig) => {
  const real = await orig<typeof import("@/lib/messaging/send")>();
  return { ...real, sendMessage: async () => { throw new real.MessagingProblem("Not enough SMS credits for this message."); } };
});

import { prisma } from "@/lib/db";
import { deliverCodeTo } from "@/lib/auth/two-step";
import { addDlt, makeCommSchool } from "./fixture";
import { watchLoggedCodes } from "../helpers";

watchLoggedCodes();

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await addDlt(s.ctx, "sign-in-code");
  await prisma.userLogin.update({ where: { id: s.principal.id }, data: { phone: "9876543298", email: null } });
}, 120_000);

describe("a sign-in code SMS that cannot be sent", () => {
  it("is a problem to retry, never a sign-in without the code", async () => {
    const r = await deliverCodeTo({ email: null, phone: "9876543298", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "no-credits" }, "246810");
    expect(r).toEqual({ problem: expect.stringContaining("could not be sent by SMS") });
    expect(r).not.toHaveProperty("unreachable");
  });
});
