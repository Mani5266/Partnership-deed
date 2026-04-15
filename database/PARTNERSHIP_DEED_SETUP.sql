-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTNERSHIP DEED GENERATOR — Complete Database Setup
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- For: Fresh Supabase project (standalone, not shared with other apps)
-- Auth: Supabase Auth (email/password)
-- Security: Full RLS — every user can only access their own data
--
-- What this creates:
--   4 Tables:    deeds, partners, deed_documents, business_addresses
--   1 Bucket:    deed-docs (private, 10MB, user-scoped storage policies)
--  16 Table RLS: SELECT, INSERT, UPDATE, DELETE — all scoped to auth.uid()
--   4 Storage RLS: INSERT, SELECT, UPDATE, DELETE — all scoped to user folder
--   1 Trigger:   auto-update updated_at on row changes
--   1 Function:  cleanup_old_deeds() — locked down to service_role only
--  10 Indexes:   across all tables for common queries
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
-- STEP 8: Partners table — structured partner data
-- ─────────────────────────────────────────────────────────────────────────────
-- Extracts the partners[] array from JSONB into a proper relational table.
-- Enables: query by partner name, DB-level capital/profit constraints.

CREATE TABLE IF NOT EXISTS public.partners (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    deed_id              UUID        NOT NULL REFERENCES public.deeds(id) ON DELETE CASCADE,
    ordinal              SMALLINT    NOT NULL,  -- 0=First Party, 1=Second Party, ...
    name                 TEXT        NOT NULL DEFAULT '',
    relation             TEXT        NOT NULL DEFAULT 'S/O',
    father_name          TEXT        NOT NULL DEFAULT '',
    age                  SMALLINT    CHECK (age IS NULL OR (age >= 0 AND age <= 150)),
    address              TEXT        NOT NULL DEFAULT '',
    capital_pct          NUMERIC(5,2) CHECK (capital_pct IS NULL OR (capital_pct >= 0 AND capital_pct <= 100)),
    profit_pct           NUMERIC(5,2) CHECK (profit_pct IS NULL OR (profit_pct >= 0 AND profit_pct <= 100)),
    is_managing_partner  BOOLEAN     NOT NULL DEFAULT false,
    is_bank_authorized   BOOLEAN     NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(deed_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_partners_deed_id
  ON public.partners(deed_id);
CREATE INDEX IF NOT EXISTS idx_partners_name
  ON public.partners(name);
CREATE INDEX IF NOT EXISTS idx_partners_deed_ordinal
  ON public.partners(deed_id, ordinal);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners_select_own" ON public.partners;
DROP POLICY IF EXISTS "partners_insert_own" ON public.partners;
DROP POLICY IF EXISTS "partners_update_own" ON public.partners;
DROP POLICY IF EXISTS "partners_delete_own" ON public.partners;

CREATE POLICY "partners_select_own"
  ON public.partners FOR SELECT TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "partners_insert_own"
  ON public.partners FOR INSERT TO authenticated
  WITH CHECK (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "partners_update_own"
  ON public.partners FOR UPDATE TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()))
  WITH CHECK (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "partners_delete_own"
  ON public.partners FOR DELETE TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

REVOKE ALL ON public.partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Deed documents table — version history for generated files
-- ─────────────────────────────────────────────────────────────────────────────
-- Each re-generate creates a new row instead of overwriting the previous file.
-- Storage path: deeds/{user_id}/{deed_id}/v{version}/filename.docx

CREATE TABLE IF NOT EXISTS public.deed_documents (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    deed_id       UUID        NOT NULL REFERENCES public.deeds(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path  TEXT        NOT NULL,
    file_name     TEXT        NOT NULL,
    file_size     INTEGER,
    version       SMALLINT    NOT NULL DEFAULT 1,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(deed_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deed_documents_deed_id
  ON public.deed_documents(deed_id);
CREATE INDEX IF NOT EXISTS idx_deed_documents_user_id
  ON public.deed_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_deed_documents_deed_version
  ON public.deed_documents(deed_id, version DESC);

ALTER TABLE public.deed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deed_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deed_docs_select_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_insert_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_update_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_delete_own" ON public.deed_documents;

CREATE POLICY "deed_docs_select_own"
  ON public.deed_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "deed_docs_insert_own"
  ON public.deed_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "deed_docs_update_own"
  ON public.deed_documents FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "deed_docs_delete_own"
  ON public.deed_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.deed_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deed_documents TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: Business addresses table — structured address with validation
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the 6 address fields (doorNo, buildingName, area, district, state, pincode).
-- full_address is auto-generated from the parts (replaces client-side composeAddress()).

CREATE TABLE IF NOT EXISTS public.business_addresses (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    deed_id        UUID        NOT NULL REFERENCES public.deeds(id) ON DELETE CASCADE,
    door_no        TEXT        NOT NULL DEFAULT '',
    building_name  TEXT        NOT NULL DEFAULT '',
    area           TEXT        NOT NULL DEFAULT '',
    district       TEXT        NOT NULL DEFAULT '',
    state          TEXT        NOT NULL DEFAULT '',
    pincode        TEXT        NOT NULL DEFAULT ''
                   CHECK (pincode = '' OR pincode ~ '^\d{6}$'),
    full_address   TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(deed_id)
);

-- Trigger function: auto-compose full_address from parts on every INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.compose_full_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.full_address := concat_ws(', ',
    NULLIF(TRIM(NEW.door_no), ''),
    NULLIF(TRIM(NEW.building_name), ''),
    NULLIF(TRIM(NEW.area), ''),
    NULLIF(TRIM(NEW.district), ''),
    NULLIF(TRIM(NEW.state), ''),
    CASE WHEN NEW.pincode ~ '^\d{6}$' THEN 'India - ' || NEW.pincode ELSE NULL END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compose_address ON public.business_addresses;
CREATE TRIGGER trg_compose_address
  BEFORE INSERT OR UPDATE ON public.business_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.compose_full_address();

CREATE INDEX IF NOT EXISTS idx_business_addresses_deed_id
  ON public.business_addresses(deed_id);
CREATE INDEX IF NOT EXISTS idx_business_addresses_pincode
  ON public.business_addresses(pincode) WHERE pincode != '';
CREATE INDEX IF NOT EXISTS idx_business_addresses_state
  ON public.business_addresses(state) WHERE state != '';

ALTER TABLE public.business_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_addresses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addr_select_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_insert_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_update_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_delete_own" ON public.business_addresses;

CREATE POLICY "addr_select_own"
  ON public.business_addresses FOR SELECT TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "addr_insert_own"
  ON public.business_addresses FOR INSERT TO authenticated
  WITH CHECK (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "addr_update_own"
  ON public.business_addresses FOR UPDATE TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()))
  WITH CHECK (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

CREATE POLICY "addr_delete_own"
  ON public.business_addresses FOR DELETE TO authenticated
  USING (deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid()));

REVOKE ALL ON public.business_addresses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_addresses TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: Storage Bucket — deed-docs (private)
-- ──────────────────────────────────────────────────────────────────────────────
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
-- STEP 12: Storage RLS Policies — user-scoped file access
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
-- STEP 13: Revoke direct table access from anon role
-- ─────────────────────────────────────────────────────────────────────────────
-- The anon role should NOT have direct access to the deeds table.
-- Only authenticated users (with a valid JWT) should be able to query it.
-- This prevents any unauthenticated access even if RLS had a bug.

REVOKE ALL ON public.deeds FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deeds TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 14: Data Retention — cleanup function (service_role only)
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
-- STEP 15: Disable realtime for all tables (optional but recommended)
-- ─────────────────────────────────────────────────────────────────────────────
-- Partnership deeds don't need live subscriptions. Disabling realtime
-- prevents data leaks through Supabase's realtime broadcast system.

-- Remove tables from realtime publication if they were added.
-- Wrapped in DO blocks to suppress error if table isn't in the publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.deeds;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.partners;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.deed_documents;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.business_addresses;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — Run these manually after setup to confirm
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 1. All 4 tables exist:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' ORDER BY table_name;
--    -- Should show: business_addresses, deed_documents, deeds, partners
--
-- 2. RLS is enabled + forced on all tables:
--    SELECT tablename, rowsecurity, forcerowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('deeds', 'partners', 'deed_documents', 'business_addresses');
--    -- All: rowsecurity = true, forcerowsecurity = true
--
-- 3. All 16 table policies exist (4 per table):
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE tablename IN ('deeds', 'partners', 'deed_documents', 'business_addresses')
--    ORDER BY tablename, policyname;
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
-- 6. All indexes exist:
--    SELECT tablename, indexname FROM pg_indexes
--    WHERE tablename IN ('deeds', 'partners', 'deed_documents', 'business_addresses')
--    ORDER BY tablename, indexname;
--
-- 7. Anon role has NO access to any table:
--    SELECT grantee, table_name, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE table_name IN ('deeds', 'partners', 'deed_documents', 'business_addresses')
--      AND grantee = 'anon';
--    -- Should return 0 rows
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE RELATIONSHIP DIAGRAM
-- ═══════════════════════════════════════════════════════════════════════════════
--
--   auth.users
--       │
--       │ 1:N (user_id)
--       ▼
--   ┌──────────┐
--   │  deeds   │  ← main table, owns all child data
--   └──────────┘
--       │
--       ├── 1:N (deed_id) ──→  partners           (N partners per deed)
--       │
--       ├── 1:N (deed_id) ──→  deed_documents     (N versions per deed)
--       │
--       └── 1:1 (deed_id) ──→  business_addresses (1 address per deed)
--
-- ON DELETE CASCADE: deleting a deed removes its partners, documents, and address.
-- ON DELETE CASCADE: deleting a user removes all their deeds (and cascades further).
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Layer 1 (Database - RLS):
--   - deeds: auth.uid() = user_id on all 4 operations
--   - partners: deed ownership check via subquery on deeds.user_id
--   - deed_documents: auth.uid() = user_id directly
--   - business_addresses: deed ownership check via subquery on deeds.user_id
--   - All policies scoped to 'authenticated' role only
--   - FORCE ROW LEVEL SECURITY enabled on all tables
--
-- Layer 2 (Storage - RLS):
--   - Files scoped by folder path: deeds/{user_id}/{deed_id}/...
--   - Only authenticated users, only their own folder
--
-- Layer 3 (Backend - Application):
--   - service_role key (bypasses RLS) + manual .eq('user_id', req.user.id)
--   - JWT verified via supabaseAdmin.auth.getUser(token)
--
-- Layer 4 (Access Control):
--   - anon role revoked from ALL tables
--   - cleanup function revoked from anon + authenticated
--   - Realtime disabled for all tables
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE. Your Partnership Deed database is production-ready (4 tables).
-- ═══════════════════════════════════════════════════════════════════════════════
