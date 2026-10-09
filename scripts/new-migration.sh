#!/usr/bin/env bash
# Makes a new numbered migration from the changes in prisma/schema/*.prisma.
#   npm run db:new-migration -- add_fee_heads
#
# It compares the schema files with your local database (which must have all
# earlier migrations applied), writes the SQL, and adds the school walls
# (row-level security) to every new table that has a school_id column.
# Read the SQL before committing it.
set -euo pipefail
name="${1:?Give the migration a name, e.g. add_fee_heads}"
dir="prisma/schema/migrations/$(date -u +%Y%m%d%H%M%S)_${name}"
mkdir -p "$dir"
npx prisma migrate diff --from-schema-datasource prisma/schema --to-schema-datamodel prisma/schema --script 2>/dev/null > "$dir/migration.sql"

if ! grep -q '[A-Za-z]' "$dir/migration.sql" || grep -q "This is an empty migration" "$dir/migration.sql"; then
  rm -r "$dir"
  echo "No schema changes found."
  exit 0
fi

node scripts/add-school-walls.mjs "$dir/migration.sql"
echo "Wrote $dir/migration.sql"
echo "Apply it with: npm run db:migrate"
