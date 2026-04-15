// ── useAINameSuggestions Hook ─────────────────────────────────────────────────
// Calls /api/suggest-business-names and manages name chip state.
// Ported from main.js suggestBusinessNames() (lines 1007-1094).

'use client';

import { useState, useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { getAccessToken } from '@/lib/db';

interface UseAINameSuggestionsResult {
  loading: boolean;
  error: string | null;
  suggestions: string[];
  selectedChip: string | null;
  suggestNames: () => Promise<boolean>;
  selectName: (name: string) => void;
}

export function useAINameSuggestions(): UseAINameSuggestionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useWizardStore((s) => s.nameSuggestions);
  const selectedChip = useWizardStore((s) => s.selectedNameChip);

  const suggestNames = useCallback(async (): Promise<boolean> => {
    const { natureOfBusiness, setField } = useWizardStore.getState();

    if (!natureOfBusiness || natureOfBusiness.trim().length < 3) {
      setError('Please enter the nature of business (at least 3 characters)');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/suggest-business-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ natureOfBusiness: natureOfBusiness.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      const result = await res.json();
      const names: string[] = result.names || result || [];

      setField('nameSuggestions', names);
      setField('showNameSuggestions', true);

      // Check if current business name matches a suggestion
      const { businessName } = useWizardStore.getState();
      const match = names.find(
        (n) => n.toLowerCase() === businessName.toLowerCase()
      );
      setField('selectedNameChip', match || null);

      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to suggest names';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const selectName = useCallback((name: string) => {
    const { setField } = useWizardStore.getState();
    setField('businessName', name);
    setField('selectedNameChip', name);
  }, []);

  return {
    loading,
    error,
    suggestions,
    selectedChip,
    suggestNames,
    selectName,
  };
}
