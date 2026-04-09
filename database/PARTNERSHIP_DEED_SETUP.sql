-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTNERSHIP DEED GENERATOR — Complete Database Setup
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- For: Fresh Supabase project (standalone, not shared with other apps)
-- Auth: Supabase Auth (email/password)
-- Security: Full RLS — every user can only access their own data
--
-- What this creates:
--   1 Table:     deeds (with user_id + RLS)
--   1 Bucket:    deed-docs (private, 10MB, user-scoped storage policies)
--   4 Table RLS: SELECT, INSERT, UPDATE, DELETE — all scoped to auth.uid()
--   4 Storage RLS: INSERT, SELECT, UPDATE, DELETE — all scoped to user folder
--   1 Trigger:   auto-update updated_at on row changes
--   1 Function:  cleanup_old_deeds() — locked down to service_role only
--   2 Indexes:   user_id, (user_id + created_at)
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
--   4. Then go to Dashboard > Storage and create bucket manually (see Step 8 note)
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS, DROP IF EXISTS, CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Trigger function — auto-update updated_at on any row change
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create the deeds table
-- ─────────────────────────────────────────────────────────────────────────────
-- Every deed belongs to a user (user_id is NOT NULL).
-- ON DELETE CASCADE: if a user is deleted from auth.users, their deeds go too.

