// ── SERVER-SIDE AUTH HELPER FOR API ROUTES ──────────────────────────────────
// Replaces backend/middleware/auth.js — verifies JWT from the Authorization
// header using the admin client (service_role key, bypasses RLS).

import { createSupabaseAdminClient } from '@/lib/supabase-server';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Verify the Authorization header and return the authenticated user.
 * Throws an error with status info if auth fails.
 */
export async function verifyAuth(request: Request): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header.', 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new AuthError('Missing token.', 401);
  }

  const admin = createSupabaseAdminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    throw new AuthError('Invalid or expired token.', 401);
  }

  return { id: user.id, email: user.email ?? '' };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
