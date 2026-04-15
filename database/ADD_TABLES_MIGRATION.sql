-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTNERSHIP DEED GENERATOR — Add 3 New Tables Migration
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Run this on your EXISTING Supabase project that already has the `deeds` table.
-- This adds 3 new tables:
--   1. partners           — structured partner data (extracted from JSONB payload)
--   2. deed_documents     — version history for generated DOCX files
--   3. business_addresses — structured address with DB-level pincode validation
--
-- Each table has:
--   - Foreign key to deeds(id) with ON DELETE CASCADE
--   - Row Level Security via deed ownership (user_id on the parent deed)
--   - Indexes for common queries
--   - Anon role revoked, authenticated role granted
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS, DROP IF EXISTS, CREATE OR REPLACE.
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard > SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: partners
-- ─────────────────────────────────────────────────────────────────────────────
-- Extracts the partners[] array from the JSONB payload into a proper table.
-- Enables: query by partner name, DB-level capital/profit constraints,
-- eliminates the legacy partner1_name/partner2_name workaround on deeds.
--
-- RLS: user can only access partners belonging to their own deeds.
-- The policy joins through deeds.user_id to verify ownership.

CREATE TABLE IF NOT EXISTS public.partners (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    deed_id              UUID        NOT NULL REFERENCES public.deeds(id) ON DELETE CASCADE,
    ordinal              SMALLINT    NOT NULL,  -- 0-indexed: 0=First Party, 1=Second Party, ...
    name                 TEXT        NOT NULL DEFAULT '',
    relation             TEXT        NOT NULL DEFAULT 'S/O',   -- S/O, D/O, W/O
    father_name          TEXT        NOT NULL DEFAULT '',
    age                  SMALLINT    CHECK (age IS NULL OR (age >= 0 AND age <= 150)),
    address              TEXT        NOT NULL DEFAULT '',
    capital_pct          NUMERIC(5,2) CHECK (capital_pct IS NULL OR (capital_pct >= 0 AND capital_pct <= 100)),
    profit_pct           NUMERIC(5,2) CHECK (profit_pct IS NULL OR (profit_pct >= 0 AND profit_pct <= 100)),
    is_managing_partner  BOOLEAN     NOT NULL DEFAULT false,
    is_bank_authorized   BOOLEAN     NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each deed can only have one partner at each ordinal position
    UNIQUE(deed_id, ordinal)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partners_deed_id
  ON public.partners(deed_id);

CREATE INDEX IF NOT EXISTS idx_partners_name
  ON public.partners(name);

CREATE INDEX IF NOT EXISTS idx_partners_deed_ordinal
  ON public.partners(deed_id, ordinal);

-- RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners_select_own" ON public.partners;
DROP POLICY IF EXISTS "partners_insert_own" ON public.partners;
DROP POLICY IF EXISTS "partners_update_own" ON public.partners;
DROP POLICY IF EXISTS "partners_delete_own" ON public.partners;

CREATE POLICY "partners_select_own"
  ON public.partners FOR SELECT
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "partners_insert_own"
  ON public.partners FOR INSERT
  TO authenticated
  WITH CHECK (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "partners_update_own"
  ON public.partners FOR UPDATE
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  )
  WITH CHECK (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "partners_delete_own"
  ON public.partners FOR DELETE
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

-- Access control
REVOKE ALL ON public.partners FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: deed_documents
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks every generated DOCX file with version history.
-- Previously, each re-generate silently overwrote the single doc_url on deeds.
-- Now each generation creates a new row, preserving all previous versions.
--
-- Storage path convention: deeds/{user_id}/{deed_id}/v{version}/filename.docx
-- RLS: user can only access documents belonging to their own deeds.

CREATE TABLE IF NOT EXISTS public.deed_documents (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    deed_id       UUID        NOT NULL REFERENCES public.deeds(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path  TEXT        NOT NULL,
    file_name     TEXT        NOT NULL,
    file_size     INTEGER,    -- bytes, for display purposes
    version       SMALLINT    NOT NULL DEFAULT 1,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each deed can only have one document at each version number
    UNIQUE(deed_id, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deed_documents_deed_id
  ON public.deed_documents(deed_id);

CREATE INDEX IF NOT EXISTS idx_deed_documents_user_id
  ON public.deed_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_deed_documents_deed_version
  ON public.deed_documents(deed_id, version DESC);

-- RLS
ALTER TABLE public.deed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deed_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deed_docs_select_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_insert_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_update_own" ON public.deed_documents;
DROP POLICY IF EXISTS "deed_docs_delete_own" ON public.deed_documents;

CREATE POLICY "deed_docs_select_own"
  ON public.deed_documents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "deed_docs_insert_own"
  ON public.deed_documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "deed_docs_update_own"
  ON public.deed_documents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "deed_docs_delete_own"
  ON public.deed_documents FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Access control
REVOKE ALL ON public.deed_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deed_documents TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 3: business_addresses
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the structured address fields that the app already collects
-- (doorNo, buildingName, area, district, state, pincode) in a proper table
-- instead of flat JSONB keys.
--
-- full_address is auto-composed from parts via a BEFORE INSERT/UPDATE trigger,
-- replacing the client-side composeAddress() function.
--
-- RLS: user can only access addresses belonging to their own deeds.

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

    -- One address per deed (1:1 relationship)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_business_addresses_deed_id
  ON public.business_addresses(deed_id);

CREATE INDEX IF NOT EXISTS idx_business_addresses_pincode
  ON public.business_addresses(pincode)
  WHERE pincode != '';

CREATE INDEX IF NOT EXISTS idx_business_addresses_state
  ON public.business_addresses(state)
  WHERE state != '';

-- RLS
ALTER TABLE public.business_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_addresses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addr_select_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_insert_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_update_own" ON public.business_addresses;
DROP POLICY IF EXISTS "addr_delete_own" ON public.business_addresses;

CREATE POLICY "addr_select_own"
  ON public.business_addresses FOR SELECT
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "addr_insert_own"
  ON public.business_addresses FOR INSERT
  TO authenticated
  WITH CHECK (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "addr_update_own"
  ON public.business_addresses FOR UPDATE
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  )
  WITH CHECK (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

CREATE POLICY "addr_delete_own"
  ON public.business_addresses FOR DELETE
  TO authenticated
  USING (
    deed_id IN (SELECT id FROM public.deeds WHERE user_id = auth.uid())
  );

-- Access control
REVOKE ALL ON public.business_addresses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_addresses TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Disable realtime for new tables (prevent data leaks)
-- ─────────────────────────────────────────────────────────────────────────────

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
--    WHERE table_schema = 'public'
--    ORDER BY table_name;
--    -- Should show: business_addresses, deed_documents, deeds, partners
--
-- 2. RLS enabled on all new tables:
--    SELECT tablename, rowsecurity, forcerowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('partners', 'deed_documents', 'business_addresses');
--    -- All should have rowsecurity = true, forcerowsecurity = true
--
-- 3. All RLS policies exist:
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE tablename IN ('partners', 'deed_documents', 'business_addresses')
--    ORDER BY tablename, policyname;
--    -- partners:            4 policies (select/insert/update/delete)
--    -- deed_documents:      4 policies
--    -- business_addresses:  4 policies
--
-- 4. Indexes exist:
--    SELECT tablename, indexname FROM pg_indexes
--    WHERE tablename IN ('partners', 'deed_documents', 'business_addresses')
--    ORDER BY tablename, indexname;
--
-- 5. CHECK constraints on partners:
--    INSERT INTO public.partners (deed_id, ordinal, capital_pct)
--    VALUES ('00000000-0000-0000-0000-000000000000', 0, 150);
--    -- Should FAIL with CHECK constraint violation (capital_pct > 100)
--
-- 6. Pincode validation on business_addresses:
--    INSERT INTO public.business_addresses (deed_id, pincode)
--    VALUES ('00000000-0000-0000-0000-000000000000', 'ABC123');
--    -- Should FAIL with CHECK constraint violation (not 6 digits)
--
-- 7. Trigger-computed full_address works:
--    INSERT INTO public.business_addresses (deed_id, door_no, area, district, state, pincode)
--    VALUES ('<valid-deed-uuid>', '12', 'MG Road', 'Bangalore', 'Karnataka', '560001');
--    SELECT full_address FROM public.business_addresses WHERE door_no = '12';
--    -- Should show: "12, MG Road, Bangalore, Karnataka, India - 560001"
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
-- DONE. 3 new tables added. Your database now has 4 tables total.
-- ═══════════════════════════════════════════════════════════════════════════════
