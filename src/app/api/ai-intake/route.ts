import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  aiIntakeRateLimit,
  getClientIdentifier,
  rateLimitResponse,
} from "@/lib/ratelimit";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { partnerSchema } from "@/lib/validation";
import { z } from "zod";

// ─── Partial schema for AI-extracted deed data ────────────────────────────────
// Looser than generatePayloadSchema: no required fields, no cross-field checks.
// Used to validate AI output field-by-field (one bad field doesn't nuke everything).

const extractedDeedSchema = z
  .object({
    partners: z.array(
      z.object({
        name: z.string().max(200).optional().default(""),
        relation: z.string().max(20).optional().default("S/O"),
        fatherName: z.string().max(200).optional().default(""),
        age: z.union([z.number(), z.string()]).optional().default(""),
        address: z.string().max(500).optional().default(""),
        capital: z.union([z.number(), z.string()]).optional().default(0),
        profit: z.union([z.number(), z.string()]).optional().default(0),
        isManagingPartner: z.boolean().optional().default(false),
        isBankAuthorized: z.boolean().optional().default(false),
      })
    ).optional(),
    businessName: z.string().max(300).optional(),
    businessDescriptionInput: z.string().max(1000).optional(),
    natureOfBusiness: z.string().max(500).optional(),
    businessObjectives: z.string().max(5000).optional(),
    deedDate: z.string().max(50).optional(),
    addrDoorNo: z.string().max(100).optional(),
    addrBuildingName: z.string().max(200).optional(),
    addrArea: z.string().max(200).optional(),
    addrDistrict: z.string().max(200).optional(),
    addrState: z.string().max(200).optional(),
    addrPincode: z.string().max(10).optional(),
    bankOperation: z.string().max(200).optional(),
    interestRate: z.string().max(20).optional(),
    noticePeriod: z.string().max(20).optional(),
    accountingYear: z.string().max(50).optional(),
    additionalPoints: z.string().max(2000).optional(),
    partnershipDuration: z.enum(["will", "fixed"]).optional(),
    partnershipStartDate: z.string().max(50).optional(),
    partnershipEndDate: z.string().max(50).optional(),
  })
  .partial();

// ─── Key fields for missing-fields hint ───────────────────────────────────────

const KEY_FIELDS: { key: string; label: string }[] = [
  { key: "businessName", label: "business name" },
  { key: "partners", label: "partner details" },
  { key: "deedDate", label: "deed date" },
  { key: "natureOfBusiness", label: "nature of business" },
  { key: "addrArea", label: "business address" },
];

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI assistant for an Indian Partnership Deed Generator application (OnEasy).

Your job: have a natural conversation to collect partnership deed details, then return structured data matching the exact schema below.

Input may contain mixed scripts (Hindi, Telugu, English). You must correctly interpret meaning across languages without requiring translation.

## RESPONSE FORMAT (STRICT)

Return ONLY a JSON object with this exact shape:
{
  "message": "your short conversational reply to the user",
  "extractedData": { ...accumulated partial deed data }
}

Do not include any text outside JSON.
Do not wrap in markdown or code fences.
Output must be directly parsable by JSON.parse.

## RULES

1. NEVER guess amounts, values, or numbers. If the user hasn't stated a value, omit that field entirely.
2. extractedData must carry forward ALL previously extracted fields (provided as "Current extracted data" below) plus any new fields from this conversation turn.
3. Only include fields the user has explicitly provided. Omit unknown fields.
4. Use exact enum values and formats listed below. Do not invent new values.
5. Ask focused follow-up questions to collect missing important fields (business name, partner names, deed date, nature of business, address).
6. Keep your "message" replies concise and helpful.
7. Return COMPLETE accumulated extractedData including all previously extracted fields. Do not drop fields from prior turns.
8. Do not remove or modify existing fields unless the user explicitly corrects them.
9. If a field is not EXPLICITLY mentioned by the user, DO NOT include it. Do not infer values.
10. Convert spoken numbers from any language:
    - "50 lakh", "50 लाख", "50 లక్షలు" → "5000000"
    - "12 percent" → "12"
    - Keep numeric strings as-is for percentage fields (capital, profit, interestRate).
