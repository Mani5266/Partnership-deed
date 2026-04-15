// ── useAIObjective Hook ──────────────────────────────────────────────────────
// Calls /api/generate-objective and updates the wizard store.
// Ported from main.js generateBusinessObjective() (lines 939-1003).

'use client';

import { useState, useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { getAccessToken } from '@/lib/db';

interface UseAIObjectiveResult {
  loading: boolean;
  error: string | null;
  generateObjective: () => Promise<boolean>;
}

export function useAIObjective(): UseAIObjectiveResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateObjective = useCallback(async (): Promise<boolean> => {
    const { businessDescriptionInput, setField, setFields } =
      useWizardStore.getState();

    if (!businessDescriptionInput || businessDescriptionInput.trim().length < 3) {
      setError('Please enter a business description (at least 3 characters)');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/generate-objective', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description: businessDescriptionInput.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      const result = await res.json();

      // Update store with results
      const updates: Partial<Record<string, string | boolean>> = {
        showObjectiveOutput: true,
      };

      if (result.objective) {
        updates.businessObjectives = result.objective;
      }
      if (result.nature) {
        updates.natureOfBusiness = result.nature;
      }

      setFields(updates as Parameters<typeof setFields>[0]);
      // Set individual fields to ensure type safety
      if (result.objective) {
        setField('businessObjectives', result.objective);
      }
      if (result.nature) {
        setField('natureOfBusiness', result.nature);
      }
      setField('showObjectiveOutput', true);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate objective';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, generateObjective };
}
