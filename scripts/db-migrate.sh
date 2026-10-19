#!/usr/bin/env bash
# Apply every database migration, in order, to a Supabase Postgres database.
#
#   DATABASE_URL="postgresql://postgres:<password>@<host>:5432/postgres" bun run db:migrate
#
# Order: supabase/migrations/* (the original schema), then drizzle/migrations/* (later changes).
# Each applied file is recorded in public._inuberry_migrations, so re-running only applies new files.
# Lovable re-files some migrations under a second number with identical SQL (e.g. 0019 → 0020_0019_…);
# a file whose SQL matches one already applied is recorded and skipped, never run twice.
# Needs: psql (PostgreSQL client), sha256sum.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database connection string}"
cd "$(dirname "$0")/.."

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS public._inuberry_migrations (
  file        text PRIMARY KEY,
  sha256      text NOT NULL,
  skipped     boolean NOT NULL DEFAULT false,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public._inuberry_migrations FROM anon, authenticated;
SQL

# Hash of the SQL with trailing whitespace on each line and trailing blank lines removed,
# so a CRLF, missing-final-newline or trailing-blank-line difference still counts as the same migration.
sql_hash() { awk '{ sub(/[ \t\r]+$/, "") } NF { while (b > 0) { print ""; b-- } print; next } { b++ }' "$1" | sha256sum | cut -d' ' -f1; }

applied=0; skipped=0
for f in $(ls supabase/migrations/*.sql | sort) $(ls drizzle/migrations/*.sql | sort); do
  name="$f"
  if [ "$("${PSQL[@]}" -tAc "SELECT 1 FROM public._inuberry_migrations WHERE file = '$name'")" = "1" ]; then
    continue
  fi
  hash=$(sql_hash "$f")
  if [ "$("${PSQL[@]}" -tAc "SELECT 1 FROM public._inuberry_migrations WHERE sha256 = '$hash' LIMIT 1")" = "1" ]; then
    "${PSQL[@]}" -c "INSERT INTO public._inuberry_migrations (file, sha256, skipped) VALUES ('$name', '$hash', true)"
    echo "skip   $name (same SQL as an earlier migration)"
    skipped=$((skipped + 1))
    continue
  fi
  echo "apply  $name"
  # One transaction per file: a failing file leaves the database as it was before that file.
  "${PSQL[@]}" --single-transaction -f "$f"
  "${PSQL[@]}" -c "INSERT INTO public._inuberry_migrations (file, sha256) VALUES ('$name', '$hash')"
  applied=$((applied + 1))
done

echo "Done: $applied applied, $skipped skipped as duplicates."
