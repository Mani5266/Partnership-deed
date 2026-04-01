'use strict';

const { supabaseAdmin } = require('../utils/supabase');
const log = require('../utils/logger');

/**
 * Auth middleware — verifies JWT from Authorization header.
 * Extracts user info and attaches to req.user.
 */
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid Authorization header.',
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing token.',
    });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token.',
      });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    log.error('Auth verification error', { error: err.message });
    return res.status(401).json({
      success: false,
      error: 'Authentication failed.',
    });
  }
}

module.exports = { verifyAuth };
