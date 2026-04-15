// ── useDeedList Hook ─────────────────────────────────────────────────────────
// Fetches and manages the deed list (history grid + sidebar drafts).
// Ported from main.js fetchDeeds() (lines 2184-2261) and
// fetchSidebarDrafts() (lines 1970-2036).

'use client';

import { useState, useCallback, useEffect } from 'react';
import { dbGetDeeds, dbGetDeedById, dbGetDocumentVersions } from '@/lib/db';
import type { Deed, DeedDocument } from '@/types';

const SIDEBAR_MAX_DRAFTS = 8;

interface UseDeedListResult {
  deeds: Deed[];
  loading: boolean;
  error: string | null;
  sidebarDrafts: Deed[];
  fetchDeeds: () => Promise<void>;
  refreshSidebar: () => Promise<void>;
  getDeedById: (id: string) => Promise<Deed | null>;
  getDocumentVersions: (deedId: string) => Promise<DeedDocument[]>;
}

export function useDeedList(): UseDeedListResult {
  const [deeds, setDeeds] = useState<Deed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dbGetDeeds();
      setDeeds(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load deeds';
      setError(message);
      console.error('[DeedList] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sidebar drafts = first 8 deeds
  const sidebarDrafts = deeds.slice(0, SIDEBAR_MAX_DRAFTS);

  const refreshSidebar = useCallback(async () => {
    // Re-fetch all deeds (sidebar is derived from the same list)
    try {
      const data = await dbGetDeeds();
      setDeeds(data);
    } catch (err) {
      console.warn('[DeedList] Sidebar refresh failed:', err);
    }
  }, []);

  const getDeedById = useCallback(async (id: string): Promise<Deed | null> => {
    try {
      return await dbGetDeedById(id);
    } catch (err) {
      console.error('[DeedList] getDeedById error:', err);
      return null;
    }
  }, []);

  const getDocumentVersions = useCallback(
    async (deedId: string): Promise<DeedDocument[]> => {
      try {
        return await dbGetDocumentVersions(deedId);
      } catch (err) {
        console.error('[DeedList] getDocumentVersions error:', err);
        return [];
      }
    },
    []
  );

  return {
    deeds,
    loading,
    error,
    sidebarDrafts,
    fetchDeeds,
    refreshSidebar,
    getDeedById,
    getDocumentVersions,
  };
}
