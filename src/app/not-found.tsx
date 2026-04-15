// ── Custom 404 Page ──────────────────────────────────────────────────────────
// Shown when Next.js cannot match a route. Branded with OnEasy design tokens.

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* 404 badge */}
        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wide mb-6">
          404
        </div>

        <h1 className="font-display text-2xl text-navy-800 mb-2">
          Page not found
        </h1>
        <p className="text-navy-500 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="
            inline-flex items-center gap-2
            px-5 py-2.5 rounded-md text-sm font-semibold
            bg-accent text-navy-900
            hover:bg-accent-dark
            focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
            transition-colors
          "
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to Generator
        </Link>
      </div>
    </div>
  );
}
