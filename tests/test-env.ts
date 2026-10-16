// The tests run against their own database (<name>_test), never the
// everyday one. In CI the URLs come from the workflow; locally from .env.
import { existsSync } from "node:fs";

export function testEnv(): { DATABASE_URL: string; MIGRATION_DATABASE_URL: string } {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const toTest = (url: string | undefined, name: string) => {
    if (!url) throw new Error(`${name} is not set. Copy .env.example to .env.`);
    const u = new URL(url);
    // school_os -> school_os_test; a worker's school_os_w2 -> school_os_w2_test.
    u.pathname = `${u.pathname.replace(/_test$/, "")}_test`;
    return u.toString();
  };
  return {
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? toTest(process.env.DATABASE_URL, "DATABASE_URL"),
    MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL ?? toTest(process.env.MIGRATION_DATABASE_URL, "MIGRATION_DATABASE_URL"),
  };
}
