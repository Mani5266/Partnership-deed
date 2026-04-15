// -- Step0Partners Component ------------------------------------------------
// Step 0: Partners & Roles pane.
// Contains: partner count toolbar, bulk Aadhaar upload, PartnerRoles checklist,
// list of PartnerCard components, add partner button, and step navigation.

'use client';

import React, { useRef } from 'react';
import { usePartners } from '@/hooks/usePartners';
import { useAadhaarOCR } from '@/hooks/useAadhaarOCR';
import { useWizardStore } from '@/hooks/useWizardStore';
import { MAX_PARTNERS, MIN_PARTNERS } from '@/types';
import { PartnerCard } from './PartnerCard';
import { PartnerRoles } from './PartnerRoles';

interface Step0PartnersProps {
  onNext: () => void;
}

export function Step0Partners({ onNext }: Step0PartnersProps) {
  const {
    partners,
    addPartner,
    removePartner,
    updatePartner,
    setPartnerCount,
  } = usePartners();

  const {
    scanning,
    done,
    isBulkScanning,
    bulkProgress,
    bulkTotal,
    scanSingle,
    scanBulk,
  } = useAadhaarOCR();

  const bulkFileRef = useRef<HTMLInputElement>(null);

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await scanBulk(Array.from(files));
    e.target.value = '';
  };

  const handleCountChange = (delta: number) => {
    setPartnerCount(partners.length + delta);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-navy-100 rounded-[10px] p-4">
        {/* Partner count controls */}
        <div className="flex items-center gap-2">
          <span className="text-[0.82rem] font-medium text-navy-800">
            Partners:
          </span>
          <button
            onClick={() => handleCountChange(-1)}
            disabled={partners.length <= MIN_PARTNERS}
            className="
              w-8 h-8 flex items-center justify-center
              border border-navy-200 rounded-sm text-navy-500
              hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200
            "
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span className="w-8 text-center text-sm font-semibold text-navy-800">
            {partners.length}
          </span>
          <button
            onClick={() => handleCountChange(1)}
            disabled={partners.length >= MAX_PARTNERS}
            className="
              w-8 h-8 flex items-center justify-center
              border border-navy-200 rounded-sm text-navy-500
              hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200
            "
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Bulk Aadhaar upload */}
        <label className="
          ml-auto inline-flex items-center gap-1.5 px-3 py-2
          border border-dashed border-accent text-accent-dark
          rounded-sm text-2xs font-medium cursor-pointer
          hover:bg-accent-bg hover:-translate-y-px
          transition-all duration-200
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
          </svg>
          Bulk Scan Aadhaar ({partners.length} cards)
          <input
            ref={bulkFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleBulkUpload}
          />
        </label>
      </div>

      {/* Bulk scan progress */}
      {isBulkScanning && (
        <div className="bg-accent-bg border border-accent/30 rounded-sm px-4 py-3 text-[0.82rem] text-accent-dark flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
          Scanning card {bulkProgress} of {bulkTotal}...
          <div className="ml-auto h-1.5 w-32 bg-navy-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-300"
              style={{ width: `${bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Partner Roles */}
      <PartnerRoles />

      {/* Partner Cards */}
      <div className="flex flex-col gap-2">
        {partners.map((partner, index) => (
          <PartnerCard
            key={index}
            index={index}
            partner={partner}
            totalPartners={partners.length}
            onUpdate={updatePartner}
            onRemove={removePartner}
            ocrScanning={scanning[index]}
            ocrDone={done[index]}
            onScanAadhaar={(file, idx) => scanSingle(file, idx)}
          />
        ))}
      </div>

      {/* Add Partner button */}
      {partners.length < MAX_PARTNERS && (
        <button
          onClick={() => addPartner()}
          className="
            w-full py-3 border-2 border-dashed border-navy-200
            rounded-[10px] text-[0.82rem] font-medium text-navy-500
            hover:border-accent hover:text-accent-dark hover:bg-accent-bg
            transition-all duration-200
          "
        >
          + Add Partner {partners.length + 1}
        </button>
      )}

      {/* Step actions */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="
            px-6 py-3 bg-accent text-white font-semibold rounded-sm
            min-h-[44px] text-sm
            hover:bg-accent-dark hover:-translate-y-px
            active:translate-y-0
            transition-all duration-200
            shadow-card
          "
        >
          Next: Business Details
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline ml-2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
