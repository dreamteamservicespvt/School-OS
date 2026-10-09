import { testEnv } from "./test-env";

const env = testEnv();
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.MIGRATION_DATABASE_URL = env.MIGRATION_DATABASE_URL;
process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
