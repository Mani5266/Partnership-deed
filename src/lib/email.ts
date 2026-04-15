// ─── Email Service ─────────────────────────────────────────────────────────
// Sends transactional emails via Resend (primary) with Mailjet fallback.
// Uses raw fetch — zero SDK dependencies.
// NEVER logs email addresses or token values.

type EmailResult =
  | { success: true; provider: "resend" | "mailjet" | "dev-noop" }
  | { success: false; error: string };

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// ─── Resend ───────────────────────────────────────────────────────────────────

async function sendViaResend(params: SendEmailParams): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "unknown");
      throw new Error(`Resend ${res.status}: ${body}`);
    }

    return { success: true, provider: "resend" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Mailjet ──────────────────────────────────────────────────────────────────

async function sendViaMailjet(params: SendEmailParams): Promise<EmailResult> {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("MAILJET keys not set");

  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: from, Name: "OnEasy" },
            To: [{ Email: params.to }],
            Subject: params.subject,
            HTMLPart: params.html,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "unknown");
      throw new Error(`Mailjet ${res.status}: ${body}`);
    }

    return { success: true, provider: "mailjet" };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  // Dev no-op: if no email provider keys are configured, skip gracefully
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasMailjet = Boolean(
    process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY
  );

  if (!hasResend && !hasMailjet) {
    if (process.env.NODE_ENV === "production") {
      console.error("[EMAIL] No email provider configured in production!");
      return { success: false, error: "No email provider configured" };
    }
    console.warn(
      "[EMAIL] No email provider keys found. Skipping send (dev mode)."
    );
    return { success: true, provider: "dev-noop" };
  }

  // Try Resend first
  if (hasResend) {
    try {
      const result = await sendViaResend(params);
      console.log("[EMAIL] provider=resend success=true");
      return result;
    } catch (err) {
      console.error("[EMAIL] provider=resend success=false", {
        error: err instanceof Error ? err.message : "unknown",
      });
      // Fall through to Mailjet
    }
  }

  // Fallback to Mailjet
  if (hasMailjet) {
    try {
      const result = await sendViaMailjet(params);
      console.log("[EMAIL] provider=mailjet success=true");
      return result;
    } catch (err) {
      console.error("[EMAIL] provider=mailjet success=false", {
        error: err instanceof Error ? err.message : "unknown",
      });
      return {
        success: false,
        error: "All email providers failed",
      };
    }
  }

  return { success: false, error: "No available email provider succeeded" };
}
