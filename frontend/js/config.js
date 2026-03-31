export const API_URL = '/generate';

// Supabase credentials (anon key is safe to expose — RLS is disabled, open access)
export const SUPABASE_URL = 'https://kihkewnaokmimfxceqox.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGtld25hb2ttaW1meGNlcW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzg4MjYsImV4cCI6MjA5MDUxNDgyNn0._miUNQ5GqyFQLKW13p4-HGXq2yw4LimFboqPm352Vp4';

// Create Supabase client (used for DB queries and storage downloads)
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
