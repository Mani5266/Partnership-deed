// ── POST /api/generate-objective — AI Business Objective Generation ─────────
// Ported from backend/server.js POST /api/generate-objective
// Auth: Bearer token required
// Rate limit: 20/hour per user

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { verifyAuth, AuthError } from '@/lib/auth';
import { objectiveRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/ratelimit';

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
    const rl = await objectiveRateLimit.check(id);
    if (!rl.success) return rateLimitResponse(rl.reset);

    // 3. Parse body
    let body: { description?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { description } = body;

    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Please provide a business description (at least 3 characters).' },
        { status: 400 }
      );
    }

    if (description.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Business description is too long (max 1000 characters).' },
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

    const prompt = `You are a legal document assistant specializing in Indian Partnership Deeds under the Indian Partnership Act, 1932.

Given the following informal business description from a user, generate TWO things:

1. **nature**: A short "Nature of Business" summary (3-10 words, e.g. "Restaurants, Food Service, and Hospitality" or "Software Development and IT Consulting"). This is used in the WHEREAS clause.
2. **objective**: A formal, legally-phrased "Business Objective" clause suitable for Clause 4 of a Partnership Deed.

RULES FOR THE OBJECTIVE:
1. The objective should be comprehensive and cover all reasonable activities related to the described business
2. Use formal legal language (e.g., "buying, selling, trading, importing, exporting, dealing in...")
3. Include both wholesale and retail where applicable
4. Include online/offline/physical/digital channels where applicable
5. Keep it as a single paragraph, 2-5 sentences maximum
6. Do NOT include the business name or partner names
7. The output should be in English
8. Make it specific to the business described, not generic

RULES FOR THE NATURE:
1. Keep it very short — a concise category/industry label (3-10 words)
2. Title Case (capitalize each major word)
3. No articles (a, an, the) unless grammatically essential
4. Examples: "Real Estate and Property Development", "Textile Trading and Garment Manufacturing", "Restaurants, Food Service, and Hospitality"

User's business description: "${description.trim()}"

RESPOND WITH VALID JSON ONLY — no markdown, no explanation, no code fences:
{"nature": "...", "objective": "..."}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
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
      console.error('[OBJECTIVE] Gemini API error:', response.status, errorBody);

      if (response.status === 429) {
        return NextResponse.json(
          { success: false, error: 'AI rate limit exceeded. Please wait and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Failed to generate business objective. Please try again.' },
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

    // 5. Parse response
    const cleaned = textContent
      .replace(/```json\s*/gi, '')
      .replace(/```[a-z]*\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    let nature = '';
    let objective = '';
    try {
      const parsed = JSON.parse(cleaned);
      nature = (parsed.nature || '').trim();
      objective = (parsed.objective || '').trim();
    } catch {
      // Fallback: treat entire text as the objective
      objective = cleaned.replace(/^["']|["']$/g, '').replace(/\n{2,}/g, '\n').trim();
    }

    if (!objective) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty objective. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, objective, nature });
  } catch (err) {
    console.error('[OBJECTIVE] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: 'Failed to generate business objective.' },
      { status: 500 }
    );
  }
}
