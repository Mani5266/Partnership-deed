// ── Global Error Boundary ────────────────────────────────────────────────────
// Catches errors in the root layout itself. Must provide its own <html>/<body>
// since it replaces the entire root layout on error.
// Uses inline styles (no Tailwind) since the layout/CSS pipeline may be broken.

'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalErrorBoundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8f9fc',
          fontFamily:
            '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: '#1e293b',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center', padding: '0 16px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 28,
            }}
          >
            !
          </div>

          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: '0 0 8px',
            }}
          >
            Critical Error
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#64748b',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}
          >
            The application encountered a critical error. Please try refreshing
            the page.
            {error.digest && (
              <span
                style={{
                  display: 'block',
                  marginTop: 4,
                  fontSize: 12,
                  color: '#94a3b8',
                }}
              >
                Error ID: {error.digest}
              </span>
            )}
          </p>

          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}
          >
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: '#f0b929',
                color: '#0f172a',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                color: '#475569',
                border: '1px solid #e2e8f0',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
