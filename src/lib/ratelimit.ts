import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Whether rate limiting is active.
 * If Upstash env vars are missing, rate limiting is silently disabled
 * (allows local development without Redis).
 */
const isConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// Lazy-initialize Redis client only if credentials exist
function getRedis(): Redis | null {
  if (!isConfigured) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────

/**
 * /api/ocr — 20 requests per hour per identifier (user ID or IP).
 * Allows Aadhaar uploads for partners, plus retries.
 */
export const ocrRateLimit = createLimiter("ocr", {
  requests: 20,
  window: "1 h",
});

/**
 * /api/generate (deed generation) — 10 requests per hour per identifier.
 */
export const generateRateLimit = createLimiter("generate", {
  requests: 10,
  window: "1 h",
});

/**
 * /api/generate-objective — 20 requests per hour per identifier.
 * AI business objective generation.
 */
export const objectiveRateLimit = createLimiter("objective", {
  requests: 20,
  window: "1 h",
});

/**
 * /api/suggest-business-names — 20 requests per hour per identifier.
 * AI business name suggestions.
 */
export const suggestNamesRateLimit = createLimiter("suggest-names", {
  requests: 20,
  window: "1 h",
});

/**
 * /api/ai-intake — 30 requests per hour per identifier.
 * Multi-turn chat for AI-assisted form filling.
 */
export const aiIntakeRateLimit = createLimiter("ai-intake", {
  requests: 30,
  window: "1 h",
});

/**
 * /api/stt — 30 requests per hour per identifier.
 * Voice-to-text transcription.
 */
export const sttRateLimit = createLimiter("stt", {
  requests: 30,
  window: "1 h",
});

/**
 * /api/reset-password — 10 requests per hour per IP.
 * Prevents brute-forcing reset tokens.
 */
export const resetPasswordRateLimit = createLimiter("reset-password", {
  requests: 10,
  window: "1 h",
});

/**
 * /api/check-verification — 20 requests per hour per IP.
 * Prevents enumeration of user verification statuses.
 */
export const checkVerificationRateLimit = createLimiter("check-verification", {
  requests: 20,
  window: "1 h",
});

/**
 * /api/send-verification & /api/resend-verification — 5 requests per hour per email.
 */
export const emailVerifyRateLimit = createLimiter("email-verify", {
  requests: 5,
  window: "1 h",
});

/**
 * /api/send-verification & /api/resend-verification — 10 requests per hour per IP.
 */
export const emailVerifyIpRateLimit = createLimiter("email-verify-ip", {
  requests: 10,
  window: "1 h",
});

// ─── Factory ──────────────────────────────────────────────────────────────────

interface LimiterConfig {
  requests: number;
  window: "1 h" | "1 m" | "1 d";
}

export function createLimiter(prefix: string, config: LimiterConfig) {
  const redis = getRedis();

  if (!redis) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `\n[ratelimit] Limiter "${prefix}" is a NO-OP — Upstash env vars missing. OK in local dev, MUST be configured for production.\n`
      );
    }

    return {
      check: async (_identifier: string) => {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            `[SECURITY] Rate limiter "${prefix}" disabled — UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production.`
          );
        }
        return {
          success: true as const,
          limit: config.requests,
          remaining: config.requests,
          reset: Date.now() + 3600_000,
        };
      },
    };
  }

  const windowMs =
    config.window === "1 h"
      ? "1 h"
      : config.window === "1 m"
        ? "1 m"
        : "1 d";

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, windowMs),
    prefix: `partnership-deed:ratelimit:${prefix}`,
    analytics: true,
  });

  return {
    check: async (identifier: string) => {
      const result = await limiter.limit(identifier);
      return result;
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the client identifier for rate limiting.
 * Prefers user ID (auth-validated) over IP for logged-in apps.
 */
export function getClientIdentifier(
  request: Request,
  userId?: string | null
): string {
  if (userId) return `user:${userId}`;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return `ip:${firstIp}`;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp}`;

  return "ip:unknown";
}

/**
 * Returns a 429 response with standard rate limit headers.
 */
export function rateLimitResponse(resetTimestamp: number): NextResponse {
  const retryAfterSeconds = Math.ceil(
    (resetTimestamp - Date.now()) / 1000
  );

  return NextResponse.json(
    {
      success: false,
      error: "Too many requests. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
        "X-RateLimit-Reset": String(resetTimestamp),
      },
    }
  );
}
