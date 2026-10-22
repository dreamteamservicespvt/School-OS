// The restore test (08-platform-security.md §4 "A restore is tested every
// month on a copy, and the result is recorded"; §16 Done when 3).
//   npm run restore:test                  dump the database now, restore it, check it
//   npm run restore:test -- --dump FILE   restore a backup file (decrypt it first)
// It restores into a scratch database named <database>_restore_test on the
// same server (never any other name), checks row counts per school and that
// every file a record points to is in the backup with the right checksum,
// writes a report, records the result for Data Backup & Security, and drops
// the scratch database again (unless --keep).
import "server-only";

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { backupStore, fileStore } from "../storage";
import { sha256 } from "./files";
import { checkFile, compareCounts, perSchool, type Counts, type RestoreProblem } from "./restore-check";

const run = promisify(execFile);

export type RestoreTestOptions = {
  /** The live database (its owner login is enough for the name; the admin login does the work). */
  sourceUrl: string;
  /** A login on the same server that may create databases and read past row-level security (BYPASSRLS), e.g. postgres. */
  adminUrl: string;
  /** A backup file to restore (pg_dump custom format). Without it, a fresh dump is made. */
  dump?: string;
  /** Folder with pg_dump and pg_restore, when they are not on PATH. */
  pgBin?: string;
  reportDir?: string;
  keep?: boolean;
  /** Write the result to backup_run (shown to every school). Off for trial runs. */
  record?: boolean;
  /** Most files to check (all when not given). */
  fileLimit?: number;
};

export type RestoreTestResult = {
  passed: boolean;
  target: string;
  schools: number;
  rowsPerSchool: Record<string, number>;
  files: { checked: number; ok: number; missing: number; changed: number; where: string };
  busyTables: number;
  problems: RestoreProblem[];
  reportFile: string | null;
  seconds: number;
};

function dbName(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}
function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(db)}`;
  return u.toString();
}
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The scratch database's name. Refuses anything that could be a real database. */
export function scratchName(source: string) {
  const target = `${source}_restore_test`;
  if (!/^[a-z0-9_]+$/i.test(source) || target === source || !target.endsWith("_restore_test")) throw new Error(`Refusing to restore next to "${source}"`);
  return target;
}

async function countRows(url: string): Promise<Counts> {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'school_id' ORDER BY 1`;
    const out: Counts = {};
    for (const { table_name } of tables) {
      const rows = await db.$queryRawUnsafe<{ s: string; n: bigint }[]>(`SELECT school_id::text AS s, count(*) AS n FROM public.${ident(table_name)} GROUP BY 1`);
      out[table_name] = Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
    }
    const schools = await db.$queryRaw<{ s: string }[]>`SELECT id::text AS s FROM school`;
    out.school = Object.fromEntries(schools.map((r) => [r.s, 1]));
    return out;
  } finally {
    await db.$disconnect();
  }
}

