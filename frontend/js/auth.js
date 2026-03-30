import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function login(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  } catch (err) {
    const errEl = document.getElementById('authError');
    if (errEl) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
    return null;
  }
}

export async function signup(email, password, fullName) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    return data;
  } catch (err) {
    const errEl = document.getElementById('authError');
    if (errEl) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
    return null;
  }
}

export async function logout() {
  await supabase.auth.signOut();
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('deedforge_')) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  window.location.reload();
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return subscription;
}

export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? session.user : null;
}

export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export { supabase };
