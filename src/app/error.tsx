// ── Root Error Boundary ──────────────────────────────────────────────────────
// Catches unhandled errors in all route segments below the root layout.
// Displays a branded recovery UI with retry action.

'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="font-display text-2xl text-navy-800 mb-2">
          Something went wrong
        </h1>
        <p className="text-navy-500 text-sm mb-6">
          An unexpected error occurred. Your data has been saved automatically.
          {error.digest && (
            <span className="block mt-1 text-xs text-navy-400">
              Error ID: {error.digest}
            </span>
          )}
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="
              px-5 py-2.5 rounded-md text-sm font-semibold
              bg-accent text-navy-900
              hover:bg-accent-dark
              focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
              transition-colors
            "
          >
            Try again
          </button>
          <a
            href="/"
            className="
              px-5 py-2.5 rounded-md text-sm font-medium
              text-navy-600 border border-navy-200
              hover:bg-navy-100
              transition-colors
            "
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
