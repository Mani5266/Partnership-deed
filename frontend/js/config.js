export const API_URL = '/generate';

// Supabase credentials
export const SUPABASE_URL = 'https://kihkewnaokmimfxceqox.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGtld25hb2ttaW1meGNlcW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzg4MjYsImV4cCI6MjA5MDUxNDgyNn0._miUNQ5GqyFQLKW13p4-HGXq2yw4LimFboqPm352Vp4';

// Create Supabase client with auth support
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

/** Get current session or null */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Get current user id or null */
export async function getUserId() {
  const session = await getSession();
  return session?.user?.id || null;
}

/** Redirect to login if no session */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

/** Get the access token for backend API calls */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}
