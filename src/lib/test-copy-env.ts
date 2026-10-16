// Vercel test copy (deploy/vercel/README.md). When School OS is imported into
// Vercel with only a Neon database attached, the settings it needs are worked
// out from that database's password: the two database roles' passwords and
// connections, the encryption and link keys, file storage and the address.
//
// It switches itself on only on Vercel and only when neither
// MIGRATION_DATABASE_URL nor FIELD_ENCRYPTION_KEY is set, so a real deployment
// that sets its own settings (docs/DEPLOYMENT.md) never uses it.

import { createHmac } from "node:crypto";

const MARK = "SCHOOL_OS_TEST_COPY_SOURCE";

/** The database connection Vercel's Neon integration added, as its owner. */
function ownerUrl(env: NodeJS.ProcessEnv): string | null {
  return env[MARK] || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL || null;
}

export function isTestCopy(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[MARK]) return true;
  return env.VERCEL === "1" && !env.MIGRATION_DATABASE_URL && !env.FIELD_ENCRYPTION_KEY && ownerUrl(env) !== null;
}

export type TestCopySettings = {
  /** The connection Vercel gave, as the database's owner. Only for creating the two roles. */
  ownerUrl: string;
  ownerPassword: string;
  appPassword: string;
  env: Record<string, string>;
};

export function testCopySettings(env: NodeJS.ProcessEnv = process.env): TestCopySettings | null {
  if (!isTestCopy(env)) return null;
  const source = ownerUrl(env)!;
  const base = new URL(source);
  const secret = decodeURIComponent(base.password);
  if (!secret) throw new Error("The database connection Vercel added has no password.");
  const derive = (label: string) => createHmac("sha256", secret).update(`school-os-test-copy:${label}`).digest();

  const ownerPassword = derive("owner-role").toString("hex");
  const appPassword = derive("app-role").toString("hex");
  const as = (user: string, password: string, limit?: number) => {
    const u = new URL(source);
    u.username = user;
    u.password = password;
    if (limit) u.searchParams.set("connection_limit", String(limit));
    return u.toString();
  };

  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  return {
    ownerUrl: source,
    ownerPassword,
    appPassword,
    env: {
      [MARK]: source,
      DATABASE_URL: as("school_os_app", appPassword, 3),
      MIGRATION_DATABASE_URL: as("school_os_owner", ownerPassword),
      FIELD_ENCRYPTION_KEY: env.FIELD_ENCRYPTION_KEY || derive("field-key").toString("base64"),
      PARENT_LINK_SECRET: env.PARENT_LINK_SECRET || derive("parent-link").toString("base64"),
      FILE_LINK_SECRET: env.FILE_LINK_SECRET || derive("file-link").toString("base64"),
      // Vercel's disk is read-only apart from /tmp, and /tmp is not shared
      // between copies of the app: files added here may not open later.
      STORAGE_DIR: env.STORAGE_DIR || "/tmp/school-os-files",
      DEMO_PASSWORD: env.DEMO_PASSWORD || "SchoolOS@2026",
      ...(env.APP_URL || !host ? {} : { APP_URL: `https://${host}` }),
    },
  };
}

/** Puts the worked-out settings into process.env. Safe to call more than once. */
export function applyTestCopyEnv(): boolean {
  const settings = testCopySettings();
  if (!settings) return false;
  Object.assign(process.env, settings.env);
  return true;
}
