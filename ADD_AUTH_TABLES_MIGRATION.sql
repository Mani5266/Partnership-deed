-- ============================================================================
-- ADD_AUTH_TABLES_MIGRATION.sql
-- Partnership Deed Generator — Email Verification & Password Reset tables
-- 
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- These tables support the custom email verification and password reset flows.
-- ============================================================================

-- ── 1. Email Verifications ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_verifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for token lookup (the main query path)
CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash
  ON public.email_verifications (token_hash);

-- Index for cleanup queries (delete old tokens for a user)
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id
  ON public.email_verifications (user_id);

-- RLS: enable + force
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications FORCE ROW LEVEL SECURITY;

-- Revoke all from anon (tokens are managed server-side via service_role)
REVOKE ALL ON public.email_verifications FROM anon;

-- Grant to authenticated (not strictly needed since service_role bypasses RLS,
-- but follows the project convention)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO authenticated;

-- RLS policy: users can only see their own verification rows
CREATE POLICY "Users can view own verifications"
  ON public.email_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated — all token ops go through
-- the service_role admin client (which bypasses RLS).

-- Disable realtime (contains sensitive token hashes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'email_verifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.email_verifications;
  END IF;
END $$;


-- ── 2. Password Resets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.password_resets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON public.password_resets (token_hash);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id
  ON public.password_resets (user_id);

-- RLS: enable + force
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets FORCE ROW LEVEL SECURITY;

-- Revoke all from anon
REVOKE ALL ON public.password_resets FROM anon;

-- Grant to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_resets TO authenticated;

-- RLS policy: users can only see their own reset rows
CREATE POLICY "Users can view own password resets"
  ON public.password_resets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Disable realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'password_resets'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.password_resets;
  END IF;
END $$;


-- ── 3. Cleanup: Auto-expire old tokens (optional) ──────────────────────────
-- You can schedule this as a Supabase cron job or pg_cron extension.
-- Uncomment if you want automatic cleanup:

-- DELETE FROM public.email_verifications WHERE expires_at < now();
-- DELETE FROM public.password_resets WHERE expires_at < now();


-- ============================================================================
-- DONE! Both tables are ready.
-- The app uses service_role (admin client) for all token operations,
-- so these tables work immediately without additional grants.
-- ============================================================================
