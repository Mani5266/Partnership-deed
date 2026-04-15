// ── POST /api/suggest-business-names — AI Business Name Suggestions ─────────
// Ported from backend/server.js POST /api/suggest-business-names
// Auth: Bearer token required
// Rate limit: 20/hour per user

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { verifyAuth, AuthError } from '@/lib/auth';
import { suggestNamesRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/ratelimit';

const GEMINI_MODEL = 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    let user;
    try {
      user = await verifyAuth(req);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }

    // 2. Rate limit
    const id = getClientIdentifier(req, user.id);
    const rl = await suggestNamesRateLimit.check(id);
    if (!rl.success) return rateLimitResponse(rl.reset);

    // 3. Parse body
    let body: { natureOfBusiness?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { natureOfBusiness } = body;

    if (!natureOfBusiness || typeof natureOfBusiness !== 'string' || natureOfBusiness.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Please enter the Nature of Business first (at least 3 characters).' },
        { status: 400 }
      );
    }

    if (natureOfBusiness.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Nature of Business is too long (max 500 characters).' },
        { status: 400 }
      );
    }

    // 4. Call Gemini
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return NextResponse.json(
        { success: false, error: 'AI service is not configured. Please add GEMINI_API_KEY.' },
        { status: 503 }
      );
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `You are a business naming expert specializing in Indian partnership firms.

Given the following Nature of Business, suggest 5 professional and relevant business name options suitable for an Indian partnership firm.

RULES:
1. Each name should sound professional and be suitable for legal registration in India
2. Names should be relevant to the described business/industry
3. Mix different naming styles: descriptive, creative, modern, traditional, and abbreviation-based
4. Do NOT include "M/s." prefix — just the firm name itself
5. Keep names concise (2-4 words each)
6. Names should be in English
7. Return ONLY a valid JSON array of 5 strings, nothing else (no markdown, no explanation, no code blocks)

Nature of Business: "${natureOfBusiness.trim()}"

Return ONLY a JSON array like: ["Name One", "Name Two", "Name Three", "Name Four", "Name Five"]`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[NAMES] Gemini API error:', response.status, errorBody);

      if (response.status === 429) {
        return NextResponse.json(
          { success: false, error: 'AI rate limit exceeded. Please wait and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Failed to generate name suggestions. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return NextResponse.json(
        { success: false, error: 'No response from AI. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Parse JSON array
    let names: unknown;
    try {
      const cleaned = textContent
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      names = JSON.parse(cleaned);
    } catch {
      console.error('[NAMES] Failed to parse:', textContent);
      return NextResponse.json(
        { success: false, error: 'Failed to parse suggestions. Please try again.' },
        { status: 500 }
      );
    }

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid suggestions generated. Please try again.' },
        { status: 500 }
      );
    }

    // Sanitize: ensure all items are strings, trim, remove empty
    const sanitized = (names as unknown[])
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim().substring(0, 200))
      .slice(0, 5);

    return NextResponse.json({ success: true, names: sanitized });
  } catch (err) {
    console.error('[NAMES] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: 'Failed to generate name suggestions.' },
      { status: 500 }
    );
  }
}