async function migrations(url: string) {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    return Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`)[0].n);
  } finally {
    await db.$disconnect();
  }
}

/** pg_dump and pg_restore take the password from PGPASSWORD, never from the command line. */
function pgArgs(url: string) {
  const u = new URL(url);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
  const args = ["--host", u.hostname, "--port", u.port || "5432", "--username", decodeURIComponent(u.username)];
  return { env, args };
}

export async function runRestoreTest(opts: RestoreTestOptions): Promise<RestoreTestResult> {
  const started = Date.now();
  const source = dbName(opts.sourceUrl);
  const target = scratchName(source);
  const adminSource = withDb(opts.adminUrl, source);
  const adminTarget = withDb(opts.adminUrl, target);
  const bin = (name: string) => (opts.pgBin ? path.join(opts.pgBin, name) : name);
  const problems: RestoreProblem[] = [];
  const work = await mkdtemp(path.join(tmpdir(), "school-os-restore-"));
  let before: Counts | null = null;
  let after: Counts | null = null;
  let restored: Counts = {};
  let busy = 0;
  const files = { checked: 0, ok: 0, missing: 0, changed: 0, where: "" };
  const admin = new PrismaClient({ datasourceUrl: withDb(opts.adminUrl, "postgres") });
  try {
    let dump = opts.dump;
    if (!dump) {
      dump = path.join(work, `${source}.dump`);
      before = await countRows(adminSource);
      const { env, args } = pgArgs(adminSource);
      await run(bin("pg_dump"), [...args, "--format=custom", "--no-owner", "--file", dump, source], { env, maxBuffer: 64 * 1024 * 1024 });
      after = await countRows(adminSource);
    }

    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${ident(target)} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${ident(target)}`);
    const { env, args } = pgArgs(adminTarget);
    try {
      await run(bin("pg_restore"), [...args, "--no-owner", "--dbname", target, dump], { env, maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      const text = (e as { stderr?: string }).stderr ?? (e instanceof Error ? e.message : String(e));
      problems.push({ kind: "restore", text: `pg_restore reported errors: ${text.trim().split("\n").slice(-3).join(" ").slice(0, 500)}` });
    }

    restored = await countRows(adminTarget);
    if (before && after) {
      const cmp = compareCounts(before, after, restored);
      problems.push(...cmp.problems);
      busy = cmp.busy;
      const [live, copy] = await Promise.all([migrations(adminSource), migrations(adminTarget)]);
      if (live !== copy) problems.push({ kind: "migrations", text: `The copy has ${copy} database changes applied; the live database has ${live}` });
    }

    // Every file a restored record points to must be in the backup, unchanged.
    const store = backupStore();
    files.where = store ? "backup" : "live storage (no backup place set up)";
    const fromStore = store ?? fileStore();
    const db = new PrismaClient({ datasourceUrl: adminTarget });
    try {
      const rows = await db.$queryRawUnsafe<{ school_id: string; storage_key: string; sha256: string | null }[]>(
        `SELECT school_id::text, storage_key, sha256 FROM stored_file WHERE archived_at IS NULL ORDER BY created_at${opts.fileLimit ? ` LIMIT ${Math.floor(opts.fileLimit)}` : ""}`,
      );
      for (const f of rows) {
        const body = await fromStore.get(f.storage_key);
        const outcome = checkFile(f.sha256, body ? sha256(body) : null);
        files.checked++;
        files[outcome]++;
        if (outcome !== "ok" && problems.filter((p) => p.kind === "file").length < 50) {
          problems.push({ kind: "file", text: `${outcome === "missing" ? "Missing" : "Changed"}: ${f.storage_key} (school ${f.school_id})` });
        }
      }
    } finally {
      await db.$disconnect();
    }
  } catch (e) {
    problems.push({ kind: "restore", text: e instanceof Error ? e.message.slice(0, 500) : String(e) });
  } finally {
    if (!opts.keep) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${ident(target)} WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
    await rm(work, { recursive: true, force: true });
  }

  const rowsPerSchool = perSchool(restored);
  const result: RestoreTestResult = {
    passed: problems.length === 0,
    target,
    schools: Object.keys(restored.school ?? {}).length,
    rowsPerSchool,
    files,
    busyTables: busy,
    problems,
    reportFile: null,
    seconds: Math.round((Date.now() - started) / 1000),
  };

  if (opts.reportDir) {
    await mkdir(opts.reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(opts.reportDir, `restore-test-${stamp}.md`);
    await writeFile(file, reportText(source, opts.dump ?? null, result));
    result.reportFile = file;
  }

  if (opts.record) {
    const live = new PrismaClient({ datasourceUrl: adminSource });
    try {
      const details = { schools: result.schools, rows: Object.values(rowsPerSchool).reduce((a, b) => a + b, 0), files: result.files, problems: problems.slice(0, 20), seconds: result.seconds };
      await live.$executeRaw`INSERT INTO backup_run (id, kind, finished_at, location, restore_tested_at, result, details)
        VALUES (${randomUUID()}::uuid, 'restore-test', now() AT TIME ZONE 'UTC', ${opts.dump ? path.basename(opts.dump) : "fresh dump"}, now() AT TIME ZONE 'UTC', ${result.passed ? "passed" : "failed"}, ${JSON.stringify(details)}::jsonb)`;
    } finally {
      await live.$disconnect();
    }
  }
  return result;
}

export function reportText(source: string, dump: string | null, r: RestoreTestResult) {
  const lines = [
    `# Restore test: ${r.passed ? "PASSED" : "FAILED"}`,
    "",
    `- When: ${new Date().toISOString()}`,
    `- Database: ${source}, restored into ${r.target} (${dump ? `from ${path.basename(dump)}` : "from a fresh dump"})`,
    `- Took: ${r.seconds} seconds`,
    `- Schools: ${r.schools}`,
    `- Files checked in the ${r.files.where}: ${r.files.checked} (${r.files.ok} right, ${r.files.missing} missing, ${r.files.changed} changed)`,
    r.busyTables ? `- ${r.busyTables} table and school pairs changed while the dump was made; their copies were checked against the range.` : "",
    "",
    "## Rows per school",
    "",
    "| School | Rows |",
    "|---|---|",
    ...Object.entries(r.rowsPerSchool).sort().map(([s, n]) => `| ${s} | ${n} |`),
    "",
    "## Problems",
    "",
    ...(r.problems.length ? r.problems.map((p) => `- ${p.kind}: ${p.text}`) : ["None."]),
    "",
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}
