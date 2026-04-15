// ── POST /api/check-verification — Check email verification status ──────────
// Server-side check of email_confirmed_at using admin client.
// Rate-limited by IP to prevent user enumeration.

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { createSupabaseAdminClient } from '@/lib/supabase-server';
import {
  checkVerificationRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit by IP ──
    const identifier = getClientIdentifier(req);
    const rl = await checkVerificationRateLimit.check(identifier);
    if (!rl.success) return rateLimitResponse(rl.reset);

    let body: { userId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { verified: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { userId } = body;
    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json(
        { verified: false, error: 'User ID is required.' },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (error || !data?.user) {
      console.log('[CHECK_VERIFICATION] User lookup failed', {
        userId,
        error: error?.message ?? 'no user',
      });
      return NextResponse.json({ verified: false });
    }

    const confirmed =
      data.user.app_metadata?.custom_email_verified === true;
    console.log('[CHECK_VERIFICATION]', {
      userId,
      custom_email_verified:
        data.user.app_metadata?.custom_email_verified ?? 'NOT_SET',
      verified: confirmed,
    });

    return NextResponse.json({ verified: confirmed });
  } catch (err) {
    console.error('[CHECK_VERIFICATION] Unexpected error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ verified: false }, { status: 500 });
  }
}
