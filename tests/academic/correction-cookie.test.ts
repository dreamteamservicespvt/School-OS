// The pass for correcting a closed year is signed: a hand-written or changed
// cookie is ignored, so a closed year cannot be opened without the audited
// "Start a correction" step (ACADEMICS-06).
import { describe, expect, it } from "vitest";
import { openCorrection, sealCorrection } from "@/lib/academic/correction-cookie";

const pass = { yearId: "y1", reason: "Demo: fix a mark", userId: "u1", until: Date.now() + 60_000 };

describe("year correction pass", () => {
  it("opens a pass this server sealed", () => {
    expect(openCorrection(sealCorrection(pass))).toEqual(pass);
  });

  it("ignores a hand-written pass", () => {
    expect(openCorrection(JSON.stringify(pass))).toBeNull();
    expect(openCorrection(`${Buffer.from(JSON.stringify(pass)).toString("base64url")}.abc`)).toBeNull();
  });

  it("ignores a pass whose time or year was changed", () => {
    const [, sig] = sealCorrection(pass).split(".");
    const longer = Buffer.from(JSON.stringify({ ...pass, until: pass.until + 86_400_000 })).toString("base64url");
    expect(openCorrection(`${longer}.${sig}`)).toBeNull();
  });

  it("ignores an empty or broken cookie", () => {
    expect(openCorrection(undefined)).toBeNull();
    expect(openCorrection("")).toBeNull();
    expect(openCorrection("x")).toBeNull();
  });
});
