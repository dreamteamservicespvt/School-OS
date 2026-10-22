// Copies every school's new files to the backup place now, instead of waiting
// for the worker's hourly run (08-platform-security.md §4).
//   npm run backup:files
// Needs BACKUP_FILES_DIR or BACKUP_S3_BUCKET (README.md, "Backups").
import { prisma, withSchool } from "../src/lib/db";
import { backupFiles } from "../src/lib/backup/files";
import { backupStore } from "../src/lib/storage";

async function main() {
  if (!backupStore()) throw new Error("No backup place is set up. Set BACKUP_FILES_DIR (a folder) or BACKUP_S3_BUCKET.");
  const schools = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM active_school_ids()`;
  let copied = 0;
  let problems = 0;
  for (const s of schools) {
    const ctx = { schoolId: s.id, userId: null };
    for (;;) {
      const r = await withSchool(ctx, (tx) => backupFiles(tx, ctx), { timeout: 600_000 });
      copied += r.copied;
      problems += r.missing + r.changed + r.failed;
      if (r.copied === 0 || r.left === 0) break;
    }
  }
  console.log(`Files copied: ${copied} for ${schools.length} schools. Problems: ${problems}.`);
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
