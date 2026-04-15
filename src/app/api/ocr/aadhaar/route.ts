// ── POST /api/ocr/aadhaar — Aadhaar Card OCR via Gemini Vision ──────────────
// Ported from backend/ocr.js + backend/server.js POST /api/ocr/aadhaar
// Auth: Bearer token required
// Rate limit: 20/hour per user

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { verifyAuth, AuthError } from '@/lib/auth';
import { ocrRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/ratelimit';

// ── Constants ───────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.0-flash';
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

const AADHAAR_PROMPT = `You are an Aadhaar card data extraction assistant. Extract the following fields from this Aadhaar card image.

IMPORTANT RULES:
1. Extract ONLY the English text (not Hindi/regional language text)
2. For "name": Extract the cardholder's full name in English (as printed on the card)
3. For "fatherName": Extract the father's/husband's/guardian's name in English. This appears after S/O, D/O, W/O, or C/O on the card.
4. For "relation": Return exactly one of: "S/O" (Son of), "D/O" (Daughter of), "W/O" (Wife of), or "C/O" (Care of)
5. For "dob": Extract the date of birth in DD/MM/YYYY format
6. For "gender": Extract "Male", "Female", or "Transgender"
7. For "address": Extract the full address in English. Include house number, street, area, city/village, district, state, and PIN code.
8. Do NOT include the Aadhaar number in any field
9. If a field is not visible or cannot be read, return an empty string for that field
10. If the image is the BACK side of the Aadhaar card (showing instructions/guidelines), or if it is not an Aadhaar card at all, return all empty strings
11. Clean up any OCR artifacts or extra spaces in the extracted text

Return ONLY a valid JSON object with these exact keys (no markdown, no explanation, no code blocks):
{"name": "", "fatherName": "", "relation": "", "dob": "", "gender": "", "address": ""}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeField(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

function sanitizeRelation(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  const v = value.toUpperCase().trim();
  if (v.includes('S/O') || v.includes('SON')) return 'S/O';
  if (v.includes('D/O') || v.includes('DAUGHTER')) return 'D/O';
  if (v.includes('W/O') || v.includes('WIFE')) return 'W/O';
  if (v.includes('C/O') || v.includes('CARE')) return 'C/O';
  return v.length <= 5 ? v : '';
}

function calculateAge(dob: string): string {
  if (!dob) return '';
  const match = dob.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/);
  if (!match) return '';

  const day = parseInt(match[1]!);
  const month = parseInt(match[2]!);
  const year = parseInt(match[3]!);

  if (year < 1900 || year > new Date().getFullYear() || month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const md = today.getMonth() - birthDate.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birthDate.getDate())) age--;

  return age >= 0 && age <= 120 ? String(age) : '';
}

// ── Route Handler ───────────────────────────────────────────────────────────

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
    const rl = await ocrRateLimit.check(id);
    if (!rl.success) return rateLimitResponse(rl.reset);

    // 3. Parse body
    let body: { image?: unknown; mimeType?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { image, mimeType } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing image data. Send base64-encoded image in "image" field.' },
        { status: 400 }
      );
    }

    // Pre-decode size check (base64 is ~33% larger than binary)
    if (image.length > 5.5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Image data too large. Maximum image size is 4MB.' },
        { status: 413 }
      );
    }

    // Validate mime type
    const mime = (typeof mimeType === 'string' ? mimeType : 'image/jpeg').toLowerCase();
    if (!ALLOWED_MIMES.includes(mime)) {
      return NextResponse.json(
        { success: false, error: `Unsupported image type: ${mime}. Use JPEG, PNG, or WebP.` },
        { status: 400 }
      );
    }

    // Decode base64
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(image, 'base64');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid base64 image data.' },
        { status: 400 }
      );
    }

    if (imageBuffer.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Image data too small. Please provide a valid image.' },
        { status: 400 }
      );
    }

    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { success: false, error: `Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 4MB.` },
        { status: 413 }
      );
    }

    // 4. Call Gemini Vision API
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured.' },
        { status: 503 }
      );
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const base64Image = imageBuffer.toString('base64');
    const requestBody = {
      contents: [{
        parts: [
          { text: AADHAAR_PROMPT },
          { inline_data: { mime_type: mime, data: base64Image } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OCR] Gemini API error:', response.status, errorBody);

      if (response.status === 429) {
        return NextResponse.json(
          { success: false, error: 'Gemini API rate limit exceeded. Please wait and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'OCR processing failed. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        return NextResponse.json(
          { success: false, error: 'Image was blocked by safety filters. Please try a different image.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'No response from Gemini. The image may not be readable.' },
        { status: 500 }
      );
    }

    // 5. Parse and sanitize response
    let parsed: Record<string, unknown>;
    try {
      const cleaned = textContent
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[OCR] Failed to parse Gemini response:', textContent);
      return NextResponse.json(
        { success: false, error: 'Failed to parse extracted data. Please try again.' },
        { status: 500 }
      );
    }

    const result = {
      name: sanitizeField(parsed.name),
      fatherName: sanitizeField(parsed.fatherName || parsed.father_name || parsed.fatherSName),
      relation: sanitizeRelation(parsed.relation),
      dob: sanitizeField(parsed.dob || parsed.DOB || parsed.dateOfBirth),
      gender: sanitizeField(parsed.gender),
      address: sanitizeField(parsed.address),
      age: '',
    };
    result.age = calculateAge(result.dob);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[OCR] Error:', err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : '';
    const statusCode = message.includes('not configured')
      ? 503
      : message.includes('rate limit')
        ? 429
        : message.includes('too large')
          ? 413
          : 500;
    return NextResponse.json(
      { success: false, error: statusCode === 500 ? 'OCR processing failed. Please try again.' : message },
      { status: statusCode }
    );
  }
}
