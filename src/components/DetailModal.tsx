// -- DetailModal Component ----------------------------------------------------
// Modal overlay showing deed details, partner info, version history,
// and action buttons (Edit, Duplicate, Delete, Re-generate, Download).
// Ported from main.js viewStored() (lines 2498-2648).

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Download, Edit3, Copy, Trash2, RefreshCw } from 'lucide-react';
import type { Deed, DeedDocument } from '@/types';
import { fmtDate, formatFileSize } from '@/lib/utils';
import { dbGetDeedById, dbGetDocumentVersions } from '@/lib/db';
import { useDeedActions } from '@/hooks/useDeedActions';

// ── Props ───────────────────────────────────────────────────────────────────

interface DetailModalProps {
  deedId: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

// ── Helper: build detail rows from deed ─────────────────────────────────────

type DetailRow = [label: string, value: string];

function buildDetailRows(deed: Deed): DetailRow[] {
  const p = deed.payload || ({} as Deed['payload']);
  const rows: DetailRow[] = [];

  rows.push(['Business Name', `M/s. ${deed.business_name || 'N/A'}`]);

  // Partners — prefer child table, fall back to payload, then legacy fields
  const dbPartners = deed._partners || [];
  const storedPartners = p.partners || [];

  if (dbPartners.length > 0) {
    dbPartners.forEach((pt, i) => {
      const roles: string[] = [];
      if (pt.is_managing_partner) roles.push('Managing');
      if (pt.is_bank_authorized) roles.push('Bank Auth');
      const roleStr = roles.length > 0 ? ` [${roles.join(', ')}]` : '';
      rows.push([`Partner ${i + 1}`, (pt.name || 'N/A') + roleStr]);
    });
  } else if (storedPartners.length > 0) {
    storedPartners.forEach((pt, i) => {
      const roles: string[] = [];
      if (pt.isManagingPartner) roles.push('Managing');
      if (pt.isBankAuthorized) roles.push('Bank Auth');
      const roleStr = roles.length > 0 ? ` [${roles.join(', ')}]` : '';
      rows.push([`Partner ${i + 1}`, (pt.name || 'N/A') + roleStr]);
    });
  } else {
    rows.push(['Partner 1', deed.partner1_name || p.partner1Name || 'N/A']);
    rows.push(['Partner 2', deed.partner2_name || p.partner2Name || 'N/A']);
  }

  rows.push(['Date of Deed', p.deedDate || 'N/A']);

  // Duration
  if (p.partnershipDuration === 'fixed') {
    rows.push(['Duration', `Fixed: ${p.partnershipStartDate || '\u2014'} to ${p.partnershipEndDate || '\u2014'}`]);
  } else {
    rows.push(['Duration', 'At Will of the Partners']);
  }

  rows.push(['Nature', p.natureOfBusiness || 'N/A']);

  // Address — prefer child table
  const dbAddr = deed._address;
  if (dbAddr && dbAddr.full_address) {
    rows.push(['Registered Address', dbAddr.full_address]);
  } else {
    rows.push(['Registered Address', p.registeredAddress || 'N/A']);
  }

  // Capital & Profit
  if (dbPartners.length > 0) {
    const capStr = dbPartners.map((pt, i) => `P${i + 1}: ${pt.capital_pct ?? 0}%`).join(' / ');
    const profStr = dbPartners.map((pt, i) => `P${i + 1}: ${pt.profit_pct ?? 0}%`).join(' / ');
    rows.push(['Capital', capStr]);
    rows.push(['Profit', profStr]);
  } else if (storedPartners.length > 0) {
    const capStr = storedPartners.map((pt, i) => `P${i + 1}: ${pt.capital || 0}%`).join(' / ');
    const profStr = storedPartners.map((pt, i) => `P${i + 1}: ${pt.profit || 0}%`).join(' / ');
    rows.push(['Capital', capStr]);
    rows.push(['Profit', profStr]);
  } else {
    rows.push(['Capital (P1/P2)', `${p.partner1Capital || 0}% / ${p.partner2Capital || 0}%`]);
    rows.push(['Profit (P1/P2)', `${p.partner1Profit || 0}% / ${p.partner2Profit || 0}%`]);
  }

  rows.push(['Bank Operation', p.bankOperation === 'either' ? 'Either' : 'Jointly']);
  rows.push(['Interest Rate', `${p.interestRate || '12'}% p.a.`]);
  rows.push(['Notice Period', `${p.noticePeriod || '3'} months`]);

  return rows;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DetailModal({ deedId, onClose, onRefresh }: DetailModalProps) {
  const [deed, setDeed] = useState<Deed | null>(null);
  const [versions, setVersions] = useState<DeedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const { editDeed, duplicateDeed, deleteDeed, regenerateDeed, downloadDocument } =
    useDeedActions({ onRefresh });

  // ── Fetch deed + versions ──
  const loadDeed = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [d, vers] = await Promise.all([
        dbGetDeedById(id),
        dbGetDocumentVersions(id),
      ]);
      if (!d) {
        setError('Deed not found');
        return;
      }
      setDeed(d);
      setVersions(vers);
    } catch (err) {
      console.error('[DetailModal] Load failed:', err);
      setError('Failed to load deed details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (deedId) loadDeed(deedId);
  }, [deedId, loadDeed]);

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Focus trap ──
  useEffect(() => {
    if (!deedId) return;
    const prev = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => prev?.focus();
  }, [deedId]);

  // Don't render if no deed selected
  if (!deedId) return null;

  const details = deed ? buildDetailRows(deed) : [];
  const hasDoc = !!deed?.doc_url;

  // ── Action handlers ──
  const handleEdit = async () => {
    if (!deed) return;
    await editDeed(deed.id);
    onClose();
  };

  const handleDuplicate = async () => {
    if (!deed) return;
    await duplicateDeed(deed.id);
    onClose();
  };

  const handleDelete = async () => {
    if (!deed) return;
    if (!window.confirm('Delete this partnership deed?')) return;
    await deleteDeed(deed.id);
    onClose();
  };

  const handleRegenerate = async () => {
    if (!deed) return;
    await regenerateDeed(deed.id);
    onClose();
  };

  const handleDownloadLatest = async () => {
    if (!deed?.doc_url) return;
    try {
      await downloadDocument(deed.doc_url);
    } catch {
      alert('Failed to download document.');
    }
  };

  const handleVersionDownload = async (storagePath: string, fileName: string) => {
    try {
      await downloadDocument(storagePath, fileName);
    } catch {
      alert('Failed to download this version.');
    }
  };

  // ── Button class helpers ──
  const btnBase = `
    px-4 py-2 rounded-sm text-sm font-medium min-h-[36px]
    transition-all duration-200 inline-flex items-center gap-1.5
  `;
  const btnOutline = `${btnBase} border border-navy-200 text-navy-700 hover:bg-navy-50`;
  const btnDanger = `${btnBase} border border-red-200 text-red-600 hover:bg-red-50`;
  const btnGold = `${btnBase} bg-accent text-navy-900 font-semibold hover:bg-gold-400`;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="
          bg-white rounded-[16px] shadow-lg max-w-[640px] w-full max-h-[85vh]
          overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200
          focus:outline-none
        "
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-navy-100">
          <h2
            id="modal-title"
            className="font-display text-lg text-navy-800 m-0"
          >
            {deed ? `M/s. ${deed.business_name || 'Deed Details'}` : 'Loading...'}
          </h2>
          <button
            onClick={onClose}
            className="
              bg-transparent border-none text-xl text-navy-400 cursor-pointer
              min-w-[44px] min-h-[44px] flex items-center justify-center
              rounded-sm hover:bg-navy-50 hover:text-navy-800 transition-colors
            "
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {loading && (
            <div className="text-center py-8 text-navy-500 text-sm">
              Loading deed details...
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-red-500 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && deed && (
            <>
              {/* Detail rows */}
              <div className="space-y-0">
                {details.map(([label, value], i) => (
                  <div
                    key={i}
                    className={`
                      flex justify-between py-3 text-sm
                      ${i < details.length - 1 ? 'border-b border-navy-50' : ''}
                    `}
                  >
                    <span className="text-navy-500">{label}</span>
                    <span className="text-navy-800 font-medium text-right max-w-[60%] break-words">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Version history */}
              {versions.length > 0 && (
                <div className="mt-4 pt-4 border-t-2 border-navy-50">
                  <div className="text-sm font-semibold text-navy-800 mb-3">
                    Document Versions ({versions.length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {versions.map((ver) => {
                      const sizeStr = ver.file_size
                        ? formatFileSize(ver.file_size)
                        : '';
                      const genDate = ver.generated_at
                        ? fmtDate(ver.generated_at)
                        : '';
                      return (
                        <div
                          key={ver.id}
                          className="
                            flex items-center gap-3 px-3 py-2
                            bg-navy-25 border border-navy-50 rounded-sm text-xs
                          "
                        >
                          <span className="font-semibold text-accent min-w-[2.5rem]">
                            v{ver.version}
                          </span>
                          <span className="flex-1 text-navy-500">
                            {genDate}
                            {sizeStr ? ` \u00B7 ${sizeStr}` : ''}
                          </span>
                          <button
                            onClick={() =>
                              handleVersionDownload(ver.storage_path, ver.file_name)
                            }
                            className="
                              px-2 py-1 border border-navy-200 rounded-sm text-xs
                              font-medium text-navy-700 hover:bg-navy-50
                              transition-colors whitespace-nowrap
                            "
                          >
                            Download
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !error && deed && (
          <div className="flex gap-3 px-6 py-4 border-t border-navy-100 flex-wrap justify-end">
            <button onClick={onClose} className={btnOutline}>
              Close
            </button>
            <button onClick={handleDelete} className={btnDanger}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button onClick={handleEdit} className={btnOutline}>
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button onClick={handleDuplicate} className={btnOutline}>
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
            <button onClick={handleRegenerate} className={btnOutline}>
              <RefreshCw className="w-3.5 h-3.5" />
              Re-generate
            </button>
            {hasDoc && (
              <button onClick={handleDownloadLatest} className={btnGold}>
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
