// ── POST /api/send-verification — Send email verification ──────────────────
// Copied from networth-agent (no changes needed)
// Called immediately after signup (unauthenticated).

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import {
  emailVerifyRateLimit,
  emailVerifyIpRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from '@/lib/ratelimit';
import {
  createAndSendVerification,
  clearEmailConfirmation,
} from '@/lib/email-verification';

export async function POST(req: NextRequest) {
  try {
    // 1. Parse body
    let body: { email?: unknown; userId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { email, userId } = body;

    if (typeof email !== 'string' || !email) {
      return NextResponse.json(
        { success: false, error: 'Email is required.' },
        { status: 400 }
      );
    }

    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required.' },
        { status: 400 }
      );
    }

    // 2. Dual rate limit
    const ip = getClientIdentifier(req);

    const [emailLimit, ipLimit] = await Promise.all([
      emailVerifyRateLimit.check(`email-verify:${email}`),
      emailVerifyIpRateLimit.check(ip),
    ]);

    if (!emailLimit.success) {
      return rateLimitResponse(emailLimit.reset);
    }
    if (!ipLimit.success) {
      return rateLimitResponse(ipLimit.reset);
    }

    // 3. Clear email_confirmed_at so user starts as unverified
    await clearEmailConfirmation(userId as string);

    // 4. Create and send verification
    const result = await createAndSendVerification(userId);

    console.log('[SEND_VERIFICATION] Result', {
      success: result.success,
      provider: result.success ? result.provider : undefined,
      error: !result.success ? result.error : undefined,
    });

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
    console.error('[SEND_VERIFICATION] Unexpected error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
