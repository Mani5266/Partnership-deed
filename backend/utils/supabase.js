'use strict';

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail-fast: crash immediately with a clear message if any required env var is missing.
const missing = [];
if (!supabaseUrl) missing.push('SUPABASE_URL');
if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (missing.length > 0) {
  throw new Error(
    `FATAL: Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Ensure your .env file exists and contains all required Supabase credentials.'
  );
}

// Admin client (service role key) — bypasses RLS, used for:
// - Storage uploads (generated .docx files)
// - Database operations (updating deed rows with doc_url)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabaseAdmin };
