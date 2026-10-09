import { defineConfig } from "prisma/config";

// Prisma does not read .env by itself when this file exists.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: the environment (CI, hosting) provides the values.
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/schema/migrations",
    // react-server: module code marked "server-only" can run in the seed.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
});
