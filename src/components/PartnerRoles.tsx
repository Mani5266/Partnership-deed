// ── PartnerRoles Component ───────────────────────────────────────────────────
// Renders the partner roles checklist: managing partner, bank authorized,
// capital %, profit %, bank operation selector.

'use client';

import React from 'react';
import { usePartners } from '@/hooks/usePartners';
import { useWizardStore } from '@/hooks/useWizardStore';
import { ORDINAL_LABELS } from '@/types';

export function PartnerRoles() {
  const {
    partners,
    profitSameAsCapital,
    capitalHint,
    profitHint,
    toggleProfitSync,
    updatePartner,
  } = usePartners();
  const bankOperation = useWizardStore((s) => s.bankOperation);
  const setField = useWizardStore((s) => s.setField);
  const fieldErrors = useWizardStore((s) => s.fieldErrors);

  return (
    <div className="bg-white border border-navy-100 rounded-[10px] p-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 text-[0.82rem] font-semibold text-navy-800">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        Partner Roles & Authorizations
      </div>

      {/* Role Rows */}
      <div className="flex flex-col gap-2 mb-4">
        {partners.map((partner, i) => {
          const ordinal = ORDINAL_LABELS[i] ?? `${i + 1}th`;
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-3 px-3 py-3 bg-navy-50 rounded-sm"
            >
              {/* Name */}
              <div className="flex-1 min-w-[120px] text-[0.82rem]">
                <span className="text-accent-dark font-medium">{ordinal}</span>
                <span className="text-navy-500 ml-1.5">
                  {partner.name || `Partner ${i + 1}`}
                </span>
              </div>

              {/* Managing Partner Toggle */}
              <label
                className={`
                  inline-flex items-center gap-1.5 px-2.5 py-1.5
                  border rounded-sm text-2xs font-medium cursor-pointer
                  transition-all duration-200
                  ${
                    partner.isManagingPartner
                      ? 'border-accent bg-accent/10 text-accent-dark'
                      : 'border-navy-100 text-navy-500 hover:border-navy-200'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={partner.isManagingPartner}
                  onChange={(e) =>
                    updatePartner(i, { isManagingPartner: e.target.checked })
                  }
                  className="sr-only"
                />
                Managing Partner
              </label>

              {/* Bank Authorized Toggle */}
              <label
                className={`
                  inline-flex items-center gap-1.5 px-2.5 py-1.5
                  border rounded-sm text-2xs font-medium cursor-pointer
                  transition-all duration-200
                  ${
                    partner.isBankAuthorized
                      ? 'border-accent bg-accent/10 text-accent-dark'
                      : 'border-navy-100 text-navy-500 hover:border-navy-200'
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={partner.isBankAuthorized}
                  onChange={(e) =>
                    updatePartner(i, { isBankAuthorized: e.target.checked })
                  }
                  className="sr-only"
                />
                Bank Authorized
              </label>

              {/* Capital % */}
              <div className="flex items-center gap-1">
                <span className="text-2xs text-navy-400">Capital</span>
                <input
                  type="number"
                  value={partner.capital || ''}
                  onChange={(e) => updatePartner(i, { capital: e.target.value })}
                  placeholder="0"
                  min={0}
                  max={100}
                  className="
                    w-[72px] h-[36px] px-2 text-center
                    border border-navy-200 rounded-sm text-[0.82rem]
                    focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
                    transition-all duration-200
                  "
                />
                <span className="text-2xs text-navy-400">%</span>
              </div>

              {/* Profit % */}
              <div className="flex items-center gap-1">
                <span className="text-2xs text-navy-400">Profit</span>
                <input
                  type="number"
                  value={partner.profit || ''}
                  onChange={(e) => updatePartner(i, { profit: e.target.value })}
                  placeholder="0"
                  min={0}
                  max={100}
                  disabled={profitSameAsCapital}
                  className={`
                    w-[72px] h-[36px] px-2 text-center
                    border border-navy-200 rounded-sm text-[0.82rem]
                    focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
                    transition-all duration-200
                    ${profitSameAsCapital ? 'opacity-55 cursor-not-allowed' : ''}
                  `}
                />
                <span className="text-2xs text-navy-400">%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Capital/Profit Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4 px-1">
        {/* Profit sync checkbox */}
        <label className="flex items-center gap-2 text-[0.82rem] text-navy-500 cursor-pointer">
          <input
            type="checkbox"
            checked={profitSameAsCapital}
            onChange={(e) => toggleProfitSync(e.target.checked)}
            className="w-4 h-4 rounded border-navy-200 text-accent focus:ring-accent"
          />
          Profit / Loss sharing same as Capital
        </label>

        {/* Hints */}
        <div className="flex gap-3 ml-auto text-2xs">
          <span className={capitalHint.ok ? 'text-green-600' : 'text-red-600'}>
            Capital: {capitalHint.text}
          </span>
          <span className={profitHint.ok ? 'text-green-600' : 'text-red-600'}>
            Profit: {profitHint.text}
          </span>
        </div>
      </div>

      {/* Validation errors */}
      {fieldErrors.managingPartner && (
        <p className="text-2xs text-red-600 mb-2">{fieldErrors.managingPartner}</p>
      )}
      {fieldErrors.bankAuthorized && (
        <p className="text-2xs text-red-600 mb-2">{fieldErrors.bankAuthorized}</p>
      )}
      {fieldErrors.capitalTotal && (
        <p className="text-2xs text-red-600 mb-2">{fieldErrors.capitalTotal}</p>
      )}
      {fieldErrors.profitTotal && (
        <p className="text-2xs text-red-600 mb-2">{fieldErrors.profitTotal}</p>
      )}

      {/* Bank Operation Selector */}
      <div className="border-t border-navy-100 pt-4">
        <label className="text-[0.82rem] font-medium text-navy-800 block mb-2">
          Bank Account Operation
        </label>
        <select
          value={bankOperation}
          onChange={(e) => setField('bankOperation', e.target.value)}
          className="
            w-full max-w-xs px-4 py-3 border border-navy-200 rounded-sm text-sm min-h-[44px]
            bg-white text-navy-800 appearance-none
            focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
            transition-all duration-200
            bg-[url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E&quot;)]
            bg-[position:right_0.75rem_center] bg-[size:1.25rem] pr-9
          "
        >
          <option value="jointly">Jointly (all authorized partners must sign)</option>
          <option value="either">Either or Survivor (any authorized partner)</option>
        </select>
        <div className="mt-2 pl-3 border-l-2 border-accent text-2xs text-navy-500">
          {bankOperation === 'jointly'
            ? 'All bank-authorized partners must jointly sign for transactions.'
            : 'Any bank-authorized partner can independently sign for transactions.'}
        </div>
      </div>
    </div>
  );
}
