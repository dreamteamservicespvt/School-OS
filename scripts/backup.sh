#!/usr/bin/env bash
# Extra nightly logical backup (08-platform-security.md §4). The database
# service's own point-in-time recovery is the main backup; this is a second,
# independent copy. Needs pg_dump, gpg and the aws CLI. Files are copied by
# the worker (schedule "file-backup"); see README.md, "Backups".
#   BACKUP_DATABASE_URL=... BACKUP_BUCKET=s3://... BACKUP_GPG_RECIPIENT=ops@... scripts/backup.sh
# BACKUP_DATABASE_URL must be a login that reads past row-level security
# (BYPASSRLS): the owner login cannot dump school tables, which force it.
set -euo pipefail
: "${MIGRATION_DATABASE_URL:?Set MIGRATION_DATABASE_URL}"
: "${BACKUP_BUCKET:?Set BACKUP_BUCKET}"
: "${BACKUP_GPG_RECIPIENT:?Set BACKUP_GPG_RECIPIENT}"
dump_url="${BACKUP_DATABASE_URL:-$MIGRATION_DATABASE_URL}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/tmp/school-os-${stamp}.dump.gpg"
pg_dump --format=custom --no-owner "$dump_url" | gpg --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --trust-model always > "$file"
aws s3 cp "$file" "${BACKUP_BUCKET}/nightly/school-os-${stamp}.dump.gpg"
rm -f "$file"
# Every school sees this time in Settings, Data Backup & Security ("Last backup").
psql "$MIGRATION_DATABASE_URL" -q -c "INSERT INTO backup_run (id, kind, location) VALUES (gen_random_uuid(), 'nightly', '${BACKUP_BUCKET}/nightly/school-os-${stamp}.dump.gpg')"
echo "Backup uploaded: school-os-${stamp}"
