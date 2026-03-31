-- ═══════════════════════════════════════════════════════════════════════════════
-- COMBINED DATABASE SETUP — All 4 Apps on Shared Supabase
-- Project: kihkewnaokmimfxceqox.supabase.co
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This file creates the ENTIRE database schema for all 4 OneAsy apps:
--
--   App 1: DeedForge (deed.oneasy.ai)
--     Tables: deeds
--     Storage: deed-docs (private)
--
--   App 2: OnEasy Offer Letter (offer.oneasy.ai)
--     Tables: offers, company_profiles
--     Storage: offer-docs (private)
--
--   App 3: LLP Agreement Generator (llp.oneasy.ai)
--     Tables: agreements
--     Storage: documents (private, 10MB limit)
--
--   App 4: Net Worth Certificate Agent (networth.oneasy.ai)
--     Tables: clients, certificates, documents
--     Storage: networth-documents (public, 10MB limit)
--
-- Total: 7 tables, 4 storage buckets, 0 conflicts
-- NO AUTHENTICATION — No RLS, no policies, no user_id columns
--
-- HOW TO RUN:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
--
-- SAFE TO RE-RUN: Uses IF NOT EXISTS and ON CONFLICT throughout.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0: CLEANUP — Drop legacy auth remnants (safe to run even if they don't exist)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: SHARED UTILITY — update_updated_at_column() trigger function
-- Used by: DeedForge (deeds), OnEasy (offers, company_profiles)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════════
-- APP 1: DeedForge — Partnership Deed Generator
-- Subdomain: deed.oneasy.ai
-- ═══════════════════════════════════════════════════════════════════════════════

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

ALTER TABLE public.deeds DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_deeds_updated_at
    BEFORE UPDATE ON public.deeds
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Cleanup function: delete deeds older than N days
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


-- ═══════════════════════════════════════════════════════════════════════════════
-- APP 2: OnEasy Offer Letter Generator
-- Subdomain: offer.oneasy.ai
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    emp_name TEXT NOT NULL,
    designation TEXT NOT NULL,
    annual_ctc NUMERIC NOT NULL,
    payload JSONB NOT NULL,
    doc_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_name TEXT NOT NULL,
    org_name TEXT NOT NULL DEFAULT '',
    entity_type TEXT DEFAULT 'Company',
    cin TEXT DEFAULT '',
    office_address TEXT DEFAULT '',
    signatory_name TEXT DEFAULT '',
    signatory_desig TEXT DEFAULT '',
    first_aid TEXT DEFAULT 'HR Room',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_offers_updated_at
    BEFORE UPDATE ON public.offers
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_company_profiles_updated_at
    BEFORE UPDATE ON public.company_profiles
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Cleanup function: delete offers older than N days
CREATE OR REPLACE FUNCTION cleanup_old_offers(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.offers
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════════
-- APP 3: LLP Agreement Generator
-- Subdomain: llp.oneasy.ai
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    data JSONB DEFAULT '{}',
    step INT DEFAULT 0,
    is_done BOOLEAN DEFAULT false,
    messages JSONB DEFAULT '[]'
);

-- Cleanup function: delete inactive agreements older than N days
CREATE OR REPLACE FUNCTION public.cleanup_expired_data(
    agreement_retention_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_agreements INT;
    result JSONB;
BEGIN
    DELETE FROM public.agreements
    WHERE updated_at < NOW() - (agreement_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_agreements = ROW_COUNT;

    result := jsonb_build_object(
        'deleted_agreements', deleted_agreements,
        'agreement_retention_days', agreement_retention_days,
        'executed_at', NOW()
    );

    RETURN result;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- APP 4: Net Worth Certificate Agent
-- Subdomain: networth.oneasy.ai
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    salutation TEXT NOT NULL,
    pan_number TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pan_number)
);

CREATE INDEX IF NOT EXISTS idx_clients_pan_number ON public.clients(pan_number);

CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    country TEXT,
    cert_date DATE,
    udin TEXT,
    nickname TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
    form_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_client_id ON public.certificates(client_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON public.certificates(status);

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    certificate_id UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
    annexure_type TEXT NOT NULL,
    category TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_certificate_id ON public.documents(certificate_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════════

-- DeedForge: deed-docs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('deed-docs', 'deed-docs', false)
ON CONFLICT (id) DO NOTHING;

-- OnEasy Offer Letter: offer-docs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('offer-docs', 'offer-docs', false)
ON CONFLICT (id) DO NOTHING;

-- LLP Agreement: documents (private, 10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents', 'documents', false, 10485760,
    ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760;

-- Net Worth Agent: networth-documents (public, 10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'networth-documents', 'networth-documents', true, 10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run manually after applying)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Check all 7 tables exist:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('deeds', 'offers', 'company_profiles', 'agreements',
--                       'clients', 'certificates', 'documents')
--   ORDER BY tablename;
--
-- Check all 4 storage buckets:
--   SELECT id, name, public, file_size_limit
--   FROM storage.buckets
--   WHERE id IN ('deed-docs', 'offer-docs', 'documents', 'networth-documents');
--
-- Confirm legacy tables are gone:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('profiles', 'audit_logs');
--   -- Should return 0 rows
--
-- ═══════════════════════════════════════════════════════════════════════════════
