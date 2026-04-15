// ── Print Loading State ───────────────────────────────────────────────────────
// Shown while the print/deed-preview page loads data.

export default function PrintLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-navy-200 border-t-accent rounded-full animate-spin mb-4" />
        <p className="text-navy-500 text-sm">Loading deed preview&hellip;</p>
      </div>
    </div>
  );
}
