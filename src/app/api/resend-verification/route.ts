// ── POST /api/resend-verification — Resend verification email ───────────────
// Copied from networth-agent (no changes needed)
// Called from /verify-email page (authenticated, unverified user).

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import {
  emailVerifyRateLimit,
  emailVerifyIpRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from '@/lib/ratelimit';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAndSendVerification } from '@/lib/email-verification';

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check — must be logged in
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Dual rate limit
    const ip = getClientIdentifier(req);

    const [emailLimit, ipLimit] = await Promise.all([
      emailVerifyRateLimit.check(`email-verify:${user.email}`),
      emailVerifyIpRateLimit.check(ip),
    ]);

    if (!emailLimit.success) {
      return rateLimitResponse(emailLimit.reset);
    }
    if (!ipLimit.success) {
      return rateLimitResponse(ipLimit.reset);
    }

    // 3. Create and send verification
    const result = await createAndSendVerification(user.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
    });
  } catch (err) {
    console.error('[RESEND_VERIFICATION] Unexpected error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
