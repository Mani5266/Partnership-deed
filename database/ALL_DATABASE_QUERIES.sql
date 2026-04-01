-- ═══════════════════════════════════════════════════════════════════════════════
-- OnEasy — Partnership Deed Generator
-- COMPLETE DATABASE REFERENCE (All queries in one file)
-- Project: Partnership-deed
-- NO AUTHENTICATION — Open Access
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This file contains ALL database-related code across the entire project:
--   SECTION 1: SQL Schema, Tables, Triggers, Functions
--   SECTION 2: Storage Bucket Setup
--   SECTION 3: Backend DB Operations (Node.js/Express)
--   SECTION 4: Frontend DB Operations (Browser Supabase Client)
--
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: SQL SCHEMA — Tables, Triggers, Functions (NO AUTH, NO RLS)
-- Source: database/supabase_setup.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 DROP EXISTING TABLES (CAUTION: Deletes all data!)
DROP TABLE IF EXISTS public.deeds CASCADE;

-- Drop legacy auth tables if they exist (from previous auth-based versions)
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS cleanup_old_deeds(INTEGER);

-- 1.2 ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─── TABLE: deeds ────────────────────────────────────────────────────────────
-- Stores partnership deed form data and generated doc references
-- No auth, no user_id, no RLS — open access

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
--   doc_url       — Storage path to generated .docx file (e.g., "deeds/{deed_id}/filename.docx")
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


-- ─── DATA RETENTION FUNCTION ─────────────────────────────────────────────────
-- Cleanup old deeds (configurable retention period)

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


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: STORAGE BUCKET SETUP
-- Run these in the Supabase SQL Editor (not part of regular migrations)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1 Create the storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('deed-docs', 'deed-docs', false);

-- 2.2 Storage access (NO AUTH)
-- The backend uses the service_role key (supabaseAdmin) to upload files,
-- which bypasses all storage policies. No RLS policies are needed for uploads.
--
-- For frontend downloads via the anon client, either:
--   Option A: Make the bucket public:
--     UPDATE storage.buckets SET public = true WHERE id = 'deed-docs';
--
--   Option B: Add a permissive storage policy:
--     CREATE POLICY "Allow all access to deed-docs"
--       ON storage.objects
--       FOR ALL
--       USING (bucket_id = 'deed-docs')
--       WITH CHECK (bucket_id = 'deed-docs');
--
-- File path convention: deeds/{deed_id}/{filename}.docx


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: BACKEND DB OPERATIONS (Node.js / Express)
-- Source: backend/server.js, backend/utils/supabase.js
-- ─────────────────────────────────────────────────────────────────────────────

/*
=== 3.1 Supabase Client Setup ===
Source: backend/utils/supabase.js

Two clients are created:

  // Public client (anon key)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Admin client (service role key) — bypasses RLS
  // Used for: storage uploads, database operations
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY


=== 3.2 Document Generation Route — /generate (POST) ===
Source: backend/server.js

  // 3.2a Storage upload (generated .docx file)
  const storagePath = `deeds/${deedId}/${filename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('deed-docs')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true
    });

  // 3.2b Update deed row with doc_url after successful upload
  await supabaseAdmin
    .from('deeds')
    .update({ doc_url: storagePath })
    .eq('id', deedId);

*/


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: FRONTEND DB OPERATIONS (Browser Supabase Client)
-- Source: frontend/js/main.js
-- All queries use the anon key client. RLS is disabled, so all rows are accessible.
-- ─────────────────────────────────────────────────────────────────────────────

