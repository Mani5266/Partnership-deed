// ── ZOD VALIDATION SCHEMAS ──────────────────────────────────────────────────
// Ported from backend/validation.js → TypeScript with Zod v4-compatible syntax
// Note: Zod v4 uses z.object().strip() not .passthrough(). The original code
// already uses .strip() so no changes needed for v4 compat.

import { z } from 'zod';
import type { ValidationResult, FormPayload } from '@/types';

// ── Numeric coercion helper ─────────────────────────────────────────────────

function numericTransform(opts?: { round?: boolean; nonNegative?: boolean }) {
  return z
    .union([z.number(), z.string()])
    .transform((val): number => {
      const num = typeof val === 'string' ? Number(val) : val;
      if (isNaN(num)) return 0;
      if (opts?.nonNegative && num < 0) return 0;
      return opts?.round ? Math.round(num) : num;
    });
}

// ── Partner schema ──────────────────────────────────────────────────────────

export const partnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required').max(200),
  fatherName: z.string().max(200).optional().default(''),
  age: numericTransform({ round: true, nonNegative: true }).optional(),
  address: z.string().max(500).optional().default(''),
  relation: z.string().max(20).optional().default('S/O'),
  capital: numericTransform().optional().default(0),
  profit: numericTransform().optional().default(0),
  isManagingPartner: z.boolean().optional().default(false),
  isBankAuthorized: z.boolean().optional().default(false),
});

// ── Generate endpoint payload schema ────────────────────────────────────────

export const generatePayloadSchema = z
  .object({
    // Internal: deed ID for storage path (must be valid UUID)
    _deedId: z.string().uuid().optional(),

    // Date of deed execution
    deedDate: z.string().min(1, 'Deed date is required').max(50),

    // Dynamic partners array (2-20)
    partners: z
      .array(partnerSchema)
      .min(2, 'At least 2 partners are required')
      .max(20, 'Maximum 20 partners allowed'),

    // Legacy partner fields (backward compat — optional)
    partner1Name: z.string().max(200).optional(),
    partner1FatherName: z.string().max(200).optional(),
    partner1Age: numericTransform({ round: true, nonNegative: true }).optional(),
    partner1Address: z.string().max(500).optional(),
    partner1Relation: z.string().max(20).optional(),
    partner1Capital: numericTransform().optional(),
    partner1Profit: numericTransform().optional(),

    partner2Name: z.string().max(200).optional(),
    partner2FatherName: z.string().max(200).optional(),
    partner2Age: numericTransform({ round: true, nonNegative: true }).optional(),
    partner2Address: z.string().max(500).optional(),
    partner2Relation: z.string().max(20).optional(),
    partner2Capital: numericTransform().optional(),
    partner2Profit: numericTransform().optional(),

    // Business details
    businessName: z.string().min(1, 'Business name is required').max(300),
    natureOfBusiness: z.string().max(500).optional().default(''),
    businessObjectives: z.string().max(5000).optional().default(''),
    businessDescriptionInput: z.string().max(1000).optional().default(''),
    registeredAddress: z
      .string()
      .min(1, 'Registered address is required')
      .max(500),

    // Banking
    bankOperation: z.string().max(200).optional().default('jointly'),

    // Additional clauses
    interestRate: z.string().max(20).optional().default('12'),
    noticePeriod: z.string().max(20).optional().default('3'),
    accountingYear: z.string().max(50).optional().default('31st March'),
    additionalPoints: z.string().max(2000).optional().default(''),

    // Partnership duration
    partnershipDuration: z.enum(['will', 'fixed']).optional().default('will'),
    partnershipStartDate: z.string().max(50).optional().default(''),
    partnershipEndDate: z.string().max(50).optional().default(''),
  })
  .strip()
  .superRefine((data, ctx) => {
    const partners = data.partners || [];

    // Capital contributions cross-check
    const capValues = partners.map((p) => Number(p.capital) || 0);
    const capTotal = capValues.reduce((s, c) => s + c, 0);
    const hasCapValues = capValues.some((c) => c > 0);
    if (hasCapValues && Math.abs(capTotal - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partners'],
        message: 'Capital contributions must add up to 100%',
      });
    }

    // Profit sharing cross-check
    const profValues = partners.map((p) => Number(p.profit) || 0);
    const profTotal = profValues.reduce((s, c) => s + c, 0);
    const hasProfValues = profValues.some((c) => c > 0);
    if (hasProfValues && Math.abs(profTotal - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partners'],
        message: 'Profit sharing percentages must add up to 100%',
      });
    }
  });

// ── Inferred types ──────────────────────────────────────────────────────────

export type GeneratePayload = z.infer<typeof generatePayloadSchema>;
export type PartnerInput = z.infer<typeof partnerSchema>;

// ── Validation function ─────────────────────────────────────────────────────

/**
 * Validate the /generate endpoint payload.
 * Returns typed result with either parsed data or error strings.
 */
export function validateGeneratePayload(
  body: unknown
): ValidationResult<GeneratePayload> {
  try {
    const result = generatePayloadSchema.safeParse(body);
    if (result.success) {
      return { success: true, data: result.data };
    }
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return { success: false, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, errors: ['Validation failed: ' + message] };
  }
}
