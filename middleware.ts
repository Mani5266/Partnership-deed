import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Copies auth cookies from the supabaseResponse onto a redirect response.
 * Without this, token refreshes during getUser() are silently lost on redirects,
 * causing repeated re-refreshes and potential redirect loops.
 */
function redirectWithCookies(url: URL, supabaseResponse: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((c) =>
    redirect.cookies.set(c.name, c.value, c)
  );
  return redirect;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/login";
  const isVerifyEmailPage = pathname === "/verify-email";
  const isResetPasswordPage = pathname === "/reset-password";

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh the session (important for keeping tokens alive)
    const { data } = await supabase.auth.getUser();

    // ── No user: allow /login and /reset-password only ─────────────────────
    if (!data?.user) {
      if (!isLoginPage && !isResetPasswordPage) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return redirectWithCookies(url, supabaseResponse);
      }
      return supabaseResponse;
    }

    // ── User exists: check email verification via our custom flag ────────
    const isVerified = data.user.app_metadata?.custom_email_verified === true;

    if (!isVerified) {
      // Unverified users can access /login, /verify-email, and /reset-password only
      if (isLoginPage || isVerifyEmailPage || isResetPasswordPage) {
        return supabaseResponse;
      }
      // All other routes → redirect to /verify-email
      const url = request.nextUrl.clone();
      url.pathname = "/verify-email";
      return redirectWithCookies(url, supabaseResponse);
    }

    // ── Verified user: block /login, /verify-email, /reset-password → redirect / ──
    if (isLoginPage || isVerifyEmailPage || isResetPasswordPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return redirectWithCookies(url, supabaseResponse);
    }

    return supabaseResponse;
  } catch {
    // If anything fails (Supabase unreachable, env vars missing, etc.)
    // fail CLOSED — redirect to login for safety
    if (!isLoginPage && !isResetPasswordPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectWithCookies(url, supabaseResponse);
    }
    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets (svg, png, jpg, etc.)
     * - API routes (handled by their own auth — return 401 JSON, not redirects)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
