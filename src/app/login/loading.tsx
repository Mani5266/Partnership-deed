// ── Login Loading State ───────────────────────────────────────────────────────
// Shown during route transition to the login page.

export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-md">
        {/* Logo skeleton */}
        <div className="text-center mb-8">
          <div className="h-8 w-32 bg-white/10 rounded mx-auto mb-2 animate-pulse" />
          <div className="h-4 w-48 bg-white/5 rounded mx-auto animate-pulse" />
        </div>
        {/* Form card skeleton */}
        <div className="bg-white rounded-xl p-8">
          <div className="space-y-5">
            <div className="h-5 w-20 bg-navy-100 rounded animate-pulse" />
            <div className="h-10 w-full bg-navy-50 rounded animate-pulse" />
            <div className="h-5 w-20 bg-navy-100 rounded animate-pulse" />
            <div className="h-10 w-full bg-navy-50 rounded animate-pulse" />
            <div className="h-11 w-full bg-navy-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
