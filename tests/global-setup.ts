// Rebuilds the test database from the migrations before the tests run, the
// same way a real database is built.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testEnv } from "./test-env";

export default async function setup() {
  const env = testEnv();
  const owner = new PrismaClient({ datasourceUrl: env.MIGRATION_DATABASE_URL });
  await owner.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await owner.$executeRawUnsafe("CREATE SCHEMA public");
  await owner.$disconnect();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...env } });
}
