// Rebuilds the test database from the migrations before the tests run, the
// same way a real database is built.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testEnv } from "./test-env";

export default async function setup() {
  // A lowercase Windows drive ("d:\...", as Git Bash gives) makes Vitest load its runner twice and
  // every file fails with "reading 'config'" / "failed to find the current suite". Stop at once.
  if (/^[a-z]:/.test(process.cwd())) {
    throw new Error(`Start the tests from a folder spelled with a capital drive letter (${process.cwd().slice(0, 2).toUpperCase()}\\...), e.g. node qa/vitest-worker.mjs <n>.`);
  }
  const env = testEnv();
  const owner = new PrismaClient({ datasourceUrl: env.MIGRATION_DATABASE_URL });
  await owner.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await owner.$executeRawUnsafe("CREATE SCHEMA public");
  await owner.$disconnect();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...env } });
}
