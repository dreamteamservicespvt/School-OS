// "Forgot password? Sign in with a one-time code" at the same speed for every
// login, real or not (owner decision 2, 15 Nov 2026): the code is looked up,
// made and sent after the answer has gone, and the answers to a code typed on
// a blind code page (decoy.ts) take at least a fixed time. The rate limits
// stay on the sign-in actions.
import "server-only";

import { after } from "next/server";

/** The shortest time an answer about a blind code takes, so a real login's database work does not show. */
export const BLIND_FLOOR_MS = process.env.NODE_ENV === "test" ? 0 : 600;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `work`, then waits until at least `ms` have passed since it started (also when it throws, e.g. a redirect). */
export async function atLeast<T>(ms: number, work: () => Promise<T>, sleep: (ms: number) => Promise<void> = wait, now: () => number = Date.now): Promise<T> {
  const start = now();
  try {
    return await work();
  } finally {
    const left = ms - (now() - start);
    if (left > 0) await sleep(left);
  }
}

/**
 * Runs `work` after the answer has gone to the browser (Next.js after()), so
 * how long it takes, or whether it finds a login, never shows. Outside a
 * request (tests, scripts) it runs now. A failure is written to the log only.
 */
export async function afterAnswer(work: () => Promise<unknown>, schedule: (task: () => Promise<void>) => void = after): Promise<void> {
  const task = async () => {
    try {
      await work();
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "code-sign-in-after-answer-failed", error: e instanceof Error ? e.message : String(e) }));
    }
  };
  try {
    schedule(task);
  } catch {
    await task();
  }
}
