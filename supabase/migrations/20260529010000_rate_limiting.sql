-- Rate limiting (Postgres-backed, fixed-window) for public API routes.
--
-- Provides a single-call, atomic counter keyed by an arbitrary bucket string
-- (e.g. "register:1.2.3.4"). Used by the Next.js API routes via RPC to throttle
-- abuse / enumeration / spam without an external service.

-- Counters are short-lived; UNLOGGED avoids WAL overhead.
CREATE UNLOGGED TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Only the service-role API touches this table.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic fixed-window check. Returns TRUE when the request is allowed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max INT,
  p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ :=
    to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count INT;
BEGIN
  INSERT INTO rate_limits(bucket_key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Purge stale windows every 10 minutes (requires pg_cron).
-- Enable once: CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-rate-limits',
      '*/10 * * * *',
      $cleanup$ DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour' $cleanup$
    );
  END IF;
END;
$$;
