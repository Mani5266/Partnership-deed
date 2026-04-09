'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { generateDoc } = require('./docGenerator/index');
const { supabaseAdmin } = require('./utils/supabase');
const { validateGeneratePayload } = require('./validation');
const { verifyAuth } = require('./middleware/auth');

const { extractAadhaarData } = require('./ocr');
const log = require('./utils/logger');
const { corsOptions } = require('./config/cors');
const { generalLimiter, generateLimiter, ocrLimiter, aiLimiter } = require('./config/rateLimit');

const app = express();
const PORT = process.env.PORT || 3003;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy when running behind Vercel/reverse proxy
if (isProduction) {
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    if (req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
  });
}

// ── REQUEST CORRELATION IDs & LOGGING ──────────────────────────────────────
app.use(log.requestLogger);

// ── SECURITY HEADERS (helmet) ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      workerSrc: ["'self'"],
      connectSrc: [
        "'self'",
        process.env.SUPABASE_URL || "https://placeholder.supabase.co",
        (process.env.SUPABASE_URL || "https://placeholder.supabase.co").replace('https://', 'wss://'),
        "https://cdn.jsdelivr.net",
      ],
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      reportUri: '/csp-report',
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false,
}));

// Permissions-Policy
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));

// ── RATE LIMITING ─────────────────────────────────────────────────────────
app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '5mb' }));

// Static file serving
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: isProduction ? '1d' : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── PUBLIC CONFIG — serves Supabase URL + anon key to frontend ───────────────
// This is the SINGLE SOURCE OF TRUTH for frontend Supabase credentials.
// Both login.js and config.js fetch from here instead of hardcoding values.
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// ── DOCUMENT GENERATION ──────────────────────────────────────────────────────

app.post('/generate', generateLimiter, verifyAuth, async (req, res) => {
  try {
    const validation = validateGeneratePayload(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: validation.errors,
      });
    }

    const validatedData = validation.data;
    const buffer = await generateDoc(validatedData);
    const bizName = (validatedData.businessName || 'Deed').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Deed';
    const filename = `Partnership_Deed_${bizName}.docx`;

    // Upload to Supabase Storage
    // Path: deeds/{userId}/{deedId}/filename.docx — matches storage RLS policies
    const deedId = validatedData._deedId || 'unknown';
    const storagePath = `deeds/${req.user.id}/${deedId}/${filename}`;
    let doc_url = null;

    try {
      const { error: uploadError } = await supabaseAdmin.storage
        .from('deed-docs')
        .upload(storagePath, buffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });

      if (uploadError) {
        log.error('Storage upload failed', { reqId: req.id, error: uploadError.message });
      } else {
        doc_url = storagePath;

        if (deedId && deedId !== 'unknown') {
          await supabaseAdmin
            .from('deeds')
            .update({ doc_url: storagePath })
            .eq('id', deedId)
            .eq('user_id', req.user.id);
        }
      }
    } catch (storageErr) {
      log.error('Storage upload error', { reqId: req.id, error: storageErr.message });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);

  } catch (err) {
    log.error('DocGen Error', { reqId: req.id, error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to generate document' });
  }
});

// ── DEED MANAGEMENT (CRUD) ────────────────────────────────────────────────
// CRUD operations are handled directly by the frontend Supabase client.

// ── AADHAAR OCR (Gemini Vision) ──────────────────────────────────────────
app.post('/api/ocr/aadhaar', ocrLimiter, verifyAuth, async (req, res) => {
  try {
    const { image, mimeType } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing image data. Send base64-encoded image in "image" field.' });
    }

    // Pre-decode size check (base64 is ~33% larger than binary)
    if (image.length > 5.5 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Image data too large. Maximum image size is 4MB.' });
    }

    // Validate mime type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
    const mime = (mimeType || 'image/jpeg').toLowerCase();
    if (!allowedMimes.includes(mime)) {
      return res.status(400).json({ success: false, error: `Unsupported image type: ${mime}. Use JPEG, PNG, or WebP.` });
    }

    // Decode base64
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(image, 'base64');
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid base64 image data.' });
    }

    if (imageBuffer.length < 100) {
      return res.status(400).json({ success: false, error: 'Image data too small. Please provide a valid image.' });
    }

    // Extract data using Gemini
    const extracted = await extractAadhaarData(imageBuffer, mime);

    res.json({ success: true, data: extracted });

  } catch (err) {
    log.error('OCR Error', { reqId: req.id, error: err.message });
    const statusCode = err.message.includes('not configured') ? 503 :
                        err.message.includes('rate limit') ? 429 :
                        err.message.includes('too large') ? 413 : 500;
    res.status(statusCode).json({ success: false, error: statusCode === 500 ? 'OCR processing failed. Please try again.' : err.message });
  }
});

