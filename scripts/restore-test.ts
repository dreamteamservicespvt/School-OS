// Restore test (08-platform-security.md §4): restores a backup into a scratch
// database, checks rows per school and every file, and records the result.
//   npm run restore:test                      fresh dump of this database, then restore it
//   npm run restore:test -- --dump FILE       restore this backup file (decrypt a .gpg one first)
//   npm run restore:test -- --keep            keep the scratch database afterwards
//   npm run restore:test -- --no-record       do not record the result for the schools to see
// Settings (environment):
//   MIGRATION_DATABASE_URL  the live database (only its name and server are used)
//   RESTORE_ADMIN_URL       a login on the same server that may create databases and
//                           read past row-level security (BYPASSRLS). On this computer
//                           it defaults to the local "postgres" superuser.
//   PG_BIN                  folder with pg_dump and pg_restore, if not on PATH
//   RESTORE_REPORT_DIR      where the report goes (default: restore-reports)
//   BACKUP_FILES_DIR / BACKUP_S3_BUCKET  the file backup to check (see README, "Backups")
import { runRestoreTest } from "../src/lib/backup/restore-test";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const sourceUrl = process.env.MIGRATION_DATABASE_URL;
  if (!sourceUrl) throw new Error("Set MIGRATION_DATABASE_URL");
  let adminUrl = process.env.RESTORE_ADMIN_URL;
  if (!adminUrl) {
    const u = new URL(sourceUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname)) throw new Error("Set RESTORE_ADMIN_URL (a login that may create databases and has BYPASSRLS)");
    u.username = "postgres";
    u.password = "";
    adminUrl = u.toString();
  }
  const result = await runRestoreTest({
    sourceUrl,
    adminUrl,
    dump: value("--dump"),
    pgBin: process.env.PG_BIN,
    reportDir: process.env.RESTORE_REPORT_DIR ?? "restore-reports",
    keep: flag("--keep"),
    record: !flag("--no-record"),
  });
  console.log(`Restore test ${result.passed ? "PASSED" : "FAILED"}: ${result.schools} schools, ${result.files.checked} files checked (${result.files.missing} missing, ${result.files.changed} changed), ${result.seconds}s`);
  for (const p of result.problems.slice(0, 20)) console.log(`  - ${p.kind}: ${p.text}`);
  if (result.reportFile) console.log(`Report: ${result.reportFile}`);
  process.exit(result.passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
