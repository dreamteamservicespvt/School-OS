// Background jobs of backups (08-platform-security.md §4).
import "server-only";

import { defineSchedule } from "../jobs";
import { backupFiles } from "./files";

// New files are copied to the backup place every hour, so every file is in
// last night's backup at the latest. Does nothing until a backup place is set up.
defineSchedule("file-backup", 60, (tx, ctx, now) => backupFiles(tx, ctx, now), { ownTransaction: true, keepResult: true });
