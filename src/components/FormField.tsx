// ── FormField Component ──────────────────────────────────────────────────────
// Reusable form field wrapper: input, select, or textarea with label,
// hint, error state, and OnEasy styling.

'use client';

import React from 'react';
import { useWizardStore } from '@/hooks/useWizardStore';

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'password' | 'tel';
  as?: 'input' | 'select' | 'textarea';
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  rows?: number;
  children?: React.ReactNode; // For select options
  className?: string;       // Additional wrapper classes
  fullWidth?: boolean;
  autoFocus?: boolean;
  /** Suffix content rendered inside the field (e.g., "%" label) */
  suffix?: React.ReactNode;
  /** Extra content rendered after the field (e.g., AI suggest button) */
  extra?: React.ReactNode;
}

export function FormField({
  id,
  label,
  required,
  hint,
  type = 'text',
  as = 'input',
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  min,
  max,
  step,
  rows = 3,
  children,
  className = '',
  fullWidth = false,
  autoFocus,
  suffix,
  extra,
}: FormFieldProps) {
  const fieldError = useWizardStore((s) => s.fieldErrors[id]);
  const clearFieldError = useWizardStore((s) => s.clearFieldError);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    onChange(e.target.value);
    if (fieldError) clearFieldError(id);
  };

  const inputClasses = `
    w-full px-4 py-3 border rounded-sm text-sm min-h-[44px]
    bg-white text-navy-800
    placeholder:text-navy-400
    focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
    transition-all duration-200 ease
    ${fieldError ? 'border-red-600 ring-[3px] ring-red-600/10' : 'border-navy-200'}
    ${disabled ? 'opacity-55 cursor-not-allowed bg-navy-50' : ''}
  `.trim();

  const selectClasses = `${inputClasses} pr-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E")] bg-[position:right_0.75rem_center] bg-[size:1.25rem]`;

  return (
    <div
      className={`flex flex-col gap-2 ${fullWidth ? 'col-span-full' : ''} ${className}`}
    >
      <label htmlFor={id} className="text-[0.82rem] font-medium text-navy-800">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>

      <div className="relative">
        {as === 'textarea' ? (
          <textarea
            id={id}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            autoFocus={autoFocus}
            className={`${inputClasses} resize-y min-h-[80px]`}
          />
        ) : as === 'select' ? (
          <select
            id={id}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            disabled={disabled}
            autoFocus={autoFocus}
            className={selectClasses}
          >
            {children}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            placeholder={placeholder}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            autoFocus={autoFocus}
            className={inputClasses}
          />
        )}

        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-navy-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>

      {extra}

      {fieldError && (
        <p className="text-2xs text-red-600">{fieldError}</p>
      )}

      {hint && !fieldError && (
        <p className="text-2xs text-navy-500">{hint}</p>
      )}
    </div>
  );
}
