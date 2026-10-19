-- 0039 (DB-19): limits on how often the public endpoints can be called (public forms, the contact
-- form, the REST API, MCP, the streaming assistant). One counter row per key per time window.
-- Only the server (service role) reads or writes it.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- Counts one call for _key in the current window; true while the count is within _max.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(_key text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  _hits integer;
BEGIN
  INSERT INTO public.rate_limits (key, window_start, hits) VALUES (_key, _start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO _hits;
  -- Now and then, clear windows older than a day.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN _hits <= _max;
END $$;
REVOKE EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO service_role;
