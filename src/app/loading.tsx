// ── Root Loading State ────────────────────────────────────────────────────────
// Shown during route transitions for the main app page.
// Mimics the app shell layout with skeleton placeholders.

export default function Loading() {
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-[280px] min-w-[280px] bg-sidebar-bg flex-col p-5">
        {/* Logo */}
        <div className="h-8 w-28 bg-white/10 rounded mb-8 animate-pulse" />
        {/* Button skeleton */}
        <div className="h-10 w-full bg-white/10 rounded mb-3 animate-pulse" />
        <div className="h-10 w-full bg-white/5 rounded mb-6 animate-pulse" />
        {/* Draft list skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col bg-navy-50 overflow-hidden">
        {/* Header skeleton */}
        <div className="shrink-0 px-4 pt-6 lg:px-8 lg:pt-8">
          <div className="max-w-[820px] mx-auto">
            <div className="h-7 w-48 bg-navy-200 rounded mb-2 animate-pulse" />
            <div className="h-4 w-72 bg-navy-100 rounded mb-6 animate-pulse" />
            {/* Progress bar skeleton */}
            <div className="h-1.5 w-full bg-navy-100 rounded-full mb-4 animate-pulse" />
            {/* Tabs skeleton */}
            <div className="flex gap-3 mb-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-9 w-24 bg-navy-100 rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Form card skeleton */}
        <div className="flex-1 overflow-hidden px-4 lg:px-8">
          <div className="max-w-[820px] mx-auto">
            <div className="bg-white rounded-[10px] border border-navy-100 p-6 md:p-8 shadow-card">
              <div className="space-y-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <div className="h-4 w-28 bg-navy-100 rounded mb-2 animate-pulse" />
                    <div className="h-10 w-full bg-navy-50 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