11. Names must be preserved exactly as spoken (no translation of names).
12. If the user corrects a previously provided value, update it. Otherwise, do not remove or overwrite existing fields.
13. Partners array: Always return the COMPLETE array with all partners. Minimum 2 partners required.
14. For relation field, use exactly: "S/O" (Son of), "D/O" (Daughter of), "W/O" (Wife of), "H/O" (Husband of).
15. For bankOperation, use exactly: "jointly" or "either".
16. For partnershipDuration, use exactly: "will" (at will) or "fixed" (fixed term).
17. Dates should be in YYYY-MM-DD format.

## EXAMPLES

Example 1:
User: "I want to create a partnership deed for a textile business"
Response extractedData: { "natureOfBusiness": "Textile" }
(Note: businessName NOT included because user didn't name the business)

Example 2:
User: "The business name is Sharma Textiles, and my name is Rahul Sharma, age 35, son of Suresh Sharma"
Response extractedData: {
  "businessName": "Sharma Textiles",
  "partners": [
    { "name": "Rahul Sharma", "age": "35", "relation": "S/O", "fatherName": "Suresh Sharma" }
  ]
}

Example 3:
User: "My partner is Amit Verma, age 40, son of Ravi Verma. We each have 50% capital and profit."
Response extractedData: {
  "businessName": "Sharma Textiles",
  "partners": [
    { "name": "Rahul Sharma", "age": "35", "relation": "S/O", "fatherName": "Suresh Sharma", "capital": "50", "profit": "50" },
    { "name": "Amit Verma", "age": "40", "relation": "S/O", "fatherName": "Ravi Verma", "capital": "50", "profit": "50" }
  ]
}

Example 4 (Hindi):
User: "व्यापार का नाम शर्मा टेक्सटाइल्स है, deed date 15 March 2026"
Response extractedData: { "businessName": "शर्मा टेक्सटाइल्स", "deedDate": "2026-03-15" }

Example 5 (Address):
User: "Office is at 123, Lakshmi Towers, Ameerpet, Hyderabad, Telangana, 500016"
Response extractedData: {
  "addrDoorNo": "123",
  "addrBuildingName": "Lakshmi Towers",
  "addrArea": "Ameerpet",
  "addrDistrict": "Hyderabad",
  "addrState": "Telangana",
  "addrPincode": "500016"
}

Example 6 (Clauses):
User: "Interest rate should be 15%, notice period 6 months, bank account operated jointly"
Response extractedData: { "interestRate": "15", "noticePeriod": "6", "bankOperation": "jointly" }

## DEED DATA SCHEMA

### Partners (array of 2-20 objects)
Each partner has:
- name: full name in Title Case
- relation: "S/O" | "D/O" | "W/O" | "H/O" (relationship to father/husband)
- fatherName: father's/husband's name
- age: age as string
- address: residential address
- capital: capital contribution percentage as string (e.g. "50")
- profit: profit sharing percentage as string (e.g. "50")
- isManagingPartner: boolean (default false)
- isBankAuthorized: boolean (default false)

### Business Details
- businessName: name of the partnership firm
- businessDescriptionInput: short business description (used for AI objective generation)
- natureOfBusiness: nature/type of business (e.g. "Textile", "IT Services", "Restaurant")
- businessObjectives: detailed business objectives text
- deedDate: date of deed execution in YYYY-MM-DD format

### Business Address (sub-fields)
- addrDoorNo: door/plot number
- addrBuildingName: building/complex name
- addrArea: area/locality
- addrDistrict: city/district
- addrState: state
- addrPincode: 6-digit PIN code

### Banking & Clauses
- bankOperation: "jointly" (all partners must sign) or "either" (any partner can operate)
- interestRate: annual interest rate on capital as string (default "12")
- noticePeriod: notice period in months for dissolution as string (default "3")
- accountingYear: accounting year end date (default "31st March")
- additionalPoints: any additional clauses or points

### Partnership Duration
- partnershipDuration: "will" (partnership at will) or "fixed" (fixed term)
- partnershipStartDate: start date in YYYY-MM-DD format (required if fixed)
- partnershipEndDate: end date in YYYY-MM-DD format (only if fixed)

## CONVERSATION GUIDELINES

1. Start by asking the business name and nature of business.
2. Then collect partner details (names, ages, father names, addresses).
3. Ask about capital and profit sharing percentages.
4. Ask about business address.
5. Ask about banking operation preference, interest rate, notice period.
6. Ask about partnership duration (at will or fixed term).
7. When the user seems done, summarize what you've collected and suggest they review the wizard form.
8. If the user provides information naturally, extract structured data correctly.`;

// ─── Route Handler ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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
    const rateResult = await aiIntakeRateLimit.check(identifier);
    if (!rateResult.success) {
      return rateLimitResponse(rateResult.reset);
    }

    // 2. Parse and validate request body
    let body: { messages?: unknown; currentExtractedData?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { messages, currentExtractedData } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "messages must be a non-empty array." },
        { status: 400 }
      );
    }

    // Cap messages to prevent DoS
    if (messages.length > 20) {
      return NextResponse.json(
        { success: false, error: "Too many messages (max 20)." },
        { status: 400 }
      );
    }

    // Basic validation of message shape + per-message length limit
    for (const msg of messages) {
      if (
        typeof msg !== "object" ||
        msg === null ||
        !["user", "assistant"].includes(msg.role) ||
        typeof msg.content !== "string"
      ) {
        return NextResponse.json(
          { success: false, error: "Each message must have role ('user'|'assistant') and content (string)." },
          { status: 400 }
        );
      }
      if (msg.content.length > 2000) {
        return NextResponse.json(
          { success: false, error: "Message too long (max 2000 characters)." },
          { status: 400 }
        );
      }
    }

    const safeExtractedData =
      typeof currentExtractedData === "object" && currentExtractedData !== null
        ? currentExtractedData
        : {};

    // Validate currentExtractedData through Zod BEFORE injecting into prompt.
    // Prevents prompt injection via crafted field values.
    const extractedValidation = extractedDeedSchema.safeParse(safeExtractedData);
    let sanitizedExtractedData: Record<string, unknown>;
    if (extractedValidation.success) {
      sanitizedExtractedData = extractedValidation.data as Record<string, unknown>;
    } else {
      console.warn("[AI_INTAKE_INPUT_VALIDATION_FAIL]", {
        errorPaths: extractedValidation.error.issues.map((i) => i.path.join(".")),
      });
      sanitizedExtractedData = {};
    }

    // 3. Trim to last 20 messages
    const trimmedMessages = (messages as ChatMessage[]).slice(-20);

    // PII-safe request logging
    const lastUserMsg = trimmedMessages.filter((m) => m.role === "user").pop();
    console.log("[AI_INTAKE_REQUEST]", {
      messageCount: trimmedMessages.length,
      lastUserMessageLength: lastUserMsg?.content.length ?? 0,
      extractedKeyCount: Object.keys(sanitizedExtractedData).length,
      extractedKeys: Object.keys(sanitizedExtractedData),
    });

    // 4. Get API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[AI Intake] GEMINI_API_KEY not configured");
      return NextResponse.json(
        { success: false, error: "Server configuration error." },
        { status: 500 }
      );
    }

    // 5. Build Gemini contents
    const systemWithContext =
      SYSTEM_PROMPT +
      "\n\nCurrent extracted data:\n" +
      JSON.stringify(sanitizedExtractedData);

    const contents = [
      {
        role: "user",
        parts: [{ text: systemWithContext }],
      },
      ...trimmedMessages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
    ];

    // 6. Call Gemini (with timeout)
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
            contents,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
            },
          }),
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.error("[AI Intake] Gemini request timed out (15s)");
        return NextResponse.json(
          { success: false, error: "AI service timed out. Please try again." },
          { status: 504 }
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`[AI Intake] Gemini returned ${aiRes.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: "AI service error. Please try again." },
        { status: 502 }
      );
    }

    const aiJson = await aiRes.json();
    const rawText: string =
      aiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText) {
      console.error("[AI Intake] Gemini returned empty response");
      return NextResponse.json(
        { success: false, error: "AI returned an empty response. Please try again." },
        { status: 502 }
      );
    }

    // 7. Parse — direct JSON.parse, no regex
    let parsed: { message: string; extractedData: Record<string, unknown> };
    try {
      parsed = JSON.parse(rawText.trim());
    } catch (e) {
      console.error("[AI Intake] Failed to parse AI response:", rawText.slice(0, 500), e);
      return NextResponse.json(
        { success: false, error: "AI returned an unexpected response. Please try again." },
        { status: 502 }
      );
    }

    // 8. Validate shape
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.message !== "string" ||
      typeof parsed.extractedData !== "object" ||
      parsed.extractedData === null
    ) {
      console.error("[AI Intake] Invalid response shape:", JSON.stringify(parsed).slice(0, 500));
      return NextResponse.json(
        { success: false, error: "AI returned an unexpected response format. Please try again." },
        { status: 502 }
      );
    }

    // 9. Zod validation — field-by-field to keep valid fields even if some fail
    const partialSchema = extractedDeedSchema;
    const validatedData: Record<string, unknown> = {};
    const failedFields: string[] = [];

    for (const [key, value] of Object.entries(parsed.extractedData)) {
      const singleField = { [key]: value };
      const fieldResult = partialSchema.safeParse(singleField);
      if (fieldResult.success) {
        const processed = fieldResult.data as Record<string, unknown>;
        if (key in processed) {
          validatedData[key] = processed[key];
        }
      } else {
        failedFields.push(key);
      }
    }

    if (failedFields.length > 0) {
      console.warn("[AI_INTAKE_VALIDATION_PARTIAL]", {
        failedFields,
        passedFields: Object.keys(validatedData),
      });
    }

    // 10. Missing fields hint — only when 1-3 key fields remain
    let finalMessage = parsed.message;
    const missingFields = KEY_FIELDS.filter((f) => {
      const val = (validatedData as Record<string, unknown>)[f.key];
      if (f.key === "partners") {
        // Check that partners array has at least one partner with a name
        return (
          !Array.isArray(val) ||
          val.length === 0 ||
          !(val as Array<Record<string, unknown>>).some((p) => p.name)
        );
      }
      return val === undefined || val === null || val === "";
    });
    if (missingFields.length >= 1 && missingFields.length <= 3) {
      const missing = missingFields.map((f) => f.label).join(", ");
      finalMessage += `\n\nI still need: ${missing}.`;
    }

    // PII-safe response logging
    console.log("[AI_INTAKE_RESPONSE]", {
      extractedKeys: Object.keys(validatedData),
      extractedKeyCount: Object.keys(validatedData).length,
      missingKeyFields: missingFields.map((f) => f.key),
      validationPassed: failedFields.length === 0,
      failedFields: failedFields.length > 0 ? failedFields : undefined,
    });

    // Latency logging
    console.log("[AI_INTAKE_PERF]", {
      geminiMs: Date.now() - tGemini,
      totalMs: Date.now() - t0,
    });

    // 11. Return
    return NextResponse.json({
      message: finalMessage,
      extractedData: validatedData,
    });
  } catch (error) {
    console.error("[AI Intake] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