/*
=== 4.1 INSERT a new deed ===
Source: frontend/js/main.js (lines 32-40)

  const { data, error } = await supabase
    .from('deeds')
    .insert({
      business_name,          // TEXT: M/s. company name
      partner1_name,          // TEXT: legacy first partner name
      partner2_name,          // TEXT: legacy second partner name
      payload                 // JSONB: full form data including partners array
    })
    .select()
    .single();

  // payload JSONB structure example:
  // {
  //   "businessName": "ABC Traders",
  //   "deedDate": "2026-01-15",
  //   "natureOfBusiness": "Trading",
  //   "businessObjectives": "...",
  //   "registeredAddress": "...",
  //   "partnershipDuration": "at_will" | "fixed",
  //   "partnershipStartDate": "2026-01-15",    // only if fixed
  //   "partnershipEndDate": "2031-01-15",      // only if fixed
  //   "interestRate": "12",
  //   "noticePeriod": "3",
  //   "accountingYear": "31st March",
  //   "bankOperation": "jointly" | "either",
  //   "additionalPoints": "...",
  //   "profitSameAsCapital": true | false,
  //   "partners": [
  //     {
  //       "name": "Rajesh Kumar",
  //       "relation": "S/O",
  //       "fatherName": "Suresh Kumar",
  //       "age": "35",
  //       "address": "123 Main St, City",
  //       "capital": "50",
  //       "profit": "50",
  //       "isManagingPartner": true,
  //       "isBankAuthorized": true
  //     },
  //     { ... partner 2 ... },
  //     // ... up to 20 partners
  //   ]
  // }


=== 4.2 UPDATE an existing deed ===
Source: frontend/js/main.js (lines 42-51)

  const { data, error } = await supabase
    .from('deeds')
    .update({
      business_name,
      partner1_name,
      partner2_name,
      payload                // JSONB: updated full form data
    })
    .eq('id', id)            // UUID of the deed
    .select()
    .single();


=== 4.3 SELECT all deeds (for sidebar & history) ===
Source: frontend/js/main.js (lines 53-60)

  const { data, error } = await supabase
    .from('deeds')
    .select('*')
    .order('created_at', { ascending: false });

  // Returns array of deed rows, newest first
  // No RLS — returns ALL deeds in the table


=== 4.4 SELECT single deed by ID ===
Source: frontend/js/main.js (lines 62-70)

  const { data, error } = await supabase
    .from('deeds')
    .select('*')
    .eq('id', id)
    .single();

  // Used by: editDeed(), duplicateDeed(), regenerateDeed(), viewStored(), downloadStoredDoc()


=== 4.5 DELETE a deed ===
Source: frontend/js/main.js (lines 72-78)

  const { error } = await supabase
    .from('deeds')
    .delete()
    .eq('id', id);


=== 4.6 UPSERT helper (insert or update) ===
Source: frontend/js/main.js (lines 81-87)

  // If id exists → UPDATE, else → INSERT
  async function dbSaveDeed({ id, business_name, partner1_name, partner2_name, payload }) {
    if (id) {
      return await dbUpdateDeed(id, { business_name, partner1_name, partner2_name, payload });
    } else {
      return await dbInsertDeed({ business_name, partner1_name, partner2_name, payload });
    }
  }

  // Called by:
  //   - debouncedServerSave() — auto-save on form changes (debounced)
  //   - generate()            — save before generating document


=== 4.7 STORAGE DOWNLOAD (generated .docx file) ===
Source: frontend/js/main.js (lines 2173-2202)

  // First get the deed to find doc_url
  const d = await dbGetDeedById(id);

  // Then download from storage
  const { data: blob, error } = await supabase.storage
    .from('deed-docs')
    .download(d.doc_url);

  // doc_url format: "deeds/{deed_id}/Partnership_Deed_{bizName}.docx"
  // Creates a download link and clicks it programmatically

*/


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: SUMMARY — TABLE STRUCTURE
-- ─────────────────────────────────────────────────────────────────────────────

/*
  ┌──────────────────────┐
  │   deeds              │
  │   ──────────────     │
  │   id (UUID PK)       │  ← auto-generated
  │   business_name      │  ← M/s. firm name
  │   partner1_name      │  ← legacy compat
  │   partner2_name      │  ← legacy compat
  │   payload (JSONB)    │  ← ALL form data (N-partner arrays, clauses, etc.)
  │   doc_url            │  ← storage path to .docx
  │   created_at         │  ← auto-set on insert
  │   updated_at         │  ← auto-updated via trigger
  └──────────────────────┘

  Storage Bucket: deed-docs (private)
  └── deeds/{deed_id}/Partnership_Deed_{bizName}.docx

  No auth.users dependency.
  No profiles table.
  No audit_logs table.
  No RLS policies — open access.
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF FILE
-- ═══════════════════════════════════════════════════════════════════════════════
