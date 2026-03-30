'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { generateDoc } = require('./docGenerator/index');
const { supabaseAdmin } = require('./utils/supabase');
const { validateGeneratePayload } = require('./validation');
const { logAudit } = require('./utils/audit');
const { verifyAuth } = require('./middleware/auth');
const { extractAadhaarData } = require('./ocr');
const log = require('./utils/logger');
const { corsOptions } = require('./config/cors');
const { generalLimiter, generateLimiter, ocrLimiter } = require('./config/rateLimit');

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
      imgSrc: ["'self'", "data:"],
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
    const userId = req.user.id;
    const deedId = validatedData._deedId || 'unknown';
    const storagePath = `${userId}/${deedId}/${filename}`;
    let doc_url = null;

    try {
      let ownershipVerified = false;
      if (deedId && deedId !== 'unknown') {
        const { data: deedRow, error: lookupErr } = await supabaseAdmin
          .from('deeds')
          .select('id')
          .eq('id', deedId)
          .eq('user_id', userId)
          .single();

        if (lookupErr || !deedRow) {
          log.warn('Ownership check failed', { reqId: req.id, deedId, userId });
        } else {
          ownershipVerified = true;
        }
      } else {
        ownershipVerified = true;
      }

      if (ownershipVerified) {
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
              .eq('user_id', userId);
          }
        }
      }
    } catch (storageErr) {
      log.error('Storage upload error', { reqId: req.id, error: storageErr.message });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);

    // Audit log (fire-and-forget)
    logAudit({
      user_id: req.user.id,
      action: 'generate_document',
      resource_type: 'partnership_deed',
      details: { business_name: bizName, doc_url: doc_url || '' },
    }).catch(err => log.error('Audit log failed', { reqId: req.id, error: err.message }));

  } catch (err) {
    log.error('DocGen Error', { reqId: req.id, error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: 'Failed to generate document' });
  }
});

// ── DEED MANAGEMENT (CRUD) ────────────────────────────────────────────────
// CRUD operations are handled directly by the frontend Supabase client
// (which is authenticated and respects RLS).

// ── AADHAAR OCR (Gemini Vision) ──────────────────────────────────────────
app.post('/api/ocr/aadhaar', ocrLimiter, verifyAuth, async (req, res) => {
  try {
    const { image, mimeType } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing image data. Send base64-encoded image in "image" field.' });
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
    res.status(statusCode).json({ success: false, error: err.message });
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
