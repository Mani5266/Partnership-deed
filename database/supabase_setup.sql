-- ═══════════════════════════════════════════════════════════════════
-- OnEasy — Partnership Deed Generator
-- Supabase Database Setup (NO AUTH — Open Access)
-- ═══════════════════════════════════════════════════════════════════

-- 1. DROP EXISTING TABLES (CAUTION: This deletes all data!)
DROP TABLE IF EXISTS public.deeds CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_deeds(INTEGER);

-- 2. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: deeds — Stores partnership deed form data and doc references
-- No auth, no user_id, no RLS — open access
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.deeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL DEFAULT '',
    partner1_name TEXT NOT NULL DEFAULT '',
    partner2_name TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    doc_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Columns explained:
--   id            — UUID primary key (auto-generated)
--   business_name — M/s. business name for quick display
--   partner1_name — Legacy: first partner name (backward compat)
--   partner2_name — Legacy: second partner name (backward compat)
--   payload       — JSONB blob containing ALL form data (N-partner arrays, clauses, etc.)
--   doc_url       — Storage path to generated .docx file
--   created_at    — Auto-set on insert
--   updated_at    — Auto-updated via trigger on every row change

-- NO RLS — open access (no authentication)
ALTER TABLE public.deeds DISABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_deeds_updated_at
    BEFORE UPDATE ON public.deeds
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════
-- DATA RETENTION — Cleanup old deeds (optional)
-- ═══════════════════════════════════════════════════════════════════

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

-- Schedule cleanup (run in SQL editor after setup):
-- SELECT cron.schedule('cleanup-old-deeds', '0 3 * * *', 'SELECT cleanup_old_deeds(90)');
-- Runs daily at 3 AM UTC, deletes deeds older than 90 days.

-- ═══════════════════════════════════════════════════════════════════
-- SUPABASE STORAGE BUCKET — Generated deed documents
-- ═══════════════════════════════════════════════════════════════════
-- Run these in the Supabase SQL editor:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('deed-docs', 'deed-docs', false);
--
-- Storage policies (no auth — allow all operations via service role on backend):
-- The backend uses the service_role key to upload files, so no RLS policies
-- are needed on storage. Downloads are done via the anon client.
--
-- If you want to allow public downloads, make the bucket public:
-- UPDATE storage.buckets SET public = true WHERE id = 'deed-docs';
--
-- Or add a permissive policy:
-- CREATE POLICY "Allow all access to deed-docs"
--   ON storage.objects
--   FOR ALL
--   USING (bucket_id = 'deed-docs')
--   WITH CHECK (bucket_id = 'deed-docs');
--
-- Files stored at: deeds/{deed_id}/{filename}.docx
