// Self-test B6 (owner decision 2026-11-12): "Forgot password? Sign in with a one-time code" must not tell an
// outsider which logins exist. An unknown login gets the same code page, the same words and the same wrong-code
// answers as a real one; the code just never works.
import { describe, expect, it } from "vitest";
import { CODE_SIGN_IN_SENT_TO, decoyAnswer, isDecoyToken, newDecoyToken } from "@/lib/auth/decoy";
import { MAX_CODE_TRIES } from "@/lib/auth/two-step";

describe("code sign-in decoy for an unknown login", () => {
  it("makes a token the code page can tell apart from a real one", () => {
    const t = newDecoyToken();
    expect(isDecoyToken(t)).toBe(true);
    expect(isDecoyToken("abcdef")).toBe(false);
    expect(isDecoyToken(undefined)).toBe(false);
    expect(newDecoyToken()).not.toBe(t);
  });

  it("answers a wrong code exactly as a real challenge does, then ends after the same number of tries", () => {
    let token = newDecoyToken();
    for (let i = 1; i < MAX_CODE_TRIES; i++) {
      const a = decoyAnswer(token, "123456");
      const left = MAX_CODE_TRIES - i;
      expect(a.message).toBe(`That code is not right. ${left} more ${left === 1 ? "try" : "tries"}.`);
      expect(a.restart).toBeFalsy();
      token = a.token!;
    }
    const last = decoyAnswer(token, "123456");
    expect(last.message).toBe("Too many wrong codes. This code no longer works. Sign in again to get a new one.");
    expect(last.restart).toBe(true);
  });

  it("asks for 6 digits like a real challenge, without using a try", () => {
    const token = newDecoyToken();
    const a = decoyAnswer(token, "12");
    expect(a.message).toBe("Type the 6 digits of the code.");
    expect(a.token).toBe(token);
  });

  it("names no contact on the first code page, for real and unknown logins alike", () => {
    expect(CODE_SIGN_IN_SENT_TO).not.toMatch(/\d|•/);
  });
});
