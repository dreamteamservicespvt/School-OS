import { tmpdir } from "node:os";
import { testEnv } from "./test-env";

const env = testEnv();
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.MIGRATION_DATABASE_URL = env.MIGRATION_DATABASE_URL;
process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
// Files uploaded by tests go to a temporary folder, never into the project.
process.env.STORAGE_DIR ??= `${tmpdir()}/school-os-test-storage`;
