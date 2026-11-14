// Security review 2026-11-15 (low): sending a notice again, or seeing what it would cost, with
// another school's notice id answered with a server error. Now it is the plain "not found",
// and nothing of the other school is read.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { NoticeProblem, noticeResendInput } from "@/lib/communication/notices";
import { makeSchool } from "../helpers";

let mine: Awaited<ReturnType<typeof makeSchool>>;
let theirs: Awaited<ReturnType<typeof makeSchool>>;
let theirNotice: string;

beforeAll(async () => {
  mine = await makeSchool("Notice Here");
  theirs = await makeSchool("Notice There");
  theirNotice = await withSchool({ schoolId: theirs.id, userId: null }, async (tx) => (await tx.notice.create({
    data: { schoolId: theirs.id, title: "Sports day", body: "Come at 9.", audience: { kind: "all" }, audienceLabel: "Everyone", channels: ["app"], status: "PUBLISHED" },
  })).id);
}, 120_000);

describe("a notice of another school", () => {
  it("is not found, in plain words", async () => {
    const ctx = { schoolId: mine.id, userId: null };
    const r = withSchool(ctx, (tx) => noticeResendInput(tx, ctx, theirNotice, "sms"));
    await expect(r).rejects.toBeInstanceOf(NoticeProblem);
    await expect(withSchool(ctx, (tx) => noticeResendInput(tx, ctx, theirNotice, "sms"))).rejects.toThrow("This notice was not found.");
    await expect(withSchool(ctx, (tx) => noticeResendInput(tx, ctx, "not-an-id", "sms"))).rejects.toThrow("This notice was not found.");
  }, 60_000);
});
