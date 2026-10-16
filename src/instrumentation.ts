// Every server error is recorded (without personal details) so DREAM TEAM is
// alerted when errors rise (08-platform-security.md §11).
import type { Instrumentation } from "next";

// The Vercel test copy works out its settings before the first request
// (src/lib/test-copy-env.ts). Anywhere else this does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { applyTestCopyEnv } = await import("./lib/test-copy-env");
  applyTestCopyEnv();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/errors");
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : null;
  await recordError({ source: "server", where: `${request.method} ${request.path}`, error, digest });
};
