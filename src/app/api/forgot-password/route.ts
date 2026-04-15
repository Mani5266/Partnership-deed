// ── POST /api/forgot-password — Request password reset ──────────────────────
// Copied from networth-agent (no changes needed)
// Always returns success to prevent email enumeration.

import { NextResponse } from 'next/server';
import { createAndSendPasswordReset } from '@/lib/password-reset';
import {
  emailVerifyRateLimit,
  emailVerifyIpRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from '@/lib/ratelimit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required.' },
        { status: 400 }
      );
    }

    // Rate limit by email
    const emailResult = await emailVerifyRateLimit.check(
      `pwd-reset:${email}`
    );
    if (!emailResult.success) {
      return rateLimitResponse(emailResult.reset);
    }

    // Rate limit by IP
    const ipId = getClientIdentifier(request);
    const ipResult = await emailVerifyIpRateLimit.check(
      `pwd-reset:${ipId}`
    );
    if (!ipResult.success) {
      return rateLimitResponse(ipResult.reset);
    }

    const result = await createAndSendPasswordReset(email);

    // Always return success to prevent email enumeration
    if (!result.success) {
      console.error(
        '[FORGOT_PASSWORD] Reset failed (returning success to client)',
        { error: result.error }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'If an account exists with that email, a reset link has been sent.',
    });
  } catch (err) {
    console.error('[FORGOT_PASSWORD] Unexpected error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
