'use strict';

const { supabaseAdmin } = require('../utils/supabase');
const { logAudit } = require('../utils/audit');
const log = require('../utils/logger');

const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header. Please login.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing token. Please login.' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      log.warn('Auth failed', { reqId: req.id, reason: error?.message || 'invalid token', ip: req.ip });
      logAudit({
        user_id: null,
        action: 'auth_failed',
        resource_type: 'auth',
        details: { reason: error?.message || 'invalid token', ip: req.ip },
      }).catch(err => log.error('Audit log failed', { reqId: req.id, error: err.message }));
      return res.status(401).json({ success: false, error: 'Invalid or expired token. Please login again.' });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    log.error('Auth verification error', { reqId: req.id, error: err.message });
    return res.status(401).json({ success: false, error: 'Authentication failed.' });
  }
};

module.exports = { verifyAuth };
