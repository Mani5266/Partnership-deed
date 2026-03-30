'use strict';

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = isProduction ? LEVELS.info : LEVELS.debug;

function emit(level, message, meta = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;

  if (isProduction) {
    const entry = { ts: new Date().toISOString(), level, msg: message, ...meta };
    const out = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(out + '\n');
    } else {
      process.stdout.write(out + '\n');
    }
  } else {
    const ts = new Date().toISOString().slice(11, 23);
    const prefix = `[${ts}] ${level.toUpperCase().padEnd(5)}`;
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const out = `${prefix} ${message}${metaStr}\n`;
    if (level === 'error') {
      process.stderr.write(out);
    } else {
      process.stdout.write(out);
    }
  }
}

const log = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info:  (msg, meta) => emit('info',  msg, meta),
  warn:  (msg, meta) => emit('warn',  msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

function requestLogger(req, res, next) {
  req.id = crypto.randomBytes(4).toString('hex');
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      reqId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: duration,
    };

    if (res.statusCode >= 500) {
      log.error('Request failed', meta);
    } else if (res.statusCode >= 400) {
      log.warn('Request error', meta);
    } else {
      log.info('Request completed', meta);
    }
  });

  next();
}

module.exports = { ...log, requestLogger };
