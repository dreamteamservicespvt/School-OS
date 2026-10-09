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
    seed: "tsx prisma/seed.ts",
  },
});
