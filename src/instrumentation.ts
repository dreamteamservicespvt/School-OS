// Every server error is recorded (without personal details) so DREAM TEAM is
// alerted when errors rise (08-platform-security.md §11).
import type { Instrumentation } from "next";

// The Vercel test copy works out its settings before the first request
// (src/lib/test-copy-env.ts). Anywhere else this does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { applyTestCopyEnv } = await import("./lib/test-copy-env");
  applyTestCopyEnv();
  // Signing keys should not be the encryption key (08-platform-security.md §3). Not stopped
  // here, because links already sent are signed with it; DREAM TEAM sets these before go-live.
  if (process.env.NODE_ENV === "production") {
    const missing = ["FILE_LINK_SECRET", "PARENT_LINK_SECRET"].filter((k) => !process.env[k]);
    if (missing.length) console.warn(JSON.stringify({ level: "warn", event: "signing-key-missing", keys: missing, note: "FIELD_ENCRYPTION_KEY is signing links too. Set these before the first school goes live." }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/errors");
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : null;
  await recordError({ source: "server", where: `${request.method} ${request.path}`, error, digest });
};
