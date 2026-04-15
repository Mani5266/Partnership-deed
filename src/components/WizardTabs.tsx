// ── ProgressBar + WizardTabs Components ──────────────────────────────────────
// Wizard navigation: progress bar (gold fill) and clickable step tabs.

'use client';

import React from 'react';

// ── Progress Bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  step: number; // 0-3
}

const PROGRESS_WIDTHS = ['25%', '50%', '75%', '100%'] as const;

export function ProgressBar({ step }: ProgressBarProps) {
  return (
    <div className="h-[3px] bg-navy-200 rounded-full mb-4">
      <div
        className="h-full bg-accent rounded-full transition-[width] duration-400 ease"
        style={{ width: PROGRESS_WIDTHS[step] ?? '25%' }}
      />
    </div>
  );
}

// ── Wizard Tabs ──────────────────────────────────────────────────────────────

interface WizardTabsProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const TABS = [
  { step: 0, label: 'Partners' },
  { step: 1, label: 'Business' },
  { step: 2, label: 'Clauses' },
  { step: 3, label: 'Review & Generate' },
];

export function WizardTabs({ currentStep, onStepClick }: WizardTabsProps) {
  return (
    <nav
      role="tablist"
      className="flex gap-1 mb-5 border-b border-navy-200 overflow-x-auto scrollbar-none"
    >
      {TABS.map(({ step, label }) => {
        const isActive = step === currentStep;
        const isDone = step < currentStep;

        return (
          <button
            key={step}
            role="tab"
            aria-selected={isActive}
            onClick={() => onStepClick(step)}
            className={`
              px-4 py-3 border-b-2 text-[0.82rem] font-medium
              min-h-[44px] whitespace-nowrap
              transition-all duration-200
              ${
                isActive
                  ? 'text-accent-dark border-accent font-semibold'
                  : isDone
                  ? 'text-green-600 border-transparent'
                  : 'text-navy-500 border-transparent hover:text-navy-800'
              }
            `}
          >
            {label}
            {isDone && <span className="ml-1">{'\u2713'}</span>}
          </button>
        );
      })}
    </nav>
  );
}
