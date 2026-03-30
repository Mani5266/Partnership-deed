'use strict';

const { z } = require('zod');

// ── Partner schema (used in the partners array) ──

const partnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required').max(200),
  fatherName: z.string().max(200).optional().default(''),
  age: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num) || num < 0) return 0;
    return Math.round(num);
  }).optional(),
  address: z.string().max(500).optional().default(''),
  relation: z.string().max(20).optional().default('S/O'),
  capital: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional().default(0),
  profit: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional().default(0),
});

// ── Zod schema for the /generate endpoint payload ──
// Validates all form fields for the Partnership Deed generator.
// Supports dynamic N-partners (minimum 2, maximum 20).

const generatePayloadSchema = z.object({
  // Internal: deed ID for storage path (must be valid UUID to prevent path traversal)
  _deedId: z.string().uuid().optional(),

  // Date of deed execution
  deedDate: z.string().min(1, 'Deed date is required').max(50),

  // Dynamic partners array (minimum 2, maximum 20)
  partners: z.array(partnerSchema).min(2, 'At least 2 partners are required').max(20, 'Maximum 20 partners allowed'),

  // Legacy partner fields (backward compatibility — optional, ignored if partners array is present)
  partner1Name: z.string().max(200).optional(),
  partner1FatherName: z.string().max(200).optional(),
  partner1Age: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num) || num < 0) return 0;
    return Math.round(num);
  }).optional(),
  partner1Address: z.string().max(500).optional(),
  partner1Relation: z.string().max(20).optional(),
  partner1Capital: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional(),
  partner1Profit: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional(),

  partner2Name: z.string().max(200).optional(),
  partner2FatherName: z.string().max(200).optional(),
  partner2Age: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num) || num < 0) return 0;
    return Math.round(num);
  }).optional(),
  partner2Address: z.string().max(500).optional(),
  partner2Relation: z.string().max(20).optional(),
  partner2Capital: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional(),
  partner2Profit: z.union([z.number(), z.string()]).transform(val => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num)) return 0;
    return num;
  }).optional(),

  // Business details
  businessName: z.string().min(1, 'Business name is required').max(300),
  natureOfBusiness: z.string().max(500).optional().default(''),
  businessObjectives: z.string().max(5000).optional().default(''),
  businessDescriptionInput: z.string().max(1000).optional().default(''),
  registeredAddress: z.string().min(1, 'Registered address is required').max(500),

  // Banking
  bankOperation: z.string().max(200).optional().default('jointly'),

  // Additional clauses
  interestRate: z.string().max(20).optional().default('12'),
  noticePeriod: z.string().max(20).optional().default('3'),
  accountingYear: z.string().max(50).optional().default('31st March'),
  additionalPoints: z.string().max(2000).optional().default(''),

}).passthrough()
  .superRefine((data, ctx) => {
    const partners = data.partners || [];

    // Capital contributions cross-check
    const capValues = partners.map(p => Number(p.capital) || 0);
    const capTotal = capValues.reduce((s, c) => s + c, 0);
    const hasCapValues = capValues.some(c => c > 0);
    if (hasCapValues && Math.abs(capTotal - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partners'],
        message: 'Capital contributions must add up to 100%',
      });
    }

    // Profit sharing cross-check
    const profValues = partners.map(p => Number(p.profit) || 0);
    const profTotal = profValues.reduce((s, c) => s + c, 0);
    const hasProfValues = profValues.some(c => c > 0);
    if (hasProfValues && Math.abs(profTotal - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partners'],
        message: 'Profit sharing percentages must add up to 100%',
      });
    }
  });

/**
 * Validate the /generate endpoint payload.
 * @param {Object} body - req.body from the request
 * @returns {{ success: boolean, data?: Object, errors?: string[] }}
 */
function validateGeneratePayload(body) {
  try {
    const result = generatePayloadSchema.safeParse(body);
    if (result.success) {
      return { success: true, data: result.data };
    }
    const errors = result.error.issues.map(
      issue => `${issue.path.join('.')}: ${issue.message}`
    );
    return { success: false, errors };
  } catch (err) {
    return { success: false, errors: ['Validation failed: ' + err.message] };
  }
}

module.exports = { validateGeneratePayload };
