'use strict';

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = [
  'https://partnership-deed-generator.vercel.app',
  'https://partnership-deed.vercel.app',
  ...(!isProduction ? [
    'http://localhost:3003',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
  ] : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS: Origin not allowed'));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
};

module.exports = { corsOptions, allowedOrigins };
