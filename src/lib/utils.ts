// ── UTILITY FUNCTIONS ────────────────────────────────────────────────────────
// Ported from frontend/js/utils.js + frontend/js/main.js (composeAddress)

import type { BusinessAddress } from '@/types';

/**
 * Format a date string (YYYY-MM-DD) to DD/MM/YYYY for display.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '\u2014';
  return `${d}/${m}/${y}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHTML(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Compose the full registered address from structured sub-fields.
 * Format: "{BuildingName}, {DoorNo}, {Area}, {District}, {State}, India-{Pincode}"
 *
 * Ported from frontend/js/main.js line 1105.
 */
export function composeAddress(addr: BusinessAddress): string {
  const parts: string[] = [];
  if (addr.buildingName) parts.push(addr.buildingName);
  if (addr.doorNo) parts.push(addr.doorNo);
  if (addr.area) parts.push(addr.area);
  if (addr.district) parts.push(addr.district);
  if (addr.state) parts.push(addr.state);
  if (addr.pincode) {
    parts.push(`India-${addr.pincode}`);
  } else {
    parts.push('India');
  }
  return parts.join(', ');
}

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Generate a UUID v4. Uses crypto.randomUUID() when available.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Safely parse a number from a string/number input. Returns 0 if NaN.
 */
export function safeNumber(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const num = typeof val === 'string' ? Number(val) : val;
  return isNaN(num) ? 0 : num;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Wait for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format file size in human-readable form.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
