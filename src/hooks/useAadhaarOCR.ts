// ── useAadhaarOCR Hook ───────────────────────────────────────────────────────
// Handles single-card and bulk Aadhaar OCR scanning.
// Ported from main.js processAadhaarOCR (lines 802-854) and
// processBulkAadhaarOCR (lines 677-798).

'use client';

import { useState, useCallback } from 'react';
import { useWizardStore } from './useWizardStore';
import { getAccessToken } from '@/lib/db';

interface OcrResult {
  name?: string;
  fatherName?: string;
  relation?: string;
  age?: string;
  address?: string;
}

interface OcrStatus {
  /** Per-partner OCR loading state */
  scanning: Record<number, boolean>;
  /** Per-partner OCR done state */
  done: Record<number, boolean>;
  /** Bulk OCR progress (0 to total) */
  bulkProgress: number;
  bulkTotal: number;
  isBulkScanning: boolean;
}

/**
 * Convert a File to base64 data string (without data URL prefix).
 */
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Extract base64 from "data:image/jpeg;base64,/9j/..."
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Call the OCR API endpoint.
 */
async function callOcrApi(file: File): Promise<OcrResult> {
  const { base64, mimeType } = await fileToBase64(file);
  const token = await getAccessToken();

  const res = await fetch('/api/ocr/aadhaar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image: base64, mimeType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OCR failed (${res.status})`);
  }

  const result = await res.json();
  return result.data as OcrResult;
}

export function useAadhaarOCR() {
  const [status, setStatus] = useState<OcrStatus>({
    scanning: {},
    done: {},
    bulkProgress: 0,
    bulkTotal: 0,
    isBulkScanning: false,
  });

  /**
   * Scan a single Aadhaar card for a specific partner index.
   * Returns the extracted fields or null on error.
   */
  const scanSingle = useCallback(
    async (
      file: File,
      partnerIndex: number
    ): Promise<{ extracted: OcrResult; missing: string[] } | null> => {
      setStatus((prev) => ({
        ...prev,
        scanning: { ...prev.scanning, [partnerIndex]: true },
        done: { ...prev.done, [partnerIndex]: false },
      }));

      try {
        const extracted = await callOcrApi(file);

        // Apply extracted data to partner
        const updates: Record<string, string | number | boolean> = {};
        const foundFields: string[] = [];
        const missing: string[] = [];

        if (extracted.name) {
          updates.name = extracted.name;
          foundFields.push('Name');
        } else {
          missing.push('Name');
        }
        if (extracted.fatherName) {
          updates.fatherName = extracted.fatherName;
          foundFields.push("Father's Name");
        } else {
          missing.push("Father's Name");
        }
        if (extracted.relation) {
          updates.relation = extracted.relation;
          foundFields.push('Relation');
        }
        if (extracted.age) {
          updates.age = extracted.age;
          foundFields.push('Age');
        } else {
          missing.push('Age');
        }
        if (extracted.address) {
          updates.address = extracted.address;
          foundFields.push('Address');
        } else {
          missing.push('Address');
        }

        useWizardStore.getState().updatePartner(partnerIndex, updates);

        setStatus((prev) => ({
          ...prev,
          scanning: { ...prev.scanning, [partnerIndex]: false },
          done: { ...prev.done, [partnerIndex]: true },
        }));

        return { extracted, missing };
      } catch (err) {
        console.error(`[OCR] Partner ${partnerIndex} scan failed:`, err);
        setStatus((prev) => ({
          ...prev,
          scanning: { ...prev.scanning, [partnerIndex]: false },
        }));
        return null;
      }
    },
    []
  );

  /**
   * Bulk scan multiple Aadhaar cards. Processes sequentially.
   * Expands partners array if needed.
   */
  const scanBulk = useCallback(
    async (
      files: File[]
    ): Promise<{
      success: number;
      failed: number;
      results: Array<{ index: number; result: OcrResult | null; missing: string[] }>;
    }> => {
      const { partners, setPartnerCount } = useWizardStore.getState();

      // Expand partners if more files than current count (up to MAX)
      if (files.length > partners.length) {
        setPartnerCount(files.length);
      }

      setStatus((prev) => ({
        ...prev,
        bulkProgress: 0,
        bulkTotal: files.length,
        isBulkScanning: true,
      }));

      let success = 0;
      let failed = 0;
      const results: Array<{
        index: number;
        result: OcrResult | null;
        missing: string[];
      }> = [];

      // Process sequentially (same as original)
      for (let i = 0; i < files.length; i++) {
        const result = await scanSingle(files[i]!, i);
        if (result) {
          success++;
          results.push({ index: i, result: result.extracted, missing: result.missing });
        } else {
          failed++;
          results.push({ index: i, result: null, missing: [] });
        }
        setStatus((prev) => ({
          ...prev,
          bulkProgress: i + 1,
        }));
      }

      setStatus((prev) => ({
        ...prev,
        isBulkScanning: false,
      }));

      return { success, failed, results };
    },
    [scanSingle]
  );

  /** Reset OCR status for a specific partner */
  const resetPartnerOcr = useCallback((index: number) => {
    setStatus((prev) => ({
      ...prev,
      scanning: { ...prev.scanning, [index]: false },
      done: { ...prev.done, [index]: false },
    }));
  }, []);

  return {
    ...status,
    scanSingle,
    scanBulk,
    resetPartnerOcr,
  };
}
