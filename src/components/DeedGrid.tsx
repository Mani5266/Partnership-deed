// -- DeedGrid + DeedCard Components ------------------------------------------
// History grid with responsive cards for each saved deed.
// Actions: Download, Re-generate, Edit, Duplicate, Details, Delete.

'use client';

import React, { useEffect } from 'react';
import { useDeedList } from '@/hooks/useDeedList';
import { useDeedActions } from '@/hooks/useDeedActions';
import type { Deed } from '@/types';
import { fmtDate } from '@/lib/utils';
import { dbGetDeedById } from '@/lib/db';

// ---------------------------------------------------------------------------
// DeedCard
// ---------------------------------------------------------------------------

interface DeedCardProps {
  deed: Deed;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
}

function DeedCard({
  deed,
  onView,
  onEdit,
  onDuplicate,
  onRegenerate,
  onDelete,
  onDownload,
}: DeedCardProps) {
  const p = deed.payload || ({} as Deed['payload']);

  // Build partner names
  let partnerNames: string;
  if (p.partners && Array.isArray(p.partners) && p.partners.length > 0) {
    partnerNames = p.partners.map((pt) => pt.name || 'N/A').join(' & ');
  } else {
    const p1 = deed.partner1_name || p.partner1Name || 'N/A';
    const p2 = deed.partner2_name || p.partner2Name || 'N/A';
    partnerNames = `${p1} & ${p2}`;
  }

  const versionCount = deed._versionCount || 0;
  const hasDoc = !!deed.doc_url;

  const actionBtnCls = `
    px-2.5 py-1.5 border rounded-sm text-2xs font-medium
    min-h-[32px] transition-all duration-200
  `;

  return (
    <div className="bg-white border border-navy-100 rounded-[10px] p-4 hover:border-navy-200 hover:shadow-card transition-all duration-200">
      {/* Title */}
      <div className="text-sm font-semibold text-navy-800 mb-1 truncate">
        M/s. {deed.business_name || 'Untitled'}
      </div>

      {/* Meta: date + version badge */}
      <div className="flex items-center gap-2 text-2xs text-navy-400 mb-2">
        <span>{fmtDate(deed.created_at)}</span>
        {versionCount > 1 && (
          <span className="px-1.5 py-0.5 bg-accent/10 text-accent-dark rounded-full text-[0.68rem] font-medium">
            {versionCount} versions
          </span>
        )}
      </div>

      {/* Partners */}
      <div className="text-2xs text-navy-500 mb-3 truncate">{partnerNames}</div>

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        {hasDoc && (
          <button
            onClick={() => onDownload(deed.id)}
            className={`${actionBtnCls} border-accent text-accent-dark hover:bg-accent-bg`}
          >
            Download
          </button>
        )}
        <button
          onClick={() => onRegenerate(deed.id)}
          className={`${actionBtnCls} border-accent text-accent-dark hover:bg-accent-bg`}
        >
          Re-generate
        </button>
        <button
          onClick={() => onEdit(deed.id)}
          className={`${actionBtnCls} border-navy-200 text-navy-600 hover:bg-navy-50`}
        >
          Edit
        </button>
        <button
          onClick={() => onDuplicate(deed.id)}
          className={`${actionBtnCls} border-navy-200 text-navy-600 hover:bg-navy-50`}
        >
          Duplicate
        </button>
        <button
          onClick={() => onView(deed.id)}
          className={`${actionBtnCls} border-navy-200 text-navy-600 hover:bg-navy-50`}
        >
          Details
        </button>
        <button
          onClick={() => onDelete(deed.id)}
          className={`${actionBtnCls} border-red-200 text-red-600 hover:bg-red-50`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeedGrid
// ---------------------------------------------------------------------------

interface DeedGridProps {
  onViewDeed: (id: string) => void;
}

export function DeedGrid({ onViewDeed }: DeedGridProps) {
  const { deeds, loading, error, fetchDeeds } = useDeedList();
  const {
    editDeed,
    duplicateDeed,
    deleteDeed,
    regenerateDeed,
    downloadDocument,
  } = useDeedActions({ onRefresh: fetchDeeds });

  useEffect(() => {
    fetchDeeds();
  }, [fetchDeeds]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this partnership deed?')) return;
    await deleteDeed(id);
  };

  /** Download latest doc for a deed by fetching its doc_url first */
  const handleDownload = async (id: string) => {
    try {
      const deed = await dbGetDeedById(id);
      if (!deed) return;
      const docUrl = deed.doc_url;
      if (!docUrl) {
        alert('No document found. Please re-generate it first.');
        return;
      }
      await downloadDocument(docUrl);
    } catch (err) {
      console.error('[DeedGrid] Download failed:', err);
      alert('Failed to download document. Try re-generating.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-navy-400 text-[0.82rem]">
        <span className="w-5 h-5 border-2 border-current border-r-transparent rounded-full animate-spin mr-3" />
        Loading deed history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-red-600 text-[0.82rem]">
        Failed to load history. {error}
      </div>
    );
  }

  if (!deeds || deeds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-navy-400">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-40">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
        <p className="text-[0.82rem]">No partnership deeds yet.</p>
        <p className="text-2xs mt-1">Create your first deed to see it here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {deeds.map((deed) => (
        <DeedCard
          key={deed.id}
          deed={deed}
          onView={onViewDeed}
          onEdit={editDeed}
          onDuplicate={duplicateDeed}
          onRegenerate={regenerateDeed}
          onDelete={handleDelete}
          onDownload={handleDownload}
        />
      ))}
    </div>
  );
}
