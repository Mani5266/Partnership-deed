// -- Step2Clauses Component --------------------------------------------------
// Step 2: Additional Clauses pane.
// Contains: interest rate, notice period, accounting year, additional points.

'use client';

import React from 'react';
import { useWizardStore } from '@/hooks/useWizardStore';

interface Step2ClausesProps {
  onPrev: () => void;
  onNext: () => void;
}

export function Step2Clauses({ onPrev, onNext }: Step2ClausesProps) {
  const interestRate = useWizardStore((s) => s.interestRate);
  const noticePeriod = useWizardStore((s) => s.noticePeriod);
  const accountingYear = useWizardStore((s) => s.accountingYear);
  const additionalPoints = useWizardStore((s) => s.additionalPoints);
  const setField = useWizardStore((s) => s.setField);

  const inputCls = `
    w-full px-4 py-3 border border-navy-200 rounded-sm text-sm min-h-[44px]
    bg-white text-navy-800 placeholder:text-navy-400
    focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
    transition-all duration-200
  `;

  return (
    <div className="flex flex-col gap-6">
      {/* Clauses form card */}
      <div className="bg-white border-l-[3px] border-l-accent border border-navy-100 rounded-[10px] p-5">
        <h3 className="text-[0.82rem] font-semibold text-navy-800 mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Partnership Clauses
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Interest Rate */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Interest Rate (% p.a.)
            </label>
            <input
              type="number"
              value={interestRate}
              onChange={(e) => setField('interestRate', e.target.value)}
              placeholder="12"
              min={0}
              max={100}
              className={inputCls}
            />
            <p className="text-2xs text-navy-400">
              As per Section 40(b)(iv) of Income Tax Act, 1961
            </p>
          </div>

          {/* Notice Period */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Retirement Notice (months)
            </label>
            <input
              type="number"
              value={noticePeriod}
              onChange={(e) => setField('noticePeriod', e.target.value)}
              placeholder="3"
              min={1}
              max={24}
              className={inputCls}
            />
            <p className="text-2xs text-navy-400">
              Calendar months advance notice for retirement
            </p>
          </div>

          {/* Accounting Year */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Accounting Year End
            </label>
            <input
              type="text"
              value={accountingYear}
              onChange={(e) => setField('accountingYear', e.target.value)}
              placeholder="31st March"
              className={inputCls}
            />
            <p className="text-2xs text-navy-400">
              Date on which books of accounts are closed yearly
            </p>
          </div>
        </div>

        {/* Additional Points */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.82rem] font-medium text-navy-800">
            Additional Terms & Conditions
          </label>
          <textarea
            value={additionalPoints}
            onChange={(e) => setField('additionalPoints', e.target.value)}
            placeholder="Any extra clauses or points to include in the deed (optional)"
            rows={4}
            className="
              w-full px-4 py-3 border border-navy-200 rounded-sm text-sm
              bg-white text-navy-800 placeholder:text-navy-400
              focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
              transition-all duration-200 resize-y min-h-[80px]
            "
          />
          <p className="text-2xs text-navy-400">
            These will appear as an additional clause in the partnership deed.
          </p>
        </div>
      </div>

      {/* Step Actions */}
      <div className="flex justify-between pt-2">
        <button
          onClick={onPrev}
          className="
            px-5 py-3 border border-navy-200 text-navy-600 rounded-sm
            min-h-[44px] text-sm font-medium
            hover:bg-navy-50 transition-all duration-200
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
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
          Next: Review & Generate
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline ml-2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
