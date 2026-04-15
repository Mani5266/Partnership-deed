// ── useGenerate Hook ─────────────────────────────────────────────────────────
// Handles the deed generation flow: validate → save → API call → download.
// Ported from main.js generate() (lines 2091-2173).

'use client';

import { useState, useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { useValidation } from './useValidation';
import { dbSaveDeed } from '@/lib/db';
import { getAccessToken } from '@/lib/db';

interface UseGenerateResult {
  loading: boolean;
  error: string | null;
  showPdfBtn: boolean;
  generate: () => Promise<boolean>;
  openPrintView: () => void;
}

export function useGenerate(): UseGenerateResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPdfBtn, setShowPdfBtn] = useState(false);

  const { validate } = useValidation();

  const generate = useCallback(async (): Promise<boolean> => {
    setError(null);

    // 1. Validate
    const result = validate();
    if (!result.valid) {
      const { goToStep } = useWizardStore.getState();
      if (result.firstErrorStep !== null) {
        goToStep(result.firstErrorStep);
      }
      setError(result.errors[0]?.message || 'Validation failed');
      return false;
    }

    setLoading(true);
    const state = useWizardStore.getState();
    const payload = state.getPayload();

    try {
      // 2. Save to DB first
      const saved = await dbSaveDeed({
        id: state.currentDeedId,
        business_name: payload.businessName || 'Untitled',
        partner1_name: payload.partners?.[0]?.name || '',
        partner2_name: payload.partners?.[1]?.name || '',
        payload,
      });

      if (!state.currentDeedId && saved.id) {
        useWizardStore.getState().setCurrentDeedId(saved.id);
      }

      // 3. Call /api/generate with the payload
      const token = await getAccessToken();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...payload,
          _deedId: saved.id || state.currentDeedId,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.details && Array.isArray(errBody.details)) {
          throw new Error(errBody.details.join('\n'));
        }
        throw new Error(errBody.error || `Generation failed (${res.status})`);
      }

      // 4. Download the DOCX
      const blob = await res.blob();

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/);
      const filename =
        filenameMatch?.[1] ||
        `Partnership_Deed_${payload.businessName || 'Document'}.docx`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 150);

      setShowPdfBtn(true);
      useWizardStore.getState().markClean();
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate deed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [validate]);

  const openPrintView = useCallback(() => {
    // Open print view in new tab with current deed ID
    const { currentDeedId } = useWizardStore.getState();
    if (currentDeedId) {
      window.open(`/print?id=${currentDeedId}`, '_blank');
    }
  }, []);

  return { loading, error, showPdfBtn, generate, openPrintView };
}
