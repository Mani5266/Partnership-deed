// ── usePartners Hook ─────────────────────────────────────────────────────────
// Convenience hook over the wizard store for partner-specific operations.
// Provides derived state (capital/profit totals, hints) and partner actions.

'use client';

import { useMemo, useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { safeNumber } from '@/lib/utils';
import { ORDINAL_LABELS, getPartyLabel } from '@/types';

export function usePartners() {
  const partners = useWizardStore((s) => s.partners);
  const profitSameAsCapital = useWizardStore((s) => s.profitSameAsCapital);
  const addPartner = useWizardStore((s) => s.addPartner);
  const removePartner = useWizardStore((s) => s.removePartner);
  const updatePartner = useWizardStore((s) => s.updatePartner);
  const setPartnerCount = useWizardStore((s) => s.setPartnerCount);
  const setPartners = useWizardStore((s) => s.setPartners);
  const syncProfitFromCapital = useWizardStore((s) => s.syncProfitFromCapital);
  const setField = useWizardStore((s) => s.setField);

  // ── Derived: capital total and hint ──
  const capitalTotal = useMemo(() => {
    return partners.reduce((sum, p) => sum + safeNumber(p.capital), 0);
  }, [partners]);

  const capitalHint = useMemo(() => {
    const total = Math.round(capitalTotal * 100) / 100;
    if (total === 0) return { text: 'Enter capital %', ok: false };
    if (Math.abs(total - 100) <= 0.01) return { text: '100% \u2714', ok: true };
    return { text: `${total}% \u2014 should be 100%`, ok: false };
  }, [capitalTotal]);

  // ── Derived: profit total and hint ──
  const profitTotal = useMemo(() => {
    return partners.reduce((sum, p) => sum + safeNumber(p.profit), 0);
  }, [partners]);

  const profitHint = useMemo(() => {
    const total = Math.round(profitTotal * 100) / 100;
    if (total === 0) return { text: 'Enter profit %', ok: false };
    if (Math.abs(total - 100) <= 0.01) return { text: '100% \u2714', ok: true };
    return { text: `${total}% \u2014 should be 100%`, ok: false };
  }, [profitTotal]);

  // ── Derived: partner labels ──
  const partnerLabels = useMemo(() => {
    return partners.map((_, i) => ({
      ordinal: ORDINAL_LABELS[i] ?? `${i + 1}th`,
      partyLabel: getPartyLabel(i),
      displayLabel: `${ORDINAL_LABELS[i] ?? `${i + 1}th`} Party (Partner ${i + 1})`,
    }));
  }, [partners]);

  // ── Toggle profit-same-as-capital ──
  const toggleProfitSync = useCallback(
    (enabled: boolean) => {
      setField('profitSameAsCapital', enabled);
      if (enabled) {
        syncProfitFromCapital();
      }
    },
    [setField, syncProfitFromCapital]
  );

  // ── Derived: has any managing partner ──
  const hasManagingPartner = useMemo(
    () => partners.some((p) => p.isManagingPartner),
    [partners]
  );

  // ── Derived: has any bank authorized partner ──
  const hasBankAuthorized = useMemo(
    () => partners.some((p) => p.isBankAuthorized),
    [partners]
  );

  return {
    partners,
    partnerLabels,
    profitSameAsCapital,
    capitalTotal,
    capitalHint,
    profitTotal,
    profitHint,
    hasManagingPartner,
    hasBankAuthorized,

    addPartner,
    removePartner,
    updatePartner,
    setPartnerCount,
    setPartners,
    syncProfitFromCapital,
    toggleProfitSync,
  };
}
