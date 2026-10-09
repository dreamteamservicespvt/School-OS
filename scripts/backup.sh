#!/usr/bin/env bash
# Extra nightly logical backup (08-platform-security.md §4). The database
# service's own point-in-time recovery is the main backup; this is a second,
# independent copy. Needs pg_dump, gpg and the aws CLI.
#   BACKUP_BUCKET=s3://... BACKUP_GPG_RECIPIENT=ops@... scripts/backup.sh
set -euo pipefail
: "${MIGRATION_DATABASE_URL:?Set MIGRATION_DATABASE_URL}"
: "${BACKUP_BUCKET:?Set BACKUP_BUCKET}"
: "${BACKUP_GPG_RECIPIENT:?Set BACKUP_GPG_RECIPIENT}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/tmp/school-os-${stamp}.dump.gpg"
pg_dump --format=custom --no-owner "$MIGRATION_DATABASE_URL" | gpg --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --trust-model always > "$file"
aws s3 cp "$file" "${BACKUP_BUCKET}/nightly/school-os-${stamp}.dump.gpg"
rm -f "$file"
echo "Backup uploaded: school-os-${stamp}"