CREATE TABLE IF NOT EXISTS public.deeds (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT        NOT NULL DEFAULT '',
    partner1_name TEXT        NOT NULL DEFAULT '',
    partner2_name TEXT        NOT NULL DEFAULT '',
    payload       JSONB       NOT NULL DEFAULT '{}',
    doc_url       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Column reference:
--   id            — auto-generated UUID primary key
--   user_id       — owner (references auth.users, enforced by RLS)
--   business_name — M/s. firm name for sidebar display
--   partner1_name — first partner name (legacy, for quick display)
--   partner2_name — second partner name (legacy, for quick display)
--   payload       — JSONB: ALL form data (partners[], clauses, dates, etc.)
--   doc_url       — storage path: deeds/{user_id}/{deed_id}/filename.docx
--   created_at    — set once on insert
--   updated_at    — auto-updated via trigger on every change


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- Composite index for the most common query: "get my deeds, newest first"

CREATE INDEX IF NOT EXISTS idx_deeds_user_id
  ON public.deeds(user_id);

CREATE INDEX IF NOT EXISTS idx_deeds_user_created
  ON public.deeds(user_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Auto-update trigger on updated_at
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_deeds_updated_at ON public.deeds;

CREATE TRIGGER update_deeds_updated_at
    BEFORE UPDATE ON public.deeds
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Enable Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
-- With RLS enabled + policies below:
--   - Frontend (anon key + JWT): automatically filtered to user's own rows
--   - Backend (service_role key): bypasses RLS (Supabase default behavior)

ALTER TABLE public.deeds ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (extra safety — prevents accidental bypass)
ALTER TABLE public.deeds FORCE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Table RLS Policies — user can only touch their own deeds
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "deed_select_own" ON public.deeds;
DROP POLICY IF EXISTS "deed_insert_own" ON public.deeds;
DROP POLICY IF EXISTS "deed_update_own" ON public.deeds;
DROP POLICY IF EXISTS "deed_delete_own" ON public.deeds;

-- SELECT: only your deeds
CREATE POLICY "deed_select_own"
  ON public.deeds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: can only insert with your own user_id
CREATE POLICY "deed_insert_own"
  ON public.deeds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: can only update your own deeds, cannot change user_id to someone else
CREATE POLICY "deed_update_own"
  ON public.deeds FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: can only delete your own deeds
CREATE POLICY "deed_delete_own"
  ON public.deeds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: Storage Bucket — deed-docs (private)
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: If this fails due to Supabase restrictions on storage.buckets,
-- create the bucket manually:
--   Dashboard > Storage > New Bucket > name: "deed-docs" > Private > Create
--
-- The SQL below works on most Supabase projects:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'deed-docs',
    'deed-docs',
    false,                -- private bucket
    10485760,             -- 10MB max file size
    ARRAY[
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Storage RLS Policies — user-scoped file access
-- ─────────────────────────────────────────────────────────────────────────────
-- Storage path convention: deeds/{user_id}/{deed_id}/filename.docx
--
-- Each policy checks:
--   1. bucket_id = 'deed-docs'          (only this bucket)
--   2. auth.uid() IS NOT NULL           (must be logged in)
--   3. folder path contains user's ID   (can't access other users' files)
--
-- The backend uses service_role key which bypasses these policies.
-- These policies protect the frontend (anon key + JWT) access.

DROP POLICY IF EXISTS "deed_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "deed_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "deed_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "deed_storage_delete" ON storage.objects;

-- Upload: only to your own folder
CREATE POLICY "deed_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deed-docs'
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Download: only from your own folder
CREATE POLICY "deed_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'deed-docs'
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Overwrite: only your own files
CREATE POLICY "deed_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'deed-docs'
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Delete: only your own files
CREATE POLICY "deed_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'deed-docs'
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: Revoke direct table access from anon role
-- ─────────────────────────────────────────────────────────────────────────────
-- The anon role should NOT have direct access to the deeds table.
-- Only authenticated users (with a valid JWT) should be able to query it.
-- This prevents any unauthenticated access even if RLS had a bug.

REVOKE ALL ON public.deeds FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deeds TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: Data Retention — cleanup function (service_role only)
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS.
-- We REVOKE execute from anon + authenticated so only postgres/service_role
-- can call it. This prevents any user from mass-deleting deeds.

CREATE OR REPLACE FUNCTION cleanup_old_deeds(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Safety: minimum 7 days retention to prevent accidental wipe
    IF retention_days < 7 THEN
        RAISE EXCEPTION 'retention_days must be >= 7 (got %)', retention_days;
    END IF;

    DELETE FROM public.deeds
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock down: only postgres/service_role can execute
REVOKE EXECUTE ON FUNCTION cleanup_old_deeds(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_old_deeds(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_old_deeds(INTEGER) FROM authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 12: Disable realtime for the deeds table (optional but recommended)
-- ─────────────────────────────────────────────────────────────────────────────
-- Partnership deeds don't need live subscriptions. Disabling realtime
-- prevents data leaks through Supabase's realtime broadcast system.

-- Remove deeds from realtime publication if it was added.
-- Wrapped in DO block to suppress error if table isn't in the publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.deeds;
EXCEPTION
  WHEN undefined_object THEN NULL;  -- table not in publication, ignore
  WHEN OTHERS THEN NULL;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — Run these manually after setup to confirm
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. Table exists with correct columns:
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'deeds'
--    ORDER BY ordinal_position;
--
-- 2. RLS is enabled + forced:
--    SELECT tablename, rowsecurity, forcerowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public' AND tablename = 'deeds';
--    -- rowsecurity = true, forcerowsecurity = true
--
-- 3. All 4 table policies exist:
--    SELECT policyname, cmd, roles
--    FROM pg_policies
--    WHERE tablename = 'deeds' ORDER BY policyname;
--    -- Should show: deed_delete_own, deed_insert_own, deed_select_own, deed_update_own
--    -- All with roles = {authenticated}
--
-- 4. Storage bucket exists:
--    SELECT id, name, public, file_size_limit
--    FROM storage.buckets WHERE id = 'deed-docs';
--    -- public = false, file_size_limit = 10485760
--
-- 5. All 4 storage policies exist:
--    SELECT policyname, cmd
--    FROM pg_policies
--    WHERE tablename = 'objects'
--      AND policyname LIKE 'deed_storage_%'
--    ORDER BY policyname;
--
-- 6. Indexes exist:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'deeds';
--    -- idx_deeds_user_id, idx_deeds_user_created
--
-- 7. Anon role has NO access:
--    SELECT grantee, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE table_name = 'deeds' AND grantee = 'anon';
--    -- Should return 0 rows
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Layer 1 (Database - RLS):
--   - deeds table: auth.uid() = user_id on all 4 operations
--   - Policies scoped to 'authenticated' role only (anon can't even query)
--   - FORCE ROW LEVEL SECURITY enabled (even table owner respects policies)
--
-- Layer 2 (Storage - RLS):
--   - Files scoped by folder path: deeds/{user_id}/{deed_id}/filename.docx
--   - Only authenticated users, only their own folder
--
-- Layer 3 (Backend - Application):
--   - service_role key (bypasses RLS) + manual .eq('user_id', req.user.id)
--   - JWT verified via supabaseAdmin.auth.getUser(token)
--
-- Layer 4 (Access Control):
--   - anon role revoked from deeds table entirely
--   - cleanup function revoked from anon + authenticated
--   - Realtime disabled for deeds table
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE. Your Partnership Deed database is production-ready.
-- ═══════════════════════════════════════════════════════════════════════════════
