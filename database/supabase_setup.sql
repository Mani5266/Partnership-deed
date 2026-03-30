-- ═══════════════════════════════════════════════════════════════════
-- DeedForge — Partnership Deed Generator
-- Supabase Database Setup (FRESH START)
-- ═══════════════════════════════════════════════════════════════════

-- 1. DROP EXISTING TABLES (CAUTION: This deletes all data!)
DROP TABLE IF EXISTS public.deeds CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- 2. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: deeds — Stores partnership deed form data and doc references
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.deeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    business_name TEXT NOT NULL DEFAULT '',
    partner1_name TEXT NOT NULL DEFAULT '',
    partner2_name TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}',
    doc_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deeds ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own deeds
CREATE POLICY "Users can view their own deeds"
    ON public.deeds FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deeds"
    ON public.deeds FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deeds"
    ON public.deeds FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deeds"
    ON public.deeds FOR DELETE
    USING (auth.uid() = user_id);

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
-- TABLE: profiles — Extended user profiles
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    updated_at TIMESTAMPTZ,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user'
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile."
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile."
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: audit_logs — Security and action audit trail
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    action TEXT NOT NULL,
    resource TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admin can view all audit logs."
    ON public.audit_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ));

-- Defense-in-depth: users can only insert logs for themselves
-- (Service role bypasses RLS entirely)
CREATE POLICY "Users can only insert their own audit logs."
    ON public.audit_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- DATA RETENTION — Cleanup old deeds
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_deeds(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.deeds
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Log the cleanup action
    INSERT INTO public.audit_logs (action, resource, details)
    VALUES (
        'data_retention_cleanup',
        'partnership_deed',
        jsonb_build_object(
            'deleted_count', deleted_count,
            'retention_days', retention_days,
            'executed_at', NOW()
        )
    );

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
-- Storage RLS policies:
--
-- CREATE POLICY "Users can upload their own deed docs"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'deed-docs'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- CREATE POLICY "Users can view their own deed docs"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'deed-docs'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- CREATE POLICY "Users can delete their own deed docs"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'deed-docs'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- Files stored at: {user_id}/{deed_id}/{filename}.docx
