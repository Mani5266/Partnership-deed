// ── PartnerCard Component ────────────────────────────────────────────────────
// Individual partner form card with name, relation, father's name, age, address,
// and Aadhaar OCR scanning.

'use client';

import React, { useRef } from 'react';
import { useWizardStore } from '@/hooks/useWizardStore';
import type { Partner } from '@/types';
import { MIN_PARTNERS, getPartyLabel, ORDINAL_LABELS } from '@/types';

interface PartnerCardProps {
  index: number;
  partner: Partner;
  totalPartners: number;
  onUpdate: (index: number, updates: Partial<Partner>) => void;
  onRemove: (index: number) => void;
  ocrScanning?: boolean;
  ocrDone?: boolean;
  onScanAadhaar?: (file: File, index: number) => void;
}

export function PartnerCard({
  index,
  partner,
  totalPartners,
  onUpdate,
  onRemove,
  ocrScanning,
  ocrDone,
  onScanAadhaar,
}: PartnerCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldErrors = useWizardStore((s) => s.fieldErrors);
  const clearFieldError = useWizardStore((s) => s.clearFieldError);

  const nameError = fieldErrors[`partner_${index}_name`];
  const canRemove = totalPartners > MIN_PARTNERS;

  const handleChange = (field: keyof Partner, value: string | boolean) => {
    onUpdate(index, { [field]: value });
    // Clear field error on change
    const errorKey = `partner_${index}_${field}`;
    if (fieldErrors[errorKey]) clearFieldError(errorKey);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onScanAadhaar) {
      onScanAadhaar(file, index);
    }
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const ordinal = ORDINAL_LABELS[index] ?? `${index + 1}th`;

  return (
    <div className="bg-navy-50 border border-navy-100 rounded-[10px] p-5 mb-2 hover:border-navy-200 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-2xs font-semibold text-accent-dark uppercase tracking-wider">
          {ordinal} Party (Partner {index + 1})
        </h4>
        <div className="flex items-center gap-2">
          {/* Aadhaar Upload */}
          <label className="
            inline-flex items-center gap-1.5 px-3 py-1.5
            border border-dashed border-accent text-accent-dark
            rounded-sm text-2xs font-medium cursor-pointer
            hover:bg-accent-bg hover:-translate-y-px
            transition-all duration-200
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="10" r="3" />
              <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
            </svg>
            Scan Aadhaar
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {/* Remove */}
          {canRemove && (
            <button
              onClick={() => onRemove(index)}
              className="
                w-8 h-8 flex items-center justify-center
                border border-red-200 text-red-600 rounded-sm
                hover:bg-red-50 transition-all duration-200
              "
              title="Remove partner"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* OCR Status */}
      {ocrScanning && (
        <div className="flex items-center gap-2 mb-3 text-[0.82rem] text-accent-dark">
          <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
          Scanning with AI...
        </div>
      )}
      {ocrDone && !ocrScanning && (
        <div className="flex items-center gap-2 mb-3 text-2xs text-green-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Aadhaar data extracted. Image was not stored.
        </div>
      )}

      {/* Form Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.82rem] font-medium text-navy-800">
            Full Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={partner.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Full name as on Aadhaar"
            className={`
              w-full px-4 py-3 border rounded-sm text-sm min-h-[44px]
              bg-white text-navy-800 placeholder:text-navy-400
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200
              ${nameError ? 'border-red-600 ring-[3px] ring-red-600/10' : 'border-navy-200'}
            `}
          />
          {nameError && <p className="text-2xs text-red-600">{nameError}</p>}
        </div>

        {/* Relation */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.82rem] font-medium text-navy-800">Relation</label>
          <select
            value={partner.relation}
            onChange={(e) => handleChange('relation', e.target.value)}
            className="
              w-full px-4 py-3 border border-navy-200 rounded-sm text-sm min-h-[44px]
              bg-white text-navy-800 appearance-none
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200
              bg-[url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E&quot;)]
              bg-[position:right_0.75rem_center] bg-[size:1.25rem] pr-9
            "
          >
            <option value="S/O">S/O (Son of)</option>
            <option value="D/O">D/O (Daughter of)</option>
            <option value="W/O">W/O (Wife of)</option>
          </select>
        </div>

        {/* Father's Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.82rem] font-medium text-navy-800">
            {"Father's / Husband's Name"}
          </label>
          <input
            type="text"
            value={partner.fatherName}
            onChange={(e) => handleChange('fatherName', e.target.value)}
            placeholder="Father's or Husband's name"
            className="
              w-full px-4 py-3 border border-navy-200 rounded-sm text-sm min-h-[44px]
              bg-white text-navy-800 placeholder:text-navy-400
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200
            "
          />
        </div>

        {/* Age */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.82rem] font-medium text-navy-800">Age</label>
          <input
            type="number"
            value={partner.age}
            onChange={(e) => handleChange('age', e.target.value)}
            placeholder="18"
            min={18}
            max={120}
            className="
              w-full px-4 py-3 border border-navy-200 rounded-sm text-sm min-h-[44px]
              bg-white text-navy-800 placeholder:text-navy-400
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200
            "
          />
        </div>

        {/* Address — full width */}
        <div className="flex flex-col gap-1.5 col-span-full">
          <label className="text-[0.82rem] font-medium text-navy-800">Address</label>
          <textarea
            value={partner.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Full residential address"
            rows={2}
            className="
              w-full px-4 py-3 border border-navy-200 rounded-sm text-sm
              bg-white text-navy-800 placeholder:text-navy-400
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200 resize-y min-h-[60px]
            "
          />
        </div>
      </div>
    </div>
  );
}
