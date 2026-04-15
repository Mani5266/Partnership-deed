// ─── Deep Merge Helper for Extracted Form Data ──────────────────────────────
// Merges objects recursively but REPLACES arrays (AI returns complete arrays).
// Adapted from networth-agent for WizardState (partnership deed fields).

import type { WizardState } from '@/hooks/useWizardStore';

/** Subset of WizardState fields that the AI can extract */
export type ExtractedDeedData = Partial<
  Pick<
    WizardState,
    | 'partners'
    | 'businessName'
    | 'businessDescriptionInput'
    | 'natureOfBusiness'
    | 'businessObjectives'
    | 'deedDate'
    | 'addrDoorNo'
    | 'addrBuildingName'
    | 'addrArea'
    | 'addrDistrict'
    | 'addrState'
    | 'addrPincode'
    | 'bankOperation'
    | 'interestRate'
    | 'noticePeriod'
    | 'accountingYear'
    | 'additionalPoints'
    | 'partnershipDuration'
    | 'partnershipStartDate'
    | 'partnershipEndDate'
  >
>;

export function deepMergeFormData(
  target: ExtractedDeedData,
  source: ExtractedDeedData
): ExtractedDeedData {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof ExtractedDeedData)[]) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (srcVal === undefined || srcVal === null) continue;

    // Arrays (e.g. partners): replace entirely — AI returns the complete array each turn
    if (Array.isArray(srcVal)) {
      (result as Record<string, unknown>)[key] = srcVal;
    }
    // Plain objects: merge recursively
    else if (
      typeof srcVal === 'object' &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      (result as Record<string, unknown>)[key] = {
        ...(tgtVal as Record<string, unknown>),
        ...(srcVal as Record<string, unknown>),
      };
    }
    // Primitives: overwrite
    else {
      (result as Record<string, unknown>)[key] = srcVal;
    }
  }

  return result;
}
