export const API_URL = '/generate';

// ── Supabase client — fetched from backend /api/config ───────────────────────
// Single source of truth: credentials come from backend .env, not hardcoded here.

let supabase = null;
let _initPromise = null;

async function _initSupabase() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load config from server');
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return supabase;
}

/** Ensures Supabase client is initialized (called once, cached) */
export function initSupabase() {
  if (!_initPromise) {
    _initPromise = _initSupabase();
  }
  return _initPromise;
}

/** Get the initialized Supabase client */
export function getSupabase() {
  return supabase;
}

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

/** Get current session or null */
export async function getSession() {
  await initSupabase();
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
