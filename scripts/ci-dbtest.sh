#!/usr/bin/env bash
# Apply every migration to an empty Supabase Postgres, then run every scripts/selftest-*.sql.
# Stops at the first failure. Used by CI (a supabase/postgres service container):
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun run test:db
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to an EMPTY test database (never production)}"
cd "$(dirname "$0")/.."
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

# The image finishes its own setup just after it starts accepting connections.
for i in $(seq 1 60); do
  [ "$("${PSQL[@]}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'" 2>/dev/null)" = "1" ] && break
  sleep 2
done

# Columns the hosted platform adds that the bare image lacks.
"${PSQL[@]}" -c "ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_size_limit bigint, ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;"

bash scripts/db-migrate.sh

for f in scripts/selftest-*.sql; do
  out=$("${PSQL[@]}" -f "$f" 2>&1) || { echo "$out"; echo "FAILED: $f"; exit 1; }
  echo "$out" | grep -o "[a-z0-9 ]*selftest: ok" || { echo "$out"; echo "FAILED: $f printed no ok line"; exit 1; }
done
