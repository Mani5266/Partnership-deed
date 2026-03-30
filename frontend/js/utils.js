// ── UTILS ─────────────────────────────────────────────────────────────────────

/**
 * Get trimmed value from an input element by ID.
 */
function v(id) {
  return (document.getElementById(id)?.value || '').trim();
}

/**
 * Format a date string (YYYY-MM-DD) to DD/MM/YYYY for display.
 */
function fmtDate(iso) {
  if (!iso) return '\u2014';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Show a toast notification.
 */
function showAlert(type, msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'}`;
  toast.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.textContent = msg;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.onclick = () => dismissToast(toast);

  toast.appendChild(text);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  const duration = type === 'error' ? 7000 : type === 'warning' ? 8000 : 5000;
  toast._dismissTimer = setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toast) {
  if (toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._dismissTimer);
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { v, fmtDate, showAlert, escapeHTML };