// ── BUSINESS OBJECTIVE AI GENERATION (Gemini) ────────────────────────────────
app.post('/api/generate-objective', aiLimiter, verifyAuth, async (req, res) => {
  try {
    const { description } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Please provide a business description (at least 3 characters).' });
    }

    if (description.length > 1000) {
      return res.status(400).json({ success: false, error: 'Business description is too long (max 1000 characters).' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return res.status(503).json({ success: false, error: 'AI service is not configured. Please add GEMINI_API_KEY to backend/.env' });
    }

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `You are a legal document assistant specializing in Indian Partnership Deeds under the Indian Partnership Act, 1932.

Given the following informal business description from a user, generate TWO things:

1. **nature**: A short "Nature of Business" summary (3-10 words, e.g. "Restaurants, Food Service, and Hospitality" or "Software Development and IT Consulting"). This is used in the WHEREAS clause.
2. **objective**: A formal, legally-phrased "Business Objective" clause suitable for Clause 4 of a Partnership Deed.

RULES FOR THE OBJECTIVE:
1. The objective should be comprehensive and cover all reasonable activities related to the described business
2. Use formal legal language (e.g., "buying, selling, trading, importing, exporting, dealing in...")
3. Include both wholesale and retail where applicable
4. Include online/offline/physical/digital channels where applicable
5. Keep it as a single paragraph, 2-5 sentences maximum
6. Do NOT include the business name or partner names
7. The output should be in English
8. Make it specific to the business described, not generic

RULES FOR THE NATURE:
1. Keep it very short — a concise category/industry label (3-10 words)
2. Title Case (capitalize each major word)
3. No articles (a, an, the) unless grammatically essential
4. Examples: "Real Estate and Property Development", "Textile Trading and Garment Manufacturing", "Restaurants, Food Service, and Hospitality"

User's business description: "${description.trim()}"

RESPOND WITH VALID JSON ONLY — no markdown, no explanation, no code fences:
{"nature": "...", "objective": "..."}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    };

    log.info('Generating business objective', { reqId: req.id, descriptionLength: description.length });

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error('Gemini API error (objective)', { status: response.status, body: errorBody });

      if (response.status === 429) {
        return res.status(429).json({ success: false, error: 'AI rate limit exceeded. Please wait a moment and try again.' });
      }
      return res.status(500).json({ success: false, error: 'Failed to generate business objective. Please try again.' });
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      log.warn('Gemini returned no text for objective', { data: JSON.stringify(data).substring(0, 500) });
      return res.status(500).json({ success: false, error: 'No response from AI. Please try again.' });
    }

    // Clean up the response — remove markdown artifacts, extra whitespace
    const cleaned = textContent
      .replace(/```json\s*/gi, '')
      .replace(/```[a-z]*\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    // Parse JSON response from AI
    let nature = '';
    let objective = '';
    try {
      const parsed = JSON.parse(cleaned);
      nature = (parsed.nature || '').trim();
      objective = (parsed.objective || '').trim();
    } catch (_parseErr) {
      // Fallback: if AI didn't return valid JSON, treat entire text as the objective
      log.warn('AI returned non-JSON for objective, using fallback parsing', { text: cleaned.substring(0, 200) });
      objective = cleaned
        .replace(/^["']|["']$/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
    }

    if (!objective) {
      return res.status(500).json({ success: false, error: 'AI returned an empty objective. Please try again.' });
    }

    log.info('Business objective generated', { reqId: req.id, natureLength: nature.length, objectiveLength: objective.length });

    res.json({ success: true, objective, nature });

  } catch (err) {
    log.error('Objective generation error', { reqId: req.id, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to generate business objective.' });
  }
});

// ── BUSINESS NAME AI SUGGESTIONS (Gemini) ────────────────────────────────────
app.post('/api/suggest-business-names', aiLimiter, verifyAuth, async (req, res) => {
  try {
    const { natureOfBusiness } = req.body;

    if (!natureOfBusiness || typeof natureOfBusiness !== 'string' || natureOfBusiness.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Please enter the Nature of Business first (at least 3 characters).' });
    }

    if (natureOfBusiness.length > 500) {
      return res.status(400).json({ success: false, error: 'Nature of Business is too long (max 500 characters).' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return res.status(503).json({ success: false, error: 'AI service is not configured. Please add GEMINI_API_KEY to backend/.env' });
    }

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `You are a business naming expert specializing in Indian partnership firms.

Given the following Nature of Business, suggest 5 professional and relevant business name options suitable for an Indian partnership firm.

RULES:
1. Each name should sound professional and be suitable for legal registration in India
2. Names should be relevant to the described business/industry
3. Mix different naming styles: descriptive, creative, modern, traditional, and abbreviation-based
4. Do NOT include "M/s." prefix — just the firm name itself
5. Keep names concise (2-4 words each)
6. Names should be in English
7. Return ONLY a valid JSON array of 5 strings, nothing else (no markdown, no explanation, no code blocks)

Nature of Business: "${natureOfBusiness.trim()}"

Return ONLY a JSON array like: ["Name One", "Name Two", "Name Three", "Name Four", "Name Five"]`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8, // Higher temperature for creative name suggestions
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    };

    log.info('Generating business name suggestions', { reqId: req.id, nature: natureOfBusiness.substring(0, 100) });

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error('Gemini API error (names)', { status: response.status, body: errorBody });

      if (response.status === 429) {
        return res.status(429).json({ success: false, error: 'AI rate limit exceeded. Please wait a moment and try again.' });
      }
      return res.status(500).json({ success: false, error: 'Failed to generate name suggestions. Please try again.' });
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      log.warn('Gemini returned no text for names', { data: JSON.stringify(data).substring(0, 500) });
      return res.status(500).json({ success: false, error: 'No response from AI. Please try again.' });
    }

    // Parse JSON array
    let names;
    try {
      const cleaned = textContent
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      names = JSON.parse(cleaned);
    } catch (parseErr) {
      log.error('Failed to parse name suggestions', { text: textContent });
      return res.status(500).json({ success: false, error: 'Failed to parse suggestions. Please try again.' });
    }

    if (!Array.isArray(names) || names.length === 0) {
      return res.status(500).json({ success: false, error: 'No valid suggestions generated. Please try again.' });
    }

    // Sanitize: ensure all items are strings, trim, remove empty
    const sanitized = names
      .filter(n => typeof n === 'string' && n.trim().length > 0)
      .map(n => n.trim().substring(0, 200))
      .slice(0, 5);

    log.info('Business name suggestions generated', { reqId: req.id, count: sanitized.length });

    res.json({ success: true, names: sanitized });

  } catch (err) {
    log.error('Name suggestion error', { reqId: req.id, error: err.message });
    res.status(500).json({ success: false, error: 'Failed to generate name suggestions.' });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ── CSP VIOLATION REPORTS ─────────────────────────────────────────────────
app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body?.['csp-report'] || req.body;
  log.warn('CSP violation', {
    blockedUri: report?.['blocked-uri'],
    violatedDirective: report?.['violated-directive'],
    documentUri: report?.['document-uri'],
  });
  res.status(204).end();
});

// ── CENTRALIZED ERROR HANDLING ────────────────────────────────────────────

app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, error: 'Origin not allowed by CORS policy.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON in request body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body too large.' });
  }

  log.error('Unhandled error', { reqId: req.id, error: err.message, stack: err.stack });
  const message = isProduction ? 'Internal server error.' : err.message || 'Internal server error.';
  res.status(err.status || 500).json({ success: false, error: message });
});

// Start server only in local dev
if (!isProduction) {
  const server = app.listen(PORT, () => {
    log.info('Server started', { url: `http://localhost:${PORT}` });
  });

  const shutdown = (signal) => {
    log.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

module.exports = app;
