#!/bin/bash
# Read-only database check (as the postgres superuser, so row-level security does not hide rows).
# usage: bash qa/people/q.sh "<sql>"   — :cems in the SQL is replaced by the QA school's id.
CEMS=$(sudo -u postgres psql school_os -Atc "select id from school where code='CEMS'")
SQL="${1//:cems/\'$CEMS\'}"
sudo -u postgres psql school_os -At -F ' | ' -c "$SQL"
