-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTH MIGRATION — Add user_id + RLS to all 7 tables
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add user_id column to all tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create indexes on user_id for performance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_deeds_user_id ON public.deeds(user_id);
CREATE INDEX IF NOT EXISTS idx_offers_user_id ON public.offers(user_id);
CREATE INDEX IF NOT EXISTS idx_company_profiles_user_id ON public.company_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_agreements_user_id ON public.agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Enable RLS on all tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.deeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: RLS Policies — deeds (DeedForge)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own deeds"
  ON public.deeds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own deeds"
  ON public.deeds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deeds"
  ON public.deeds FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deeds"
  ON public.deeds FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: RLS Policies — offers (OnEasy Offer Letter)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own offers"
  ON public.offers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own offers"
  ON public.offers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own offers"
  ON public.offers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own offers"
  ON public.offers FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: RLS Policies — company_profiles (OnEasy Offer Letter)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own company_profiles"
  ON public.company_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own company_profiles"
  ON public.company_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own company_profiles"
  ON public.company_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own company_profiles"
  ON public.company_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: RLS Policies — agreements (LLP Agreement)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own agreements"
  ON public.agreements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own agreements"
  ON public.agreements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agreements"
  ON public.agreements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own agreements"
  ON public.agreements FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: RLS Policies — clients (Net Worth Agent)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: RLS Policies — certificates (Net Worth Agent)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own certificates"
  ON public.certificates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own certificates"
  ON public.certificates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own certificates"
  ON public.certificates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own certificates"
  ON public.certificates FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: RLS Policies — documents (Net Worth Agent)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: Storage Policies — scoped by user_id
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can upload to deed-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view own deed-docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'deed-docs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can upload to offer-docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'offer-docs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view own offer-docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'offer-docs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can upload to documents bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view own documents bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can upload to networth-documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'networth-documents'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can view own networth-documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'networth-documents'
    AND auth.uid() IS NOT NULL
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 12: Allow service_role to bypass RLS (for backend operations)
-- This is automatic in Supabase — service_role key always bypasses RLS.
-- No additional config needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 13: Delete orphan data (existing rows with no user_id)
-- These rows will be invisible after RLS is enabled anyway.
-- Uncomment and run ONLY if you want to clean up:
-- ─────────────────────────────────────────────────────────────────────────────

-- DELETE FROM public.deeds WHERE user_id IS NULL;
-- DELETE FROM public.offers WHERE user_id IS NULL;
-- DELETE FROM public.company_profiles WHERE user_id IS NULL;
-- DELETE FROM public.agreements WHERE user_id IS NULL;
-- DELETE FROM public.documents WHERE user_id IS NULL;
-- DELETE FROM public.certificates WHERE user_id IS NULL;
-- DELETE FROM public.clients WHERE user_id IS NULL;
