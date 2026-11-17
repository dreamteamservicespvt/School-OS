// Runs vitest against a worker's own test database, so two agents can test at once.
// Usage: node qa/vitest-worker.mjs <2|3> [vitest args...]   (database school_os_w<N>_test)
// The databases are made once with psql (see docs/HANDOFF.md). Never prints a URL.
import { spawnSync } from "node:child_process";

const [n, ...args] = process.argv.slice(2);
if (!/^[2-9]$/.test(n ?? "")) { console.error("First argument: worker number 2-9"); process.exit(2); }
process.loadEnvFile(".env");
const swap = (url) => { const u = new URL(url); u.pathname = `/school_os_w${n}_test`; return u.toString(); };
const env = { ...process.env, TEST_DATABASE_URL: swap(process.env.DATABASE_URL), TEST_MIGRATION_DATABASE_URL: swap(process.env.MIGRATION_DATABASE_URL) };
// Git Bash (and some terminals) hand Windows a lowercase drive ("d:\..."). Vitest then loads its
// runner twice (once as d:/..., once as D:/...), and every test file fails with "Cannot read
// properties of undefined (reading 'config')" or "Vitest failed to find the current suite/runner".
// Starting vitest from the same folder spelled with a capital drive letter keeps one copy.
const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const r = spawnSync("npx", ["vitest", "run", ...args], { stdio: "inherit", env, shell: true, cwd });
process.exit(r.status ?? 1);
