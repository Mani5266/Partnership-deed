// ── useValidation Hook ───────────────────────────────────────────────────────
// Client-side validation ported from main.js validate() (lines 1572-1708).
// Validates per-step and full form, sets field errors in the wizard store.

'use client';

import { useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { safeNumber } from '@/lib/utils';

interface ValidationError {
  step: number;
  fieldId: string;
  message: string;
}

export function useValidation() {
  const store = useWizardStore;

  const validateStep0 = useCallback((): ValidationError[] => {
    const { partners } = store.getState();
    const errors: ValidationError[] = [];

    // Partner names required
    partners.forEach((p, i) => {
      if (!p.name.trim()) {
        errors.push({
          step: 0,
          fieldId: `partner_${i}_name`,
          message: 'Partner name is required',
        });
      }
    });

    // At least one managing partner
    if (!partners.some((p) => p.isManagingPartner)) {
      errors.push({
        step: 0,
        fieldId: 'managingPartner',
        message: 'At least one partner must be designated as Managing Partner',
      });
    }

    // At least one bank authorized
    if (!partners.some((p) => p.isBankAuthorized)) {
      errors.push({
        step: 0,
        fieldId: 'bankAuthorized',
        message:
          'At least one partner must be authorized for bank operations',
      });
    }

    // Capital must sum to 100% (if any entered)
    const capValues = partners.map((p) => safeNumber(p.capital));
    const capTotal = capValues.reduce((s, c) => s + c, 0);
    const hasCapValues = capValues.some((c) => c > 0);
    if (hasCapValues && Math.abs(capTotal - 100) > 0.01) {
      errors.push({
        step: 0,
        fieldId: 'capitalTotal',
        message: `Capital contributions total ${capTotal}% — must be 100%`,
      });
    }

    // Profit must sum to 100% (if any entered)
    const profValues = partners.map((p) => safeNumber(p.profit));
    const profTotal = profValues.reduce((s, c) => s + c, 0);
    const hasProfValues = profValues.some((c) => c > 0);
    if (hasProfValues && Math.abs(profTotal - 100) > 0.01) {
      errors.push({
        step: 0,
        fieldId: 'profitTotal',
        message: `Profit sharing total ${profTotal}% — must be 100%`,
      });
    }

    return errors;
  }, []);

  const validateStep1 = useCallback((): ValidationError[] => {
    const s = store.getState();
    const errors: ValidationError[] = [];

    if (!s.businessName.trim()) {
      errors.push({
        step: 1,
        fieldId: 'businessName',
        message: 'Business name is required',
      });
    }

    if (!s.deedDate) {
      errors.push({
        step: 1,
        fieldId: 'deedDate',
        message: 'Deed date is required',
      });
    }

    // Address required fields
    if (!s.addrDoorNo.trim()) {
      errors.push({
        step: 1,
        fieldId: 'addrDoorNo',
        message: 'Door number is required',
      });
    }
    if (!s.addrArea.trim()) {
      errors.push({
        step: 1,
        fieldId: 'addrArea',
        message: 'Area is required',
      });
    }
    if (!s.addrDistrict.trim()) {
      errors.push({
        step: 1,
        fieldId: 'addrDistrict',
        message: 'District is required',
      });
    }
    if (!s.addrState.trim()) {
      errors.push({
        step: 1,
        fieldId: 'addrState',
        message: 'State is required',
      });
    }
    if (!s.addrPincode.trim()) {
      errors.push({
        step: 1,
        fieldId: 'addrPincode',
        message: 'Pincode is required',
      });
    } else if (!/^\d{6}$/.test(s.addrPincode.trim())) {
      errors.push({
        step: 1,
        fieldId: 'addrPincode',
        message: 'Pincode must be 6 digits',
      });
    }

    // Fixed duration: start/end dates required and end > start
    if (s.partnershipDuration === 'fixed') {
      if (!s.partnershipStartDate) {
        errors.push({
          step: 1,
          fieldId: 'partnershipStartDate',
          message: 'Start date is required for fixed duration',
        });
      }
      if (!s.partnershipEndDate) {
        errors.push({
          step: 1,
          fieldId: 'partnershipEndDate',
          message: 'End date is required for fixed duration',
        });
      }
      if (
        s.partnershipStartDate &&
        s.partnershipEndDate &&
        s.partnershipEndDate <= s.partnershipStartDate
      ) {
        errors.push({
          step: 1,
          fieldId: 'partnershipEndDate',
          message: 'End date must be after start date',
        });
      }
    }

    return errors;
  }, []);

  // Steps 2 and 3 have no required validation in the original code
  const validateStep2 = useCallback((): ValidationError[] => [], []);
  const validateStep3 = useCallback((): ValidationError[] => [], []);

  const validateAll = useCallback((): ValidationError[] => {
    return [
      ...validateStep0(),
      ...validateStep1(),
      ...validateStep2(),
      ...validateStep3(),
    ];
  }, [validateStep0, validateStep1, validateStep2, validateStep3]);

  /**
   * Run full validation, set field errors in the store, and return
   * the first error step (or null if valid).
   */
  const validate = useCallback((): {
    valid: boolean;
    errors: ValidationError[];
    firstErrorStep: number | null;
  } => {
    const errors = validateAll();
    const { clearAllFieldErrors, setFieldErrors } = store.getState();

    clearAllFieldErrors();

    if (errors.length === 0) {
      return { valid: true, errors: [], firstErrorStep: null };
    }

    // Set field errors in the store
    const fieldErrorMap: Record<string, string> = {};
    for (const err of errors) {
      fieldErrorMap[err.fieldId] = err.message;
    }
    setFieldErrors(fieldErrorMap);

    return {
      valid: false,
      errors,
      firstErrorStep: errors[0]?.step ?? null,
    };
  }, [validateAll]);

  return {
    validate,
    validateStep0,
    validateStep1,
    validateStep2,
    validateStep3,
    validateAll,
  };
}
