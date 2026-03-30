'use strict';

const { supabaseAdmin } = require('./supabase');
const log = require('./logger');

async function logAudit({ user_id, action, resource_type, resource_id, details }) {
  try {
    let resource = resource_type || null;
    if (resource && resource_id) {
      resource = `${resource_type}:${resource_id}`;
    }

    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id,
        action,
        resource,
        details: details || null,
      });

    if (error) {
      log.error('Audit log insert failed', { error: error.message, action });
    }
  } catch (err) {
    log.error('Audit log error', { error: err.message, action });
  }
}

module.exports = { logAudit };
