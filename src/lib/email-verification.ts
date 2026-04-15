// ─── Email Verification Logic ─────────────────────────────────────────────
// Token creation, hashing, and verification.
// Raw tokens are NEVER stored — only SHA-256 hashes.

import crypto from "crypto";
import { createSupabaseAdminClient } from "./supabase-server";
import { sendEmail } from "./email";

// ─── Token Hashing ────────────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Types ────────────────────────────────────────────────────────────────────

type VerificationResult =
  | { success: true; provider: string }
  | { success: false; error: string };

type TokenVerifyResult =
  | { success: true }
  | { success: false; error: string };

// ─── Clear Email Confirmation ─────────────────────────────────────────────────

/**
 * Clears email_confirmed_at for a user so they start as "unverified".
 * Called right after signup when Supabase "Confirm email" is OFF
 * (which auto-confirms users). This ensures our custom flow is the gate.
 */
export async function clearEmailConfirmation(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { custom_email_verified: false },
  });
  if (error) {
    console.error("[EMAIL_VERIFY] Failed to set custom_email_verified=false", {
      userId,
      error: error.message,
    });
  } else {
    // Verify-after-write
    const { data: check } = await admin.auth.admin.getUserById(userId);
    const val = check?.user?.app_metadata?.custom_email_verified;
    console.log("[EMAIL_VERIFY] clearEmailConfirmation result", {
      userId,
      custom_email_verified: val,
      success: val === false,
    });
  }
}

// ─── Create & Send Verification ───────────────────────────────────────────────

/**
 * Creates a verification token and sends a verification email.
 * 1. Fetches user email from DB (NEVER trusts caller)
 * 2. Deletes any existing tokens for this user
 * 3. Generates a new token, hashes it, stores the hash
 * 4. Sends the verification email with the raw token in the link
 */
export async function createAndSendVerification(
  userId: string
): Promise<VerificationResult> {
  const admin = createSupabaseAdminClient();

  // 1. Get user email from DB — never trust the caller
  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(userId);

  if (userError || !userData?.user?.email) {
    console.error("[EMAIL_VERIFY] Failed to fetch user", {
      userId,
      hasError: Boolean(userError),
    });
    return { success: false, error: "User not found" };
  }

  const email = userData.user.email;

  // 2. Delete existing tokens for this user (cleanup before re-issue)
  const { error: deleteError } = await Promise.resolve(
    admin
      .from("email_verifications")
      .delete()
      .eq("user_id", userId)
  );

  if (deleteError) {
    console.error("[EMAIL_VERIFY] Failed to delete old tokens", {
      userId,
      error: deleteError.message,
    });
    // Non-fatal — continue with insert (unique constraint on token_hash protects us)
  }

  // 3. Generate raw token and hash it
  const rawToken = crypto.randomUUID();
  const tokenHash = hashToken(rawToken);

  // 4. Insert hashed token (expires in 15 minutes)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: insertError } = await Promise.resolve(
    admin.from("email_verifications").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
  );

  if (insertError) {
    console.error("[EMAIL_VERIFY] Failed to insert token", {
      userId,
      error: insertError.message,
      code: insertError.code,
    });
    return { success: false, error: "Failed to create verification token" };
  }

  console.log("[EMAIL_VERIFY] Token inserted", {
    userId,
    tokenHashPrefix: tokenHash.slice(0, 8),
    expiresAt: expiresAt,
  });

  // 5. Build verification link with raw token
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyLink = `${appUrl}/api/verify-email?token=${rawToken}`;

  // 6. Send email
  const emailResult = await sendEmail({
    to: email,
    subject: "Verify your email — OnEasy",
    html: buildVerificationEmail(verifyLink),
  });

  if (!emailResult.success) {
    console.error("[EMAIL_VERIFY] Email send failed", { userId });
    return { success: false, error: "Failed to send verification email" };
  }

  console.log("[EMAIL_VERIFY] Verification email sent", {
    userId,
    provider: emailResult.provider,
  });

  return { success: true, provider: emailResult.provider };
}

// ─── Verify Token ─────────────────────────────────────────────────────────────

/**
 * Verifies a raw token:
 * 1. Hashes the raw token
 * 2. Looks up the token row by hash
 * 3. Checks expiry in JS (avoids PostgREST .gt() filter issues)
 * 4. Deletes the row (single-use)
 * 5. Marks user email as confirmed in Supabase Auth
 */
export async function verifyToken(rawToken: string): Promise<TokenVerifyResult> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  console.log("[EMAIL_VERIFY] Looking up token", {
    tokenHashPrefix: tokenHash.slice(0, 8),
    now,
  });

  // Step 1: Find the token row (must exist and not be expired)
  const { data: row, error: selectError } = await Promise.resolve(
    admin
      .from("email_verifications")
      .select("id, user_id, expires_at")
      .eq("token_hash", tokenHash)
      .single()
  );

  if (selectError || !row) {
    console.error("[EMAIL_VERIFY] Token not found in DB", {
      errorMessage: selectError?.message ?? "none",
      errorCode: selectError?.code ?? "none",
      tokenHashPrefix: tokenHash.slice(0, 8),
    });
    return { success: false, error: "invalid-or-expired" };
  }

  // Check expiry
  if (new Date(row.expires_at) <= new Date()) {
    console.error("[EMAIL_VERIFY] Token expired", {
      expiresAt: row.expires_at,
      now,
      tokenHashPrefix: tokenHash.slice(0, 8),
    });
    // Clean up the expired row
    await Promise.resolve(
      admin.from("email_verifications").delete().eq("id", row.id)
    );
    return { success: false, error: "invalid-or-expired" };
  }

  // Step 2: Delete the token (single-use)
  const { error: deleteError } = await Promise.resolve(
    admin.from("email_verifications").delete().eq("id", row.id)
  );

  if (deleteError) {
    console.error("[EMAIL_VERIFY] Failed to delete token after verification", {
      errorMessage: deleteError.message,
    });
    // Non-fatal — continue with confirmation (token was valid)
  }

  // Mark user email as confirmed: set both email_confirm (for Supabase's own tracking)
  // AND our custom app_metadata flag (which is our actual source of truth)
  const { error: updateError } = await admin.auth.admin.updateUserById(
    row.user_id,
    {
      email_confirm: true,
      app_metadata: { custom_email_verified: true },
    }
  );

  if (updateError) {
    console.error("[EMAIL_VERIFY] Failed to confirm user email", {
      userId: row.user_id,
      error: updateError.message,
    });
    return { success: false, error: "Failed to confirm email" };
  }

  console.log("[EMAIL_VERIFY] Email verified successfully", {
    userId: row.user_id,
  });

  return { success: true };
}

// ─── Email Template ───────────────────────────────────────────────────────────

function buildVerificationEmail(verifyLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:32px;height:32px;background-color:#f0b929;border-radius:8px;text-align:center;vertical-align:middle;font-weight:900;color:#0f172a;font-size:14px;">O</td>
                  <td style="padding-left:12px;color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-0.02em;">OnEasy</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">Verify your email address</h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#64748b;">
                Click the button below to verify your email and activate your account. This link expires in 15 minutes.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${verifyLink}" style="display:inline-block;background-color:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
                If you didn't create an account on OnEasy, you can safely ignore this email.
              </p>
              <p style="margin:12px 0 0;font-size:11px;line-height:1.6;color:#cbd5e1;word-break:break-all;">
                If the button doesn't work, copy and paste this link: ${verifyLink}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;">
                &copy; 2026 OnEasy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
