'use strict';

const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Document generation limit reached. Try again in an hour.' },
});

const ocrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40, // 40 OCR requests per 15 minutes (enough for 20 partners × 2 attempts)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'OCR rate limit reached. Please wait a few minutes.' },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 AI generation requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'AI generation limit reached. Please wait a few minutes.' },
});

module.exports = { generalLimiter, generateLimiter, ocrLimiter, aiLimiter };
