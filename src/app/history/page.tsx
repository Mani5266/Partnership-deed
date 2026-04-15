// -- History Page (Redirect) ---------------------------------------------------
// Since the main page handles both generator and history views via
// useWizardStore.currentPage, this route simply sets currentPage to 'history'
// and renders the same app shell. This avoids duplicating the entire layout.

'use client';

import { useEffect } from 'react';
import { useWizardStore } from '@/hooks/useWizardStore';
import { useRouter } from 'next/navigation';

export default function HistoryPage() {
  const switchPage = useWizardStore((s) => s.switchPage);
  const router = useRouter();

  useEffect(() => {
    switchPage('history');
    router.replace('/');
  }, [switchPage, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-main)] font-body">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="mt-3 text-sm text-navy-500">Loading history...</p>
      </div>
    </div>
  );
}
