-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTNERSHIP DEED — Setup for Networth Supabase
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Run this in your Networth Supabase SQL Editor.
-- This adds the Partnership Deed app tables to your existing Supabase project
-- that already has auth + RLS set up (clients, certificates, documents tables).
--
-- What this creates:
--   Table:    deeds (with user_id + RLS from the start)
--   Bucket:   deed-docs (private)
--   Policies: 4 table RLS + 2 storage RLS
--   Function: cleanup_old_deeds(), update_updated_at_column()
--   Indexes:  user_id, created_at
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT throughout.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Extensions (likely already enabled in your Supabase)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Shared trigger function — update_updated_at_column()
-- If your networth tables already use this, CREATE OR REPLACE is harmless.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create the deeds table (with user_id baked in)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Auth: each deed belongs to a user
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Deed data
    business_name TEXT NOT NULL DEFAULT '',
    partner1_name TEXT NOT NULL DEFAULT '',
    partner2_name TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    doc_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Columns explained:
--   id            — UUID primary key (auto-generated)
--   user_id       — Owner of this deed (references auth.users)
--   business_name — M/s. business name for quick display
--   partner1_name — First partner name (for sidebar display)
--   partner2_name — Second partner name (for sidebar display)
--   payload       — JSONB blob containing ALL form data (N-partner arrays, clauses, etc.)
--   doc_url       — Storage path to generated .docx file
--   created_at    — Auto-set on insert
--   updated_at    — Auto-updated via trigger


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Indexes for performance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_deeds_user_id ON public.deeds(user_id);
CREATE INDEX IF NOT EXISTS idx_deeds_created_at ON public.deeds(created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop first to avoid "trigger already exists" error on re-run
DROP TRIGGER IF EXISTS update_deeds_updated_at ON public.deeds;

CREATE TRIGGER update_deeds_updated_at
    BEFORE UPDATE ON public.deeds
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Enable Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.deeds ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: RLS Policies — each user can only access their own deeds
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing policies first (safe re-run)
DROP POLICY IF EXISTS "Users can view own deeds" ON public.deeds;
DROP POLICY IF EXISTS "Users can create own deeds" ON public.deeds;
DROP POLICY IF EXISTS "Users can update own deeds" ON public.deeds;
DROP POLICY IF EXISTS "Users can delete own deeds" ON public.deeds;

-- SELECT: users can only see their own deeds
CREATE POLICY "Users can view own deeds"
  ON public.deeds FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can only create deeds for themselves
CREATE POLICY "Users can create own deeds"
  ON public.deeds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can only update their own deeds
CREATE POLICY "Users can update own deeds"
  ON public.deeds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own deeds
CREATE POLICY "Users can delete own deeds"
  ON public.deeds FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: Storage Bucket — deed-docs (private)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'deed-docs',
    'deed-docs',
    false,
    10485760,  -- 10MB limit
    ARRAY[
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Storage RLS Policies — user-scoped file access
-- Storage path convention: deeds/{user_id}/{deed_id}/filename.docx
-- Each policy ensures users can ONLY access files under their own folder.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing storage policies for deed-docs (safe re-run)
DROP POLICY IF EXISTS "Users can upload to deed-docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own deed-docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own deed-docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own deed-docs" ON storage.objects;

-- Upload: users can only upload to their own folder (deeds/{user_id}/...)
CREATE POLICY "Users can upload to deed-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Download: users can only read files from their own folder
CREATE POLICY "Users can view own deed-docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Update/overwrite: users can only overwrite their own files
CREATE POLICY "Users can update own deed-docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Delete: users can only delete their own files
CREATE POLICY "Users can delete own deed-docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'deeds'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: Data Retention — cleanup_old_deeds() function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_deeds(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.deeds
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock down: only postgres/service_role can execute this function.
-- Prevents any authenticated user from deleting all deeds via this function.
REVOKE EXECUTE ON FUNCTION cleanup_old_deeds(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_old_deeds(INTEGER) FROM authenticated;

-- Optional: schedule automatic cleanup (uncomment to enable)
-- Runs daily at 3 AM UTC, deletes deeds older than 90 days.
-- SELECT cron.schedule('cleanup-old-deeds', '0 3 * * *', 'SELECT cleanup_old_deeds(90)');


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — Run these after setup to confirm everything works
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Check deeds table exists:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'deeds' AND table_schema = 'public'
--    ORDER BY ordinal_position;
--
-- 2. Check RLS is enabled:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public' AND tablename = 'deeds';
--
-- 3. Check RLS policies exist:
--    SELECT policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'deeds';
--
-- 4. Check storage bucket exists:
--    SELECT id, name, public, file_size_limit
--    FROM storage.buckets
--    WHERE id = 'deed-docs';
--
-- 5. Check indexes exist:
--    SELECT indexname, indexdef
--    FROM pg_indexes
--    WHERE tablename = 'deeds';
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Your Partnership Deed app is ready to use with this Supabase project.
-- 
-- Backend note: The service_role key bypasses RLS automatically.
-- Frontend note: The anon key + user JWT will enforce RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
