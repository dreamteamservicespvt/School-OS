// Vercel's build command (vercel.json). On a real deployment it is just
// `next build`. On the Vercel test copy (src/lib/test-copy-env.ts) it first
// makes the two database roles in the attached Neon database, builds the
// tables and loads the demo school, then builds the app.
//   npx tsx scripts/vercel-build.ts
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testCopySettings } from "../src/lib/test-copy-env";

function run(cmd: string, env: NodeJS.ProcessEnv) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
}

async function makeRoles(ownerUrl: string, ownerPassword: string, appPassword: string) {
  const db = new PrismaClient({ datasourceUrl: ownerUrl });
  const role = (name: string, password: string) => `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN
        CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}';
      ELSE
        ALTER ROLE ${name} WITH LOGIN PASSWORD '${password}';
      END IF;
    END $$;`;
  try {
    // The passwords are hex, so they are safe inside the quotes.
    await db.$executeRawUnsafe(role("school_os_owner", ownerPassword));
    await db.$executeRawUnsafe(role("school_os_app", appPassword));
    const [{ name }] = await db.$queryRawUnsafe<{ name: string }[]>("SELECT current_database() AS name");
    await db.$executeRawUnsafe(`GRANT CONNECT, CREATE ON DATABASE "${name}" TO school_os_owner`);
    await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${name}" TO school_os_app`);
    await db.$executeRawUnsafe("GRANT USAGE, CREATE ON SCHEMA public TO school_os_owner");
    await db.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO school_os_app");
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const settings = testCopySettings();
  if (settings) {
    console.log("School OS test copy: setting up the database and the demo school.");
    await makeRoles(settings.ownerUrl, settings.ownerPassword, settings.appPassword);
    const env = { ...process.env, ...settings.env };
    run("npx prisma migrate deploy", env);
    // The demo seed refuses to run in production; this database is a demo.
    // Only into a new database: a demo the Owner deleted is not brought back.
    run("npx prisma db seed", { ...env, NODE_ENV: "development", SEED_ONLY_EMPTY_DATABASE: "1" });
  }
  // DREAM TEAM's own Owner login for the console, when its settings are given
  // (scripts/console-owner.ts). Added once; later deploys change nothing.
  if (process.env.CONSOLE_OWNER_PHONE) {
    run("npx tsx --conditions=react-server scripts/console-owner.ts", settings ? { ...process.env, ...settings.env } : process.env);
  }
  run("npx next build", { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=6144" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
