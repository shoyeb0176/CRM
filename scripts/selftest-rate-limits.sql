-- Self-check for the call limits (0039). Run on a TEST database after `bun run db:migrate`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/selftest-rate-limits.sql
-- One transaction, rolled back. Prints "rate limits selftest: ok" or raises.
BEGIN;

DO $$
DECLARE _ok boolean;
BEGIN
  -- Two calls allowed per window, the third refused; another key has its own count.
  IF NOT public.hit_rate_limit('test:a', 2, 60) THEN RAISE EXCEPTION 'first call refused'; END IF;
  IF NOT public.hit_rate_limit('test:a', 2, 60) THEN RAISE EXCEPTION 'second call refused'; END IF;
  IF public.hit_rate_limit('test:a', 2, 60) THEN RAISE EXCEPTION 'third call allowed'; END IF;
  IF NOT public.hit_rate_limit('test:b', 2, 60) THEN RAISE EXCEPTION 'other key refused'; END IF;

  -- Signed-in users and visitors can't call it or read the counters.
  IF has_function_privilege('authenticated', 'public.hit_rate_limit(text, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hit_rate_limit(text, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hit_rate_limit is callable from the browser';
  END IF;
  IF has_table_privilege('authenticated', 'public.rate_limits', 'SELECT') OR has_table_privilege('anon', 'public.rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'rate_limits is readable from the browser';
  END IF;

  RAISE NOTICE 'rate limits selftest: ok';
END $$;

ROLLBACK;
