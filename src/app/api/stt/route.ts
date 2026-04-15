import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  sttRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from "@/lib/ratelimit";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const STT_PROMPT = `Transcribe the audio exactly as spoken.

Rules:
- Preserve original language and script (Hindi, Telugu, English, or mixed)
- Preserve words exactly as spoken, including number words (do not convert to digits)
- Do NOT translate
- Do NOT romanize
- Do NOT interpret meaning
- Return ONLY the transcription text
- No prefixes, no quotes, no explanations`;

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    // 0. Auth check
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please log in and try again." },
        { status: 401 }
      );
    }

    // 1. Rate limiting (keyed by user ID)
    const identifier = getClientIdentifier(req, user.id);
    const rateResult = await sttRateLimit.check(identifier);
    if (!rateResult.success) {
      return rateLimitResponse(rateResult.reset);
    }

    // 2. Parse FormData and extract audio file
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid form data." },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No audio file provided." },
        { status: 400 }
      );
    }

    // 3. Validate file
    if (!file.type.startsWith("audio/")) {
      return NextResponse.json(
        { success: false, error: "Unsupported file type. Audio only." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "Audio file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Audio file too large (max 5MB)." },
        { status: 400 }
      );
    }

    // PII-safe request logging — file metadata only
    console.log("[STT_REQUEST]", {
      fileSize: file.size,
      mimeType: file.type,
    });

    // 4. Convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");

    // 5. Get API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[STT] GEMINI_API_KEY not configured");
      return NextResponse.json(
        { success: false, error: "Server configuration error." },
        { status: 500 }
      );
    }

    // 6. Call Gemini 2.0 Flash (with timeout to prevent hanging)
    const tGemini = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let aiRes: Response;
    try {
      aiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: STT_PROMPT },
                  {
                    inlineData: {
                      mimeType: file.type,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 512,
            },
          }),
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.error("[STT] Gemini request timed out (15s)");
        return NextResponse.json(
          { success: false, error: "Transcription service timed out. Please try again." },
          { status: 504 }
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`[STT] Gemini returned ${aiRes.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: "Transcription service error. Please try again." },
        { status: 502 }
      );
    }

    // 7. Defensive response extraction
    const aiJson = await aiRes.json();
    const rawText: string =
      aiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText.trim()) {
      console.warn("[STT] Gemini returned empty transcription");
      return NextResponse.json(
        { success: false, error: "Couldn't understand audio. Please try again." },
        { status: 422 }
      );
    }

    // 8. Quote stripping — handle Gemini wrapping output in quotes
    let text = rawText.trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }

    // PII-safe response logging — length only, never content
    console.log("[STT_RESPONSE]", {
      transcriptLength: text.length,
      geminiMs: Date.now() - tGemini,
      totalMs: Date.now() - t0,
    });

    // 9. Return
    return NextResponse.json({ success: true, text });
  } catch (error) {
    console.error("[STT] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
