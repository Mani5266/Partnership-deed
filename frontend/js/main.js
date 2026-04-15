import { API_URL, getSupabase, requireAuth, getUserId, getAccessToken } from './config.js';

// Lazy accessor — always call getSupabase() instead of using `supabase` directly.
// The client is guaranteed to be initialized after requireAuth() runs in init().
const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) throw new Error('Supabase client not initialized. Call requireAuth() first.');
    return client[prop];
  }
});
import { v, fmtDate, showAlert, escapeHTML } from './utils.js';

let currentStep = 0;
let currentPage = 'generator'; // 'generator' or 'history'
let currentDeedId = null;

// ── PARTNER STATE ─────────────────────────────────────────────────────────────
// Dynamic partners array — minimum 2, maximum 20
const MIN_PARTNERS = 2;
const MAX_PARTNERS = 20;

let partners = [
  { name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false },
  { name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false },
];

// Ordinal labels for parties
const ORDINAL_LABELS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth',
  'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth',
  'Nineteenth', 'Twentieth',
];

function getPartyLabel(index) {
  return ORDINAL_LABELS[index] || `${index + 1}th`;
}

// ── SUPABASE CRUD HELPERS ─────────────────────────────────────────────────────

async function dbInsertDeed({ business_name, partner1_name, partner2_name, payload }) {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from('deeds')
    .insert({ business_name, partner1_name, partner2_name, payload, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbUpdateDeed(id, updates) {
  const { data, error } = await supabase
    .from('deeds')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbGetDeeds() {
  // Try with document count join; fall back to plain query if child tables don't exist yet
  let data, error;
  ({ data, error } = await supabase
    .from('deeds')
    .select('*, deed_documents(count)')
    .order('created_at', { ascending: false }));

  if (error) {
    // Fallback: child tables may not exist yet (pre-migration)
    ({ data, error } = await supabase
      .from('deeds')
      .select('*')
      .order('created_at', { ascending: false }));
    if (error) throw error;
    return data || [];
  }

  return (data || []).map(d => ({
    ...d,
    _versionCount: d.deed_documents?.[0]?.count ?? 0,
  }));
}

async function dbGetDeedById(id) {
  // Fetch the deed (required)
  const { data: deed, error: deedErr } = await supabase
    .from('deeds')
    .select('*')
    .eq('id', id)
    .single();
  if (deedErr) throw deedErr;

  // Fetch child tables in parallel (best-effort — tables may not exist yet)
  deed._partners = [];
  deed._address = null;
  try {
    const [partnersRes, addressRes] = await Promise.all([
      supabase.from('partners').select('*').eq('deed_id', id).order('ordinal', { ascending: true }),
      supabase.from('business_addresses').select('*').eq('deed_id', id).maybeSingle(),
    ]);
    if (!partnersRes.error) deed._partners = partnersRes.data || [];
    if (!addressRes.error) deed._address = addressRes.data || null;
  } catch (_) {
    // Child tables may not exist pre-migration; proceed with payload fallback
  }

  return deed;
}

async function dbDeleteDeed(id) {
  const { error } = await supabase
    .from('deeds')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Upsert helper: insert if no id, update if id exists.
// After saving the deed, also upserts partners + business address into child tables.
async function dbSaveDeed({ id, business_name, partner1_name, partner2_name, payload }) {
  let deed;
  if (id) {
    deed = await dbUpdateDeed(id, { business_name, partner1_name, partner2_name, payload });
  } else {
    deed = await dbInsertDeed({ business_name, partner1_name, partner2_name, payload });
  }

  // Upsert child tables in parallel (best-effort — don't block the save)
  const deedId = deed.id;
  try {
    await Promise.all([
      dbUpsertPartners(deedId, payload),
      dbUpsertAddress(deedId, payload),
    ]);
  } catch (childErr) {
    console.warn('Child table upsert failed (deed saved OK):', childErr);
  }

  return deed;
}

// ── CHILD TABLE HELPERS ─────────────────────────────────────────────────────

/**
 * Upsert partners from the payload into the `partners` table.
 * Strategy: delete all existing partners for this deed, then bulk-insert.
 * This is simpler and safer than per-row upsert when partners can be added/removed.
 */
async function dbUpsertPartners(deedId, payload) {
  const partnerData = payload.partners;
  if (!partnerData || !Array.isArray(partnerData) || partnerData.length === 0) return;

  // Delete existing partners for this deed
  const { error: delError } = await supabase
    .from('partners')
    .delete()
    .eq('deed_id', deedId);
  if (delError) throw delError;

  // Build rows
  const rows = partnerData.map((p, i) => ({
    deed_id: deedId,
    ordinal: i,
    name: p.name || '',
    relation: p.relation || 'S/O',
    father_name: p.fatherName || '',
    age: p.age ? parseInt(p.age, 10) || null : null,
    address: p.address || '',
    capital_pct: p.capital ? parseFloat(p.capital) || null : null,
    profit_pct: p.profit ? parseFloat(p.profit) || null : null,
    is_managing_partner: !!p.isManagingPartner,
    is_bank_authorized: !!p.isBankAuthorized,
  }));

  const { error: insError } = await supabase
    .from('partners')
    .insert(rows);
  if (insError) throw insError;
}

/**
 * Upsert the business address into the `business_addresses` table.
 * Uses Supabase upsert with onConflict on deed_id (1:1 relationship).
 */
async function dbUpsertAddress(deedId, payload) {
  const row = {
    deed_id: deedId,
    door_no: payload.addrDoorNo || '',
    building_name: payload.addrBuildingName || '',
    area: payload.addrArea || '',
    district: payload.addrDistrict || '',
    state: payload.addrState || '',
    pincode: payload.addrPincode || '',
  };

  const { error } = await supabase
    .from('business_addresses')
    .upsert(row, { onConflict: 'deed_id' });
  if (error) throw error;
}

/**
 * Fetch all document versions for a deed, newest first.
 * Returns empty array if the deed_documents table doesn't exist yet.
 */
async function dbGetDocumentVersions(deedId) {
  const { data, error } = await supabase
    .from('deed_documents')
    .select('*')
    .eq('deed_id', deedId)
    .order('version', { ascending: false });
  if (error) {
    console.warn('deed_documents query failed (table may not exist yet):', error.message);
    return [];
  }
  return data || [];
}

// ── PAGE NAVIGATION ───────────────────────────────────────────────────────────

let _skipHashPush = false;

function switchPage(page) {
  currentPage = page;
  const generatorPage = document.getElementById('generatorPage');
  const historyPage = document.getElementById('historyPage');
  const navGen = document.getElementById('navGenerator');
  const navHist = document.getElementById('navHistory');

  if (page === 'generator') {
    generatorPage.classList.remove('hidden');
    historyPage.classList.add('hidden');
    navGen.classList.add('active');
    navHist.classList.remove('active');
    if (!_skipHashPush) updateHash();
  } else {
    generatorPage.classList.add('hidden');
    historyPage.classList.remove('hidden');
    navGen.classList.remove('active');
    navHist.classList.add('active');
    if (!_skipHashPush) location.hash = '#history';
    fetchDeeds();
  }
}

// ── STEP NAVIGATION ──────────────────────────────────────────────────────────

function goTo(n) {
  // Hide current pane
  const panes = document.querySelectorAll('.step-pane');
  panes.forEach(p => p.classList.remove('active'));

  currentStep = n;
  const targetPane = document.querySelector(`.step-pane[data-pane="${n}"]`);
  if (targetPane) targetPane.classList.add('active');

  // Update tab states
  const tabs = document.querySelectorAll('.step-tab');
  tabs.forEach((t, i) => {
    t.classList.remove('active', 'done');
    t.setAttribute('aria-selected', i === n ? 'true' : 'false');
    if (i === n) t.classList.add('active');
    if (i < n)  t.classList.add('done');
  });

  // Update progress bar
  const progress = document.querySelector('.progress-bar');
  if (progress) progress.setAttribute('data-step', n);

  // Build review + deed preview on final step
  if (n === 3) {
    buildReview();
    buildDeedPreview();
  }

  // Scroll to top of content area
  const contentArea = document.querySelector('.content');
  if (contentArea) contentArea.scrollTo({ top: 0, behavior: 'smooth' });

  if (!_skipHashPush && currentPage === 'generator') updateHash();
}

// ── HASH ROUTING ─────────────────────────────────────────────────────────────

function updateHash() {
  const hash = `#generator/${currentStep}`;
  if (location.hash !== hash) location.hash = hash;
}

function restoreFromHash() {
  const hash = location.hash;
  if (!hash) return;

  _skipHashPush = true;
  if (hash === '#history') {
    switchPage('history');
  } else if (hash.startsWith('#generator')) {
    const parts = hash.split('/');
    const step = parseInt(parts[1]);
    switchPage('generator');
    goTo(isNaN(step) ? 0 : Math.min(Math.max(step, 0), 3));
  }
  _skipHashPush = false;
}

// ── DYNAMIC PARTNER RENDERING ────────────────────────────────────────────────

function syncPartnersFromDOM() {
  const container = document.getElementById('partnersContainer');
  if (!container) return;
  const cards = container.querySelectorAll('.partner-card');
  cards.forEach((card, i) => {
    if (partners[i]) {
      partners[i].name = card.querySelector(`[data-field="name"]`)?.value?.trim() || '';
      partners[i].relation = card.querySelector(`[data-field="relation"]`)?.value || 'S/O';
      partners[i].fatherName = card.querySelector(`[data-field="fatherName"]`)?.value?.trim() || '';
      partners[i].age = card.querySelector(`[data-field="age"]`)?.value?.trim() || '';
      partners[i].address = card.querySelector(`[data-field="address"]`)?.value?.trim() || '';
    }
  });
  // Read role checkboxes from shared checklist
  const rolesBody = document.getElementById('partnerRolesBody');
  if (rolesBody) {
    rolesBody.querySelectorAll('.partner-role-row').forEach((row, i) => {
      if (partners[i]) {
        partners[i].isManagingPartner = row.querySelector(`[data-role="isManagingPartner"]`)?.checked || false;
        partners[i].isBankAuthorized = row.querySelector(`[data-role="isBankAuthorized"]`)?.checked || false;
      }
    });
  }
}

function renderPartnerRoles() {
  const body = document.getElementById('partnerRolesBody');
  if (!body) return;

  body.innerHTML = partners.map((p, i) => {
    const displayName = p.name?.trim() || `Partner ${i + 1}`;
    const defaultPct = Math.round(100 / partners.length);
    return `
      <div class="partner-role-row" data-role-index="${i}">
        <div class="partner-role-name">
          <span class="partner-role-ordinal">${getPartyLabel(i)}</span>
          <span class="partner-role-display-name">${escapeHTML(displayName)}</span>
        </div>
        <div class="partner-role-inputs">
          <div class="partner-role-field">
            <label for="partnerCapital_${i}">Capital %</label>
            <input type="number" id="partnerCapital_${i}" placeholder="${defaultPct}" min="0" max="100" step="0.01"
              value="${v(`partnerCapital_${i}`) || ''}">
          </div>
          <div class="partner-role-field">
            <label for="partnerProfit_${i}">Profit %</label>
            <input type="number" id="partnerProfit_${i}" placeholder="${defaultPct}" min="0" max="100" step="0.01"
              value="${v(`partnerProfit_${i}`) || ''}">
          </div>
        </div>
        <div class="partner-role-checks">
          <label class="partner-role-toggle" title="Managing Partner of the firm">
            <input type="checkbox" data-role="isManagingPartner" ${p.isManagingPartner ? 'checked' : ''}>
            <svg class="role-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>
            <span>Managing Partner</span>
          </label>
          <label class="partner-role-toggle" title="Authorized for bank transactions">
            <input type="checkbox" data-role="isBankAuthorized" ${p.isBankAuthorized ? 'checked' : ''}>
            <svg class="role-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v4"/><path d="M12 14v4"/><path d="M16 14v4"/></svg>
            <span>Bank Authorization</span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  // Bind change events on role checkboxes
  body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      syncPartnersFromDOM();
      saveDraft();
      debouncedServerSave();
    });
  });
}

// ── BANK OPERATION HINT ─────────────────────────────────────────────────────

function updateBankOperationHint() {
  const select = document.getElementById('bankOperation');
  const hint = document.getElementById('bankOperationHint');
  if (!select || !hint) return;

  if (select.value === 'either') {
    hint.textContent = 'Any one authorized partner can independently sign cheques and banking instruments.';
  } else {
    hint.textContent = 'All authorized partners must jointly sign cheques and banking instruments together.';
  }
}

// Update partner display names in the roles checklist when name fields change
function updatePartnerRoleNames() {
  const body = document.getElementById('partnerRolesBody');
  if (!body) return;
  const rows = body.querySelectorAll('.partner-role-row');
  rows.forEach((row, i) => {
    if (partners[i]) {
      const nameEl = row.querySelector('.partner-role-display-name');
      if (nameEl) {
        nameEl.textContent = partners[i].name?.trim() || `Partner ${i + 1}`;
      }
    }
  });
}

function renderPartners() {
  const container = document.getElementById('partnersContainer');
  if (!container) return;

  container.innerHTML = partners.map((p, i) => `
    <div class="partner-card" data-partner-index="${i}">
      <div class="partner-card-header">
        <div class="partner-card-title">${getPartyLabel(i)} Party (Partner ${i + 1})</div>
        <div class="partner-card-actions-top">
          <label class="btn-aadhaar-upload" title="Upload Aadhaar card to auto-fill details">
            <input type="file" accept="image/*" class="aadhaar-file-input" data-partner="${i}" hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>Scan Aadhaar</span>
          </label>
          ${partners.length > MIN_PARTNERS ? `
            <button type="button" class="btn-remove-partner" data-remove="${i}" title="Remove partner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ` : ''}
        </div>
      </div>

      <div class="aadhaar-ocr-status hidden" data-ocr-status="${i}">
        <div class="ocr-progress">
          <div class="spinner"></div>
          <span class="ocr-progress-text">Processing Aadhaar card...</span>
        </div>
      </div>

      <div class="aadhaar-privacy-note hidden" data-ocr-done="${i}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span class="ocr-done-text">Auto-filled from Aadhaar (processed locally, image not stored)</span>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>Full Name <span class="req">*</span></label>
          <input type="text" data-field="name" value="${escapeHTML(p.name)}" placeholder="e.g. Rajesh Kumar">
        </div>
        <div class="field">
          <label>Relation</label>
          <select data-field="relation">
            <option value="S/O" ${p.relation === 'S/O' ? 'selected' : ''}>S/O (Son of)</option>
            <option value="D/O" ${p.relation === 'D/O' ? 'selected' : ''}>D/O (Daughter of)</option>
            <option value="W/O" ${p.relation === 'W/O' ? 'selected' : ''}>W/O (Wife of)</option>
          </select>
        </div>
        <div class="field">
          <label>Father's / Spouse's Name</label>
          <input type="text" data-field="fatherName" value="${escapeHTML(p.fatherName)}" placeholder="e.g. Suresh Kumar">
        </div>
        <div class="field">
          <label>Age (Years)</label>
          <input type="number" data-field="age" value="${escapeHTML(String(p.age))}" placeholder="e.g. 35" min="18" max="120">
        </div>
        <div class="field full-width">
          <label>Residential Address</label>
          <textarea data-field="address" rows="2" placeholder="Complete residential address">${escapeHTML(p.address)}</textarea>
        </div>
      </div>
    </div>
    ${i < partners.length - 1 ? '<div class="form-divider"></div>' : ''}
  `).join('');

  // Update add button state
  const addBtn = document.getElementById('addPartnerBtn');
  if (addBtn) {
    addBtn.disabled = partners.length >= MAX_PARTNERS;
    if (partners.length >= MAX_PARTNERS) {
      addBtn.title = `Maximum ${MAX_PARTNERS} partners allowed`;
    } else {
      addBtn.title = '';
    }
  }

  // Bind events
  bindPartnerEvents();

  // Keep count input in sync
  updatePartnerCountInput();

  // Render shared roles checklist
  renderPartnerRoles();

  // Bind capital/profit events within roles checklist
  bindCapitalProfitEvents();

  // Restore profit-same-as-capital state
  const profitSameCheckbox = document.getElementById('profitSameAsCapital');
  if (profitSameCheckbox && profitSameCheckbox.checked) {
    syncProfitFromCapital();
    setProfitFieldsDisabled(true);
  }

  updateCapitalHint();
  updateProfitHint();
}

function bindPartnerEvents() {
  const container = document.getElementById('partnersContainer');
  if (!container) return;

  // Remove partner buttons
  container.querySelectorAll('.btn-remove-partner').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.remove);
      removePartner(idx);
    };
  });

  // Aadhaar file inputs
  container.querySelectorAll('.aadhaar-file-input').forEach(input => {
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const idx = parseInt(input.dataset.partner);
      processAadhaarOCR(file, idx);
      input.value = ''; // reset so same file can be selected again
    };
  });

  // Input change listeners for auto-save
  container.querySelectorAll('input, select, textarea').forEach(el => {
    const eventType = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      syncPartnersFromDOM();
      // Update partner names in the shared roles checklist
      if (el.dataset.field === 'name') {
        updatePartnerRoleNames();
      }
      // Clear field error on edit
      const fieldWrap = el.closest('.field');
      if (fieldWrap && fieldWrap.classList.contains('error')) {
        fieldWrap.classList.remove('error');
        const errMsg = fieldWrap.querySelector('.field-error-msg');
        if (errMsg) errMsg.remove();
      }
      saveDraft();
      debouncedServerSave();
    });
  });
}

function addPartner() {
  if (partners.length >= MAX_PARTNERS) {
    showAlert('error', `Maximum ${MAX_PARTNERS} partners allowed.`);
    return;
  }
  syncPartnersFromDOM();
  partners.push({ name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false });
  renderPartners();
  updatePartnerCountInput();
  saveDraft();
  debouncedServerSave();

  // Scroll to the new partner card
  const container = document.getElementById('partnersContainer');
  const lastCard = container?.querySelector('.partner-card:last-child');
  if (lastCard) {
    lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => lastCard.querySelector('[data-field="name"]')?.focus(), 300);
  }
}

function removePartner(index) {
  if (partners.length <= MIN_PARTNERS) {
    showAlert('error', `Minimum ${MIN_PARTNERS} partners required.`);
    return;
  }
  syncPartnersFromDOM();
  partners.splice(index, 1);
  renderPartners();
  updatePartnerCountInput();
  saveDraft();
  debouncedServerSave();
}

// ── PARTNER COUNT SELECTOR ──────────────────────────────────────────────────

function updatePartnerCountInput() {
  const input = document.getElementById('partnerCountInput');
  if (input) input.value = partners.length;
}

function setPartnerCount(count) {
  count = Math.max(MIN_PARTNERS, Math.min(MAX_PARTNERS, parseInt(count) || MIN_PARTNERS));
  syncPartnersFromDOM();

  if (count === partners.length) {
    updatePartnerCountInput();
    return;
  }

  if (count > partners.length) {
    // Add new empty partners
    while (partners.length < count) {
      partners.push({ name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false });
    }
  } else {
    // Remove partners from the end (warn if they have data)
    const removedPartners = partners.slice(count);
    const hasData = removedPartners.some(p => p.name || p.fatherName || p.address);
    if (hasData) {
      if (!confirm(`This will remove ${partners.length - count} partner(s) with filled data. Continue?`)) {
        updatePartnerCountInput();
        return;
      }
    }
    partners = partners.slice(0, count);
  }

  renderPartners();
  updatePartnerCountInput();
  saveDraft();
  debouncedServerSave();

  showAlert('success', `Partner count set to ${count}. ${count > 2 ? 'Fill in each partner\'s details below.' : ''}`);
}

// ── AADHAAR OCR (Gemini Vision API) ─────────────────────────────────────────

// Convert a File to base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" — extract just the base64 part
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

// Send image to backend Gemini OCR endpoint and return extracted data
async function callOcrApi(file) {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';

  const response = await fetch('/api/ocr/aadhaar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ image: base64, mimeType }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || `OCR request failed (${response.status})`);
  }

  return result.data; // { name, fatherName, relation, age, gender, address }
}

// ── BULK AADHAAR OCR ────────────────────────────────────────────────────────

async function processBulkAadhaarOCR(files) {
  if (!files || files.length === 0) return;

  const fileCount = files.length;
  const currentCount = partners.length;

  // If more files than partners, expand partner count to match
  if (fileCount > currentCount) {
    if (fileCount > MAX_PARTNERS) {
      showAlert('error', `You selected ${fileCount} files but maximum ${MAX_PARTNERS} partners are allowed. Only the first ${MAX_PARTNERS} will be processed.`);
    }
    const targetCount = Math.min(fileCount, MAX_PARTNERS);
    while (partners.length < targetCount) {
      partners.push({ name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false });
    }
    renderPartners();
    updatePartnerCountInput();
  }

  const totalToProcess = Math.min(fileCount, partners.length, MAX_PARTNERS);

  // Show bulk progress UI
  const progressEl = document.getElementById('bulkOcrProgress');
  const progressText = document.getElementById('bulkOcrText');
  const progressBarFill = document.getElementById('bulkOcrBarFill');
  if (progressEl) progressEl.classList.remove('hidden');

  let successCount = 0;
  const partnersMissingFields = []; // Track missing fields per partner

  for (let i = 0; i < totalToProcess; i++) {
    const file = files[i];
    const pct = Math.round(((i) / totalToProcess) * 100);

    if (progressText) progressText.textContent = `Processing Partner ${i + 1} of ${totalToProcess}... (${pct}%)`;
    if (progressBarFill) progressBarFill.style.width = `${pct}%`;

    // Show individual card OCR status
    const statusEl = document.querySelector(`[data-ocr-status="${i}"]`);
    const doneEl = document.querySelector(`[data-ocr-done="${i}"]`);
    if (statusEl) statusEl.classList.remove('hidden');
    if (doneEl) doneEl.classList.add('hidden');
    const cardProgressText = statusEl?.querySelector('.ocr-progress-text');

    try {
      if (cardProgressText) cardProgressText.textContent = 'Scanning with AI...';

      const extracted = await callOcrApi(file);
      console.log(`[Bulk OCR] Partner ${i + 1} extracted:`, extracted);

      // Check if extraction returned nothing (back side or non-card image)
      const hasAnyData = extracted.name || extracted.fatherName || extracted.age || extracted.address;
      if (!hasAnyData) {
        console.warn(`[Bulk OCR] Partner ${i + 1}: No data extracted - image may be back side or unclear`);
        if (statusEl) statusEl.classList.add('hidden');
        if (doneEl) doneEl.classList.remove('hidden');
        const doneLbl = doneEl?.querySelector('.ocr-done-text');
        if (doneLbl) doneLbl.textContent = 'No data found (wrong side or unclear image)';
        continue;
      }

      // Apply extracted data to partner card
      const missingFields = applyExtractedToCard(i, extracted);

      // Track success
      const fields = [extracted.name && 'Name', extracted.age && 'Age',
        extracted.fatherName && "Father's Name", extracted.relation && 'Relation',
        extracted.address && 'Address'].filter(Boolean);
      if (fields.length > 0) successCount++;

      // Track missing fields for this partner
      if (missingFields.length > 0) {
        partnersMissingFields.push({ index: i, label: getPartyLabel(i) + ' Party', missing: missingFields });
      }

      if (statusEl) statusEl.classList.add('hidden');
      if (doneEl) doneEl.classList.remove('hidden');

    } catch (err) {
      console.error(`Aadhaar OCR error for partner ${i + 1}:`, err);
      if (statusEl) statusEl.classList.add('hidden');
      if (cardProgressText) cardProgressText.textContent = '';
      // Show error on the card
      if (doneEl) {
        doneEl.classList.remove('hidden');
        const doneLbl = doneEl?.querySelector('.ocr-done-text');
        if (doneLbl) doneLbl.textContent = `Error: ${err?.message || 'OCR failed'}`;
      }
    }
  }

  // Sync all data to state
  syncPartnersFromDOM();
  updatePartnerRoleNames();
  saveDraft();
  debouncedServerSave();

  // Complete progress
  if (progressBarFill) progressBarFill.style.width = '100%';
  if (progressText) progressText.textContent = `Completed! ${successCount} of ${totalToProcess} cards processed.`;
  setTimeout(() => { if (progressEl) progressEl.classList.add('hidden'); }, 3000);

  // Summary notification
  if (successCount > 0) {
    const failCount = totalToProcess - successCount;
    let msg = `Auto-filled ${successCount} of ${totalToProcess} partner(s) from Aadhaar cards. Please verify all details.`;
    if (failCount > 0) {
      msg += ` ${failCount} image(s) could not be read - ensure you upload the FRONT side of the Aadhaar card.`;
    }
    showAlert('success', msg);
  } else {
    showAlert('error', 'Could not extract details from any image. Please upload clear photos of the FRONT side of each Aadhaar card (the side with name, photo, and DOB).');
  }

  // Show warning for partners with missing fields
  if (partnersMissingFields.length > 0) {
    // Build a concise warning message listing each partner's missing fields
    const warnings = partnersMissingFields.map(p => `${p.label}: ${p.missing.join(', ')}`);
    const warningMsg = `Some fields could not be extracted. Please fill them manually:\n${warnings.join(' | ')}`;
    showAlert('error', warningMsg);
  }
}

// ── SINGLE AADHAAR OCR ──────────────────────────────────────────────────────

async function processAadhaarOCR(file, partnerIndex) {
  const statusEl = document.querySelector(`[data-ocr-status="${partnerIndex}"]`);
  const doneEl = document.querySelector(`[data-ocr-done="${partnerIndex}"]`);
  const progressText = statusEl?.querySelector('.ocr-progress-text');

  if (statusEl) statusEl.classList.remove('hidden');
  if (doneEl) doneEl.classList.add('hidden');

  try {
    if (progressText) progressText.textContent = 'Scanning with AI...';

    const extracted = await callOcrApi(file);
    console.log(`[Aadhaar OCR] Partner ${partnerIndex + 1} extracted:`, extracted);

    // Apply extracted data to partner form fields
    const missingFields = applyExtractedToCard(partnerIndex, extracted);

    // Sync to state
    syncPartnersFromDOM();
    updatePartnerRoleNames();
    saveDraft();
    debouncedServerSave();

    // Show success
    if (statusEl) statusEl.classList.add('hidden');
    if (doneEl) doneEl.classList.remove('hidden');

    const filledFields = [
      extracted.name && 'Name',
      extracted.age && 'Age',
      extracted.fatherName && "Father's/Spouse's Name",
      extracted.relation && 'Relation',
      extracted.address && 'Address',
    ].filter(Boolean);

    if (filledFields.length > 0) {
      showAlert('success', `Extracted: ${filledFields.join(', ')}. Please verify the details.`);
    } else {
      showAlert('error', 'Could not extract details. Make sure you upload the FRONT side of the Aadhaar card (with name, photo, and DOB).');
    }

    // Warn about any fields that could not be extracted
    if (missingFields.length > 0 && filledFields.length > 0) {
      const partyLabel = getPartyLabel(partnerIndex) + ' Party';
      showAlert('error', `${partyLabel}: Could not extract ${missingFields.join(', ')}. Please fill ${missingFields.length === 1 ? 'it' : 'them'} manually.`);
    }

  } catch (err) {
    console.error('Aadhaar OCR error:', err);
    if (statusEl) statusEl.classList.add('hidden');
    showAlert('error', `OCR failed: ${err?.message || String(err) || 'Unknown error'}. Please fill in manually.`);
  }
}

// Apply extracted OCR data into a partner card's form fields
// Returns an array of missing field labels (empty if all fields were filled)
function applyExtractedToCard(partnerIndex, extracted) {
  const card = document.querySelector(`.partner-card[data-partner-index="${partnerIndex}"]`);
  if (!card) return ['Name', "Father's/Spouse's Name", 'Age', 'Address'];

  const missingFields = [];

  if (extracted.name) {
    const el = card.querySelector('[data-field="name"]');
    if (el) el.value = extracted.name;
  } else {
    missingFields.push('Name');
  }

  if (extracted.fatherName) {
    const el = card.querySelector('[data-field="fatherName"]');
    if (el) el.value = extracted.fatherName;
  } else {
    missingFields.push("Father's/Spouse's Name");
  }

  if (extracted.relation) {
    const el = card.querySelector('[data-field="relation"]');
    if (el) el.value = extracted.relation;
  } else {
    missingFields.push('Relation');
  }

  if (extracted.age) {
    const el = card.querySelector('[data-field="age"]');
    if (el) el.value = extracted.age;
  } else {
    missingFields.push('Age');
  }

  if (extracted.address) {
    const el = card.querySelector('[data-field="address"]');
    if (el) el.value = extracted.address;
  } else {
    missingFields.push('Address');
  }

  return missingFields;
}

// ── AI BUSINESS OBJECTIVE GENERATION ────────────────────────────────────────

/**
 * Show a temporary "AI-filled" badge next to a form field.
 * The badge fades out when the user manually edits the field.
 */
function showAiFilledBadge(inputEl) {
  if (!inputEl) return;
  const field = inputEl.closest('.field');
  if (!field) return;

  // Remove any existing badge first
  const existing = field.querySelector('.ai-filled-badge');
  if (existing) existing.remove();

  const badge = document.createElement('span');
  badge.className = 'ai-filled-badge';
  badge.textContent = 'AI-filled';

  // Insert badge after the label
  const label = field.querySelector('label');
  if (label) {
    label.appendChild(badge);
  }

  // Briefly highlight the input
  inputEl.classList.add('ai-filled-highlight');
  setTimeout(() => inputEl.classList.remove('ai-filled-highlight'), 2000);

  // Remove badge when user manually edits the field
  function removeBadge() {
    badge.remove();
    inputEl.removeEventListener('input', removeBadge);
  }
  inputEl.addEventListener('input', removeBadge);
}

async function generateBusinessObjective() {
  const descInput = document.getElementById('businessDescriptionInput');
  const genBtn = document.getElementById('generateObjectiveBtn');
  const regenBtn = document.getElementById('regenerateObjectiveBtn');
  const progressEl = document.getElementById('objectiveProgress');
  const outputEl = document.getElementById('objectiveOutput');
  const objectiveTextarea = document.getElementById('businessObjectives');

  if (!descInput) return;

  const description = descInput.value.trim();
  if (!description || description.length < 3) {
    showAlert('warning', 'Please describe your business in at least a few words before generating.');
    descInput.focus();
    return;
  }

  // Disable buttons & show progress
  if (genBtn) genBtn.disabled = true;
  if (regenBtn) regenBtn.disabled = true;
  if (progressEl) progressEl.classList.remove('hidden');

  try {
    const response = await fetch('/api/generate-objective', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({ description }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }

    // Show the output section and populate
    if (objectiveTextarea) objectiveTextarea.value = result.objective;
    if (outputEl) outputEl.classList.remove('hidden');

    // Auto-fill Nature of Business if AI returned it
    const natureInput = document.getElementById('natureOfBusiness');
    if (result.nature && natureInput) {
      natureInput.value = result.nature;
      // Show AI-filled indicator
      showAiFilledBadge(natureInput);
    }

    showAlert('success', 'Business objective generated. Nature of Business auto-filled. Review and edit if needed.');

    // Trigger auto-save
    saveDraft();
    debouncedServerSave();

  } catch (err) {
    console.error('Business objective generation error:', err);
    showAlert('error', `Failed to generate: ${err?.message || 'Unknown error'}`);
  } finally {
    if (genBtn) genBtn.disabled = false;
    if (regenBtn) regenBtn.disabled = false;
    if (progressEl) progressEl.classList.add('hidden');
  }
}

// ── AI BUSINESS NAME SUGGESTIONS ────────────────────────────────────────────

async function suggestBusinessNames() {
  const natureInput = document.getElementById('natureOfBusiness');
  const suggestBtn = document.getElementById('suggestNamesBtn');
  const progressEl = document.getElementById('nameSuggestProgress');
  const containerEl = document.getElementById('nameSuggestContainer');
  const chipsEl = document.getElementById('nameSuggestChips');
  const businessNameInput = document.getElementById('businessName');

  if (!natureInput) return;

  const natureOfBusiness = natureInput.value.trim();
  if (!natureOfBusiness || natureOfBusiness.length < 3) {
    showAlert('warning', 'Please enter the Nature of Business first so we can suggest relevant names.');
    natureInput.focus();
    return;
  }

  // Disable button & show progress
  if (suggestBtn) suggestBtn.disabled = true;
  if (progressEl) progressEl.classList.remove('hidden');
  if (containerEl) containerEl.classList.add('hidden');

  try {
    const response = await fetch('/api/suggest-business-names', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({ natureOfBusiness }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }

    const names = result.names;
    if (!Array.isArray(names) || names.length === 0) {
      throw new Error('No suggestions returned.');
    }

    // Render chips
    if (chipsEl) {
      chipsEl.innerHTML = names.map(name => {
        const escaped = escapeHTML(name);
        return `<button type="button" class="name-chip" data-name="${escaped}" title="Click to use: ${escaped}">${escaped}</button>`;
      }).join('');

      // Bind click handlers
      chipsEl.querySelectorAll('.name-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          // Remove selected from all chips
          chipsEl.querySelectorAll('.name-chip').forEach(c => c.classList.remove('selected'));
          // Mark this one selected
          chip.classList.add('selected');
          // Set the business name input
          if (businessNameInput) {
            businessNameInput.value = chip.dataset.name;
            // Trigger save
            saveDraft();
            debouncedServerSave();
          }
          showAlert('success', `Business name set to "${chip.dataset.name}". You can still edit it manually.`);
        });
      });

      // Highlight current businessName if it matches a chip
      const currentName = businessNameInput?.value.trim();
      if (currentName) {
        chipsEl.querySelectorAll('.name-chip').forEach(chip => {
          if (chip.dataset.name === currentName) chip.classList.add('selected');
        });
      }
    }

    if (containerEl) containerEl.classList.remove('hidden');
    showAlert('success', 'Name suggestions ready. Click one to use it!');

  } catch (err) {
    console.error('Business name suggestion error:', err);
    showAlert('error', `Failed to suggest names: ${err?.message || 'Unknown error'}`);
  } finally {
    if (suggestBtn) suggestBtn.disabled = false;
    if (progressEl) progressEl.classList.add('hidden');
  }
}

// ── STRUCTURED ADDRESS COMPOSITION ──────────────────────────────────────────

const ADDRESS_FIELDS = ['addrDoorNo', 'addrBuildingName', 'addrArea', 'addrDistrict', 'addrState', 'addrPincode'];

/**
 * Compose the full registered address from structured sub-fields.
 * Format: "{BuildingName}, {DoorNo}, {Area}, {District}, {State}, India-{Pincode}"
 * Mirrors: "JR PINNACLE, Plot Nos.13, 14 Eastern Part Karmanghat, Saroornagar, L.B Nagar Circle, Ranga Reddy, Telangana, India-500079"
 */
function composeAddress() {
  const building = v('addrBuildingName');
  const door = v('addrDoorNo');
  const area = v('addrArea');
  const district = v('addrDistrict');
  const state = v('addrState');
  const pincode = v('addrPincode');

  const parts = [];
  if (building) parts.push(building);
  if (door) parts.push(door);
  if (area) parts.push(area);
  if (district) parts.push(district);
  if (state) parts.push(state);
  if (pincode) {
    parts.push(`India-${pincode}`);
  } else {
    parts.push('India');
  }

  const combined = parts.join(', ');
  const hiddenEl = document.getElementById('registeredAddress');
  if (hiddenEl) hiddenEl.value = combined;
  return combined;
}

/**
 * Decompose a combined address string into structured sub-fields.
 * Used for backward compatibility when loading old deeds that stored a single string.
 */
function decomposeAddress(fullAddress) {
  if (!fullAddress) return;

  // Check if structured sub-fields are already stored in the payload
  // (they will be, for new deeds). If not, put the whole string into Area as fallback.
  const doorEl = document.getElementById('addrDoorNo');
  const areaEl = document.getElementById('addrArea');

  // If the sub-fields already have data (restored by the normal field-by-id loop), skip
  if (doorEl && doorEl.value.trim()) return;
  if (areaEl && areaEl.value.trim()) return;

  // Fallback: put the entire old address into the Area field for manual correction
  if (areaEl) areaEl.value = fullAddress;
}

// ── PARTNERSHIP DURATION TOGGLE ─────────────────────────────────────────────

function toggleDurationFields() {
  const durationSelect = document.getElementById('partnershipDuration');
  const datesRow1 = document.getElementById('durationDatesRow1');
  const datesRow2 = document.getElementById('durationDatesRow2');
  const placeholder = document.getElementById('durationPlaceholder');
  const startDate = document.getElementById('partnershipStartDate');
  const endDate = document.getElementById('partnershipEndDate');

  if (!durationSelect) return;

  const isFixed = durationSelect.value === 'fixed';

  if (isFixed) {
    if (datesRow1) datesRow1.classList.remove('hidden');
    if (datesRow2) datesRow2.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
    if (startDate) startDate.required = true;
    if (endDate) endDate.required = true;
  } else {
    if (datesRow1) datesRow1.classList.add('hidden');
    if (datesRow2) datesRow2.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (startDate) { startDate.required = false; startDate.value = ''; }
    if (endDate) { endDate.required = false; endDate.value = ''; }
  }
}

// ── DYNAMIC CAPITAL & PROFIT EVENT BINDING ──────────────────────────────────

/**
 * Bind input events on capital/profit fields inside partner cards.
 * Capital fields: update hint, sync to profit if checkbox checked, auto-save.
 * Profit fields: update hint, auto-save.
 * Also binds the "profit same as capital" checkbox.
 */
function bindCapitalProfitEvents() {
  const rolesBody = document.getElementById('partnerRolesBody');
  const profitSameCheckbox = document.getElementById('profitSameAsCapital');
  if (!rolesBody) return;

  // Bind capital input events
  partners.forEach((_, i) => {
    const capEl = document.getElementById(`partnerCapital_${i}`);
    if (capEl) {
      capEl.addEventListener('input', () => {
        updateCapitalHint();
        if (profitSameCheckbox && profitSameCheckbox.checked) {
          syncProfitFromCapital();
        }
        saveDraft();
        debouncedServerSave();
      });
    }

    const profEl = document.getElementById(`partnerProfit_${i}`);
    if (profEl) {
      profEl.addEventListener('input', () => {
        updateProfitHint();
        saveDraft();
        debouncedServerSave();
      });
    }
  });

  // Bind the "same as capital" checkbox
  if (profitSameCheckbox) {
    profitSameCheckbox.onchange = () => {
      if (profitSameCheckbox.checked) {
        syncProfitFromCapital();
      }
      setProfitFieldsDisabled(profitSameCheckbox.checked);
      saveDraft();
      debouncedServerSave();
    };
  }
}

// Copy capital values into profit fields and update hint
function syncProfitFromCapital() {
  partners.forEach((_, i) => {
    const capVal = v(`partnerCapital_${i}`);
    const profEl = document.getElementById(`partnerProfit_${i}`);
    if (profEl) profEl.value = capVal;
  });
  updateProfitHint();
}

// Enable or disable profit input fields (inside partner cards)
function setProfitFieldsDisabled(disabled) {
  partners.forEach((_, i) => {
    const el = document.getElementById(`partnerProfit_${i}`);
    if (el) {
      el.disabled = disabled;
      el.style.opacity = disabled ? '0.55' : '';
    }
  });
}

// ── REVIEW ───────────────────────────────────────────────────────────────────

function buildReview() {
  syncPartnersFromDOM();
  composeAddress(); // Ensure the combined address is up-to-date

  const sections = [];

  // Partner sections
  partners.forEach((p, i) => {
    const roles = [];
    if (p.isManagingPartner) roles.push('Managing Partner');
    if (p.isBankAuthorized) roles.push('Bank Authorized');
    sections.push({
      title: `Partner ${i + 1} (${getPartyLabel(i)} Party)`,
      rows: [
        ['Name', p.name || ''],
        ['Relation', `${p.relation || 'S/O'} ${p.fatherName || ''}`],
        ['Age', p.age ? `${p.age} years` : ''],
        ['Address', p.address || ''],
        ['Roles', roles.length > 0 ? roles.join(', ') : 'None assigned'],
      ]
    });
  });

  // Business details
  const durationVal = v('partnershipDuration');
  let durationDisplay = 'At Will of the Partners';
  if (durationVal === 'fixed') {
    const start = fmtDate(v('partnershipStartDate'));
    const end = fmtDate(v('partnershipEndDate'));
    durationDisplay = `Fixed Duration: ${start || '—'} to ${end || '—'}`;
  }
  const bizRows = [
    ['Business Name', `M/s. ${v('businessName')}`],
    ['Date of Deed', fmtDate(v('deedDate'))],
    ['Duration', durationDisplay],
    ['Nature', v('natureOfBusiness')],
    ['Registered Address', v('registeredAddress')],
  ];
  const objVal = v('businessObjectives');
  if (objVal) {
    bizRows.push(['Business Objective', objVal.length > 120 ? objVal.substring(0, 120) + '...' : objVal]);
  }
  sections.push({
    title: 'Business Details',
    rows: bizRows,
  });

  // Capital & Profit
  const capitalRows = partners.map((p, i) =>
    [`Partner ${i + 1}${p.name ? ' (' + p.name + ')' : ''}`, `${v(`partnerCapital_${i}`) || '0'}%`]
  );
  const profitRows = partners.map((p, i) =>
    [`Partner ${i + 1}${p.name ? ' (' + p.name + ')' : ''}`, `${v(`partnerProfit_${i}`) || '0'}%`]
  );

  sections.push({
    title: 'Capital Contribution',
    rows: capitalRows,
  });

  sections.push({
    title: 'Profit / Loss Sharing',
    rows: profitRows,
  });

  // Managing Partners & Bank Authorization summary
  const managingNames = partners
    .filter(p => p.isManagingPartner)
    .map(p => p.name || 'Unnamed')
    .join(', ');
  const bankAuthNames = partners
    .filter(p => p.isBankAuthorized)
    .map(p => p.name || 'Unnamed')
    .join(', ');

  sections.push({
    title: 'Clauses',
    rows: [
      ['Managing Partner(s)', managingNames || 'None selected'],
      ['Bank Authorized Partner(s)', bankAuthNames || 'None selected'],
      ['Bank Operation', v('bankOperation') === 'either' ? 'Either partner independently' : 'Jointly'],
      ['Interest Rate', `${v('interestRate') || '12'}% p.a.`],
      ['Notice Period', `${v('noticePeriod') || '3'} months`],
      ['Accounting Year', v('accountingYear') || '31st March'],
      ['Additional Terms', v('additionalPoints') || 'None'],
    ]
  });

  const grid = document.getElementById('reviewGrid');
  if (grid) {
    grid.innerHTML = sections.map(s => `
      <div class="review-card">
        <div class="review-card-title">${escapeHTML(s.title)}</div>
        ${s.rows.map(([k, val]) =>
          `<div class="review-row">
            <span class="review-label">${escapeHTML(k)}</span>
            <span class="review-value">${escapeHTML(val) || '\u2014'}</span>
          </div>`
        ).join('')}
      </div>
    `).join('');
  }
}

// ── INLINE DEED PREVIEW (editable, scrollable) ──────────────────────────────

function buildDeedPreview() {
  syncPartnersFromDOM();
  const d = getPayload();
  const container = document.getElementById('deedPreviewContainer');
  if (!container) return;

  const biz = escapeHTML(d.businessName || '_______________');
  const deedDate = fmtDate(d.deedDate) || 'the _______ day of _______ 20___';
  const addr = escapeHTML(d.registeredAddress || '_______________');
  const nature = escapeHTML(d.natureOfBusiness || '_______________');
  const objectives = escapeHTML(d.businessObjectives || '_______________');
  const interestRate = escapeHTML(d.interestRate || '12');
  const noticePeriod = escapeHTML(d.noticePeriod || '3');
  const accountingYear = escapeHTML(d.accountingYear || '31st March');
  const bankOp = d.bankOperation || 'jointly';
  const additionalPoints = d.additionalPoints || '';

  // Partner intro paragraphs
  const partnerIntros = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const rel = escapeHTML(p.relation || 'S/O');
    const father = escapeHTML(p.fatherName || '_______________');
    const age = escapeHTML(String(p.age || '___'));
    const address = escapeHTML(p.address || '_______________');
    const label = getPartyLabel(i);
    let html = `<p><strong>${name}</strong> ${rel} <strong>${father}</strong> Aged <strong>${age}</strong> Years, residing at ${address}.</p>`;
    html += `<p>(Hereinafter called as the <strong><em>"${label} Party"</em></strong>)</p>`;
    if (i < partners.length - 1) {
      html += `<p style="text-align:center"><strong>AND</strong></p>`;
    }
    return html;
  }).join('\n');

  // Capital contribution bullets
  const capitalBullets = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const label = getPartyLabel(i);
    const cap = escapeHTML(d[`partnerCapital_${i}`] || v(`partnerCapital_${i}`) || '___');
    return `<li><strong>${label} Party (${name}):</strong> ${cap}%</li>`;
  }).join('\n');

  // Profit sharing bullets
  const profitBullets = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const label = getPartyLabel(i);
    const prof = escapeHTML(d[`partnerProfit_${i}`] || v(`partnerProfit_${i}`) || '___');
    return `<li><strong>${name}</strong> (${label} Party) - ${prof}%</li>`;
  }).join('\n');

  // Duration
  let durationText = 'The duration of the firm shall be at WILL of the partners.';
  if (d.partnershipDuration === 'fixed' && d.partnershipStartDate && d.partnershipEndDate) {
    durationText = `The duration of the partnership shall be for a fixed period commencing from <strong>${fmtDate(d.partnershipStartDate)}</strong> and ending on <strong>${fmtDate(d.partnershipEndDate)}</strong>, unless terminated earlier by mutual consent of all the partners or by operation of law.`;
  }

  // Managing Partners
  const managingPartnersList = partners
    .map((p, i) => ({ ...p, _index: i }))
    .filter(p => p.isManagingPartner);
  const effectiveManagingPartners = managingPartnersList.length > 0
    ? managingPartnersList
    : partners.map((p, i) => ({ ...p, _index: i }));

  const managingPartnersText = effectiveManagingPartners.map((p, i) => {
    const sep = i > 0 ? ' &amp; ' : '';
    return `${sep}<strong>${escapeHTML(p.name || 'N/A')}</strong> (${getPartyLabel(p._index)} Party)`;
  }).join('');

  const pluralMgr = effectiveManagingPartners.length > 1;
  const managingPowers = [
    'To manage the business of the partnership firm with a power to appoint remuneration, etc. They shall also have the power to dispense with the service of such personnel that are not required.',
    'To negotiate any business transactions and enter into agreements on behalf of the firm and to enter into all/any contracts and sub-contracts on either way. To enter to the sale and purchase agreements relating to the objective of the business.',
    'To enter into correspondence with government departments, quasi-govt departments, public and private organizations, individuals, etc regarding the partnership business.',
    'To incur all expenses necessary for the conduct of the business.',
    'To borrow moneys against credit of partnership, if necessary by hypothecating or creating a charge upon the assets of the partnership.',
    'To be in custody of all account books, documents, negotiable instruments and all other documents pertaining to the business.',
    'To look after the proper upkeep of books of accounts required for the business and to supervise the same at regular intervals.',
    'To open bank account/accounts in the name of the partnership firm.',
    'To put all the monies, cheques etc., which are not immediately required for the conduct of the business into the bank account, opened for the Partnership business.',
    'To do all other acts and things that are necessary for carrying on the business.',
  ];
  const managingPowersList = managingPowers.map(p => `<li>${p}</li>`).join('\n');

  // Banking
  const bankAuthPartners = partners
    .map((p, i) => ({ ...p, _index: i }))
    .filter(p => p.isBankAuthorized);
  const bankConnector = bankOp === 'either' ? ' or ' : ' and ';

  let bankingText = '';
  if (bankAuthPartners.length > 0) {
    const bankNames = bankAuthPartners.map((p, i) => {
      let sep = '';
      if (i > 0 && i < bankAuthPartners.length - 1) sep = ', ';
      else if (i === bankAuthPartners.length - 1 && bankAuthPartners.length > 1) sep = bankConnector;
      return `${sep}<strong>${escapeHTML(p.name || 'N/A')}</strong> (${getPartyLabel(p._index)} Party)`;
    }).join('');
    if (bankOp === 'either') {
      bankingText = `The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, ${bankAuthPartners.length === 1 ? 'who is' : 'either of whom is'} independently authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm.`;
    } else {
      bankingText = `The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, who ${bankAuthPartners.length === 1 ? 'is' : 'are jointly'} authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm. No transaction shall be deemed valid unless signed by all the above-named authorized partners.`;
    }
  } else {
    bankingText = 'The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts may be operated by any partner independently.';
  }

  const nextClause = additionalPoints.trim() ? 8 : 7;

  const partnerSigRows = partners.map((p, i) => `
    <p>${i + 1}. ${escapeHTML(p.name || '________________________')}</p>
    <p style="margin-left:1em">(${getPartyLabel(i)} Party)</p>
  `).join('');

  container.innerHTML = `
    <h1 style="text-align:center; font-size:16pt; text-decoration:underline; text-transform:uppercase; font-weight:bold; margin-bottom:0.5em;">Partnership Deed</h1>

    <p>This Deed of Partnership is made and executed on <strong>${deedDate}</strong>, by and between:</p>

    ${partnerIntros}

    <br>

    <p><strong>WHEREAS</strong> the parties here have mutually decided to start a partnership business of <strong>${nature}</strong> under the name and style as <strong>M/s. ${biz}</strong>.</p>

    <p><strong>AND WHEREAS</strong> it is felt expedient to reduce the terms and conditions agreed upon by the above said continuing partners into writing to avoid any misunderstandings amongst the partners at a future date.</p>

    <br>

    <p style="text-align:center; font-weight:bold; font-size:12pt; margin:1.5em 0 1em;">NOW THIS DEED OF PARTNERSHIP WITNESSETH AS FOLLOWS:</p>

    <p><strong>1. Name and Commencement</strong></p>
    <p>The partnership business shall be carried on under the name and style as <strong>M/s. ${biz}</strong>. The partnership firm shall come into existence with effect from <strong>${deedDate}</strong>.</p>

    <p><strong>2. Duration</strong></p>
    <p>${durationText}</p>

    <p><strong>3. Principal Place of Business</strong></p>
    <p>The Principal place of business of the firm shall be at <strong>${addr}</strong>.</p>

    <p><strong>4. Objectives of Partnership</strong></p>
    <p>The objective of partnership is to carry on the following business:</p>
    <p style="margin-left:2em">${objectives}</p>

    <p><strong>5. Capital Contribution of the Partners</strong></p>
    <p>The total capital contribution of the partners in the firm shall be in the following proportions:</p>
    <ul>${capitalBullets}</ul>

    <p><strong>6. Managing Partners</strong></p>
    <p>The parties ${managingPartnersText} shall be the managing partner${pluralMgr ? 's' : ''} and ${pluralMgr ? 'are' : 'is'} authorized and empowered to do the following acts, deeds and things on behalf of the firm:</p>
    <ol>${managingPowersList}</ol>
    <p>The managing partners are empowered to borrow money as and when found necessary for the business from any nationalized or schedule bank/banks or any other financial institutions from time to time and execute necessary actions at all the times.</p>

    ${additionalPoints.trim() ? `
    <p><strong>7. Additional Terms</strong></p>
    <p>${escapeHTML(additionalPoints)}</p>
    ` : ''}

    <p><strong>${nextClause}. Banking</strong></p>
    <p>${bankingText}</p>

    <p><strong>${nextClause + 1}. Authorized Signatory</strong></p>
    <p>The partners, upon mutual consent of all the partners of this partnership deed appoint any another individual as the authorized signatory for entering into the agreements relating to sale and purchase of the land or/and building.</p>

    <p><strong>${nextClause + 2}. Working Partners and Remuneration</strong></p>
    <p>That all the partners shall be working partners of the firm and shall be bound to devote full time and attention to the partnership business and shall be actively engaged in conducting the affairs of the firm and therefore it has been agreed to pay salary/remuneration for the services rendered as per the provisions under section 40(b) of the Income Tax Act, 1961.</p>

    <p><strong>${nextClause + 3}. Interest on Capital</strong></p>
    <p>That the interest at the rate of ${interestRate}% per annum or as may be prescribed u/s.40(b)(iv) of the Income Tax Act, 1961 shall be payable to the partners on the amount standing to the credit of the account of the partners.</p>

    <p><strong>${nextClause + 4}. Books of Accounts</strong></p>
    <p>The books of accounts of the partnership shall be maintained at the principal place of business and the same shall be closed on the <strong>${accountingYear}</strong> every year.</p>

    <p><strong>${nextClause + 5}. Profit and Loss Sharing</strong></p>
    <p>That the share of the profits or losses of partnership business after taking into account all business and incidental expenses will be as follows:</p>
    <ul>${profitBullets}</ul>

    <p><strong>${nextClause + 6}. Retirement</strong></p>
    <p>Any partner desirous of retiring from the partnership during its continuance can exercise his/her right by giving ${noticePeriod} calendar months' notice to the other partner(s).</p>

    <p><strong>${nextClause + 7}. Death, Retirement or Insolvency</strong></p>
    <p>Death, retirement or insolvency of any of the partners shall not dissolve the partnership.</p>

    <p><strong>${nextClause + 8}. Arbitration</strong></p>
    <p>Any dispute that may arise between the partners shall be referred to an arbitrator whose award shall be final and binding on the parties MUTATIS MUTANDIS.</p>

    <p><strong>${nextClause + 9}. Applicable Law</strong></p>
    <p>The provision of the Partnership Act, 1932 as in vogue from time to time shall apply to this partnership except as otherwise stated above.</p>

    <p><strong>${nextClause + 10}. Amendments</strong></p>
    <p>Any of the terms of this Deed may be amended, abandoned or otherwise be dealt with according to the necessities of the business and convenience of the partners and they shall be reduced to writing on Rs. 100/- stamp paper.</p>

    <br><br>

    <p><strong>IN WITNESS WHEREOF</strong> the parties hereto have set hands on this the <strong>${deedDate}</strong>.</p>

    <table style="width:100%; margin-top:2em; border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top; width:50%; padding:0 1em;">
          <p><strong>WITNESSES</strong></p><br>
          <p>1. ________________________</p><br>
          <p>2. ________________________</p>
        </td>
        <td style="vertical-align:top; width:50%; padding:0 1em;">
          <p><strong>Partners</strong></p><br>
          ${partnerSigRows}
        </td>
      </tr>
    </table>
  `;
}

// ── CLIENT-SIDE VALIDATION ───────────────────────────────────────────────────

function validate() {
  clearFieldErrors();
  const errors = [];

  // Validate partners
  syncPartnersFromDOM();
  partners.forEach((p, i) => {
    if (!p.name) {
      errors.push({ step: 0, partnerIndex: i, field: 'name', label: `Partner ${i + 1} Name` });
    }
  });

  // At least one managing partner must be selected
  const hasManagingPartner = partners.some(p => p.isManagingPartner);
  if (!hasManagingPartner) {
    errors.push({ step: 0, label: 'Managing Partner (select at least one)' });
  }

  // At least one bank authorized partner must be selected
  const hasBankAuth = partners.some(p => p.isBankAuthorized);
  if (!hasBankAuth) {
    errors.push({ step: 0, label: 'Bank Authorization (select at least one)' });
  }

  // Business fields
  const businessRequired = [
    { id: 'businessName', label: 'Business Name' },
    { id: 'deedDate', label: 'Date of Deed' },
  ];

  for (const { id, label } of businessRequired) {
    if (!v(id)) {
      errors.push({ step: 1, fieldId: id, label });
      markFieldError(id, `${label} is required`);
    }
  }

  // Address sub-fields validation
  const addressRequired = [
    { id: 'addrDoorNo', label: 'Door No / Plot No' },
    { id: 'addrArea', label: 'Area / Locality' },
    { id: 'addrDistrict', label: 'District' },
    { id: 'addrState', label: 'State' },
    { id: 'addrPincode', label: 'Pincode' },
  ];

  for (const { id, label } of addressRequired) {
    if (!v(id)) {
      errors.push({ step: 1, fieldId: id, label });
      markFieldError(id, `${label} is required`);
    }
  }

  // Pincode format validation
  const pincodeVal = v('addrPincode');
  if (pincodeVal && !/^[0-9]{6}$/.test(pincodeVal)) {
    errors.push({ step: 1, fieldId: 'addrPincode', label: 'Pincode' });
    markFieldError('addrPincode', 'Pincode must be exactly 6 digits');
  }

  // Fixed duration date validation
  if (v('partnershipDuration') === 'fixed') {
    if (!v('partnershipStartDate')) {
      errors.push({ step: 1, fieldId: 'partnershipStartDate', label: 'Partnership Start Date' });
      markFieldError('partnershipStartDate', 'Start date is required for fixed duration');
    }
    if (!v('partnershipEndDate')) {
      errors.push({ step: 1, fieldId: 'partnershipEndDate', label: 'Partnership End Date' });
      markFieldError('partnershipEndDate', 'End date is required for fixed duration');
    }
    if (v('partnershipStartDate') && v('partnershipEndDate') && v('partnershipStartDate') >= v('partnershipEndDate')) {
      errors.push({ step: 1, fieldId: 'partnershipEndDate', label: 'Partnership End Date' });
      markFieldError('partnershipEndDate', 'End date must be after start date');
    }
  }

  // Capital contributions cross-check
  const capValues = partners.map((_, i) => parseFloat(v(`partnerCapital_${i}`)) || 0);
  const capTotal = capValues.reduce((s, c) => s + c, 0);
  const hasCapValues = capValues.some(c => c > 0);
  if (hasCapValues && Math.abs(capTotal - 100) > 0.01) {
    errors.push({ step: 0, label: 'Capital Contributions' });
    // Mark the last capital field
    const lastCapId = `partnerCapital_${partners.length - 1}`;
    markFieldError(lastCapId, 'Capital contributions must total 100%');
  }

  // Profit sharing cross-check
  const profValues = partners.map((_, i) => parseFloat(v(`partnerProfit_${i}`)) || 0);
  const profTotal = profValues.reduce((s, c) => s + c, 0);
  const hasProfValues = profValues.some(c => c > 0);
  if (hasProfValues && Math.abs(profTotal - 100) > 0.01) {
    errors.push({ step: 0, label: 'Profit Sharing' });
    const lastProfId = `partnerProfit_${partners.length - 1}`;
    markFieldError(lastProfId, 'Profit sharing must total 100%');
  }

  if (errors.length === 0) return null;

  // Navigate to the step of the first error
  const firstError = errors[0];
  const targetStep = firstError.step;
  if (targetStep !== undefined && targetStep !== currentStep) {
    goTo(targetStep);
  }

  // For partner errors, highlight the field in the partner card
  if (firstError.partnerIndex !== undefined) {
    setTimeout(() => {
      const card = document.querySelector(`.partner-card[data-partner-index="${firstError.partnerIndex}"]`);
      if (card) {
        const field = card.querySelector(`[data-field="${firstError.field}"]`);
        if (field) {
          const fieldWrap = field.closest('.field');
          if (fieldWrap) {
            fieldWrap.classList.add('error');
            if (!fieldWrap.querySelector('.field-error-msg')) {
              const errEl = document.createElement('div');
              errEl.className = 'field-error-msg';
              errEl.textContent = `${firstError.label} is required`;
              fieldWrap.appendChild(errEl);
            }
          }
          field.focus();
        }
      }
    }, 100);
  } else if (firstError.fieldId) {
    setTimeout(() => {
      const el = document.getElementById(firstError.fieldId);
      if (el) el.focus();
    }, 100);
  }

  const fieldList = errors.map(e => e.label).join(', ');
  return `Please fill required fields: ${fieldList}`;
}

function clearFieldErrors() {
  document.querySelectorAll('.field.error').forEach(f => f.classList.remove('error'));
  document.querySelectorAll('.field-error-msg').forEach(m => m.remove());
}

function markFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const fieldWrap = el.closest('.field');
  if (!fieldWrap) return;
  fieldWrap.classList.add('error');
  if (!fieldWrap.querySelector('.field-error-msg')) {
    const errEl = document.createElement('div');
    errEl.className = 'field-error-msg';
    errEl.textContent = msg;
    fieldWrap.appendChild(errEl);
  }
}

// ── DYNAMIC HINTS ─ Capital / Profit total feedback ──────────────────────────

function updateCapitalHint() {
  const hint = document.getElementById('capitalHint');
  if (!hint) return;
  const values = partners.map((_, i) => parseFloat(v(`partnerCapital_${i}`)) || 0);
  const total = values.reduce((s, c) => s + c, 0);
  const hasValues = values.some(c => c > 0);
  if (!hasValues) {
    hint.textContent = 'Capital contributions should total 100%';
    hint.style.color = '';
  } else if (Math.abs(total - 100) < 0.01) {
    hint.textContent = 'Total: 100% \u2713';
    hint.style.color = 'var(--success)';
  } else {
    hint.textContent = `Total: ${total.toFixed(2)}% \u2014 should be 100%`;
    hint.style.color = 'var(--error)';
  }
}

function updateProfitHint() {
  const hint = document.getElementById('profitHint');
  if (!hint) return;
  const values = partners.map((_, i) => parseFloat(v(`partnerProfit_${i}`)) || 0);
  const total = values.reduce((s, c) => s + c, 0);
  const hasValues = values.some(c => c > 0);
  if (!hasValues) {
    hint.textContent = 'Profit/loss sharing should total 100%';
    hint.style.color = '';
  } else if (Math.abs(total - 100) < 0.01) {
    hint.textContent = 'Total: 100% \u2713';
    hint.style.color = 'var(--success)';
  } else {
    hint.textContent = `Total: ${total.toFixed(2)}% \u2014 should be 100%`;
    hint.style.color = 'var(--error)';
  }
}

// ── PERSISTENCE (localStorage Draft) ─────────────────────────────────────────

function saveDraft() {
  syncPartnersFromDOM();

  const draft = { currentStep, currentDeedId, partners, data: {} };

  // Collect non-partner form fields
  document.querySelectorAll('.form-card input, .form-card select, .form-card textarea').forEach(el => {
    if (el.id) {
      draft.data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    }
  });

  const key = 'oneasy_draft';
  localStorage.setItem(key, JSON.stringify(draft));
}

function loadDraft() {
  const key = 'oneasy_draft';
  // Backward-compatible: migrate old key if present
  const oldKey = 'deedforge_draft';
  if (!localStorage.getItem(key) && localStorage.getItem(oldKey)) {
    localStorage.setItem(key, localStorage.getItem(oldKey));
    localStorage.removeItem(oldKey);
  }
  const saved = localStorage.getItem(key);
  if (!saved) {
    renderPartners();
    return;
  }
  try {
    const parsed = JSON.parse(saved);
    const { data } = parsed;
    if (parsed.currentDeedId) currentDeedId = parsed.currentDeedId;

    // Restore partners array
    if (parsed.partners && Array.isArray(parsed.partners) && parsed.partners.length >= MIN_PARTNERS) {
      partners = parsed.partners.map(p => ({
        name: p.name || '',
        relation: p.relation || 'S/O',
        fatherName: p.fatherName || '',
        age: p.age || '',
        address: p.address || '',
        isManagingPartner: !!p.isManagingPartner,
        isBankAuthorized: !!p.isBankAuthorized,
      }));
    }

    renderPartners();

    // Restore non-partner form fields (including capital/profit values)
    Object.keys(data).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!data[id];
      } else {
        el.value = data[id];
      }
    });

    // Apply "profit same as capital" state after values are restored
    const profitSameCheckbox = document.getElementById('profitSameAsCapital');
    if (profitSameCheckbox && profitSameCheckbox.checked) {
      syncProfitFromCapital();
      setProfitFieldsDisabled(true);
    }

    // Backward compat: if old draft had registeredAddress but no sub-fields, decompose
    if (data.registeredAddress && !data.addrDoorNo) {
      decomposeAddress(data.registeredAddress);
    }
    // Recompose the hidden field from whatever sub-fields are now present
    composeAddress();

    // Show objective output section if businessObjectives has content
    const objOutput = document.getElementById('objectiveOutput');
    const objTextarea = document.getElementById('businessObjectives');
    if (objOutput && objTextarea && objTextarea.value.trim()) {
      objOutput.classList.remove('hidden');
    }

    // Restore duration field visibility
    toggleDurationFields();

    updateBankOperationHint();
    updateCapitalHint();
    updateProfitHint();
    goTo(parsed.currentStep || 0);
  } catch (e) {
    console.error('Failed to load draft:', e);
    renderPartners();
  }
}

function resetForm() {
  // Cancel any pending auto-save from the previous deed
  clearTimeout(_serverSaveTimer);
  _serverSaveTimer = null;

  currentDeedId = null;
  partners = [
    { name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false },
    { name: '', relation: 'S/O', fatherName: '', age: '', address: '', isManagingPartner: false, isBankAuthorized: false },
  ];
  renderPartners();

  // Clear ALL form fields (business details, clauses, capital, profit, etc.)
  document.querySelectorAll('.form-card input, .form-card select, .form-card textarea').forEach(el => {
    // Skip the partner count input
    if (el.id === 'partnerCountInput') return;
    // Skip partner fields (already rendered empty above)
    if (el.closest('#partnersContainer')) return;

    if (el.type === 'checkbox') {
      el.checked = false;
    } else if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
    } else if (el.id === 'interestRate') {
      el.value = '12';
    } else if (el.id === 'noticePeriod') {
      el.value = '3';
    } else if (el.id === 'accountingYear') {
      el.value = '31st March';
    } else {
      el.value = '';
    }
  });

  // Re-enable profit fields (in case "same as capital" was checked)
  setProfitFieldsDisabled(false);

  // Hide the AI objective output section
  const objOutput = document.getElementById('objectiveOutput');
  if (objOutput) objOutput.classList.add('hidden');

  // Hide the AI name suggestions
  const nameSuggestContainer = document.getElementById('nameSuggestContainer');
  if (nameSuggestContainer) nameSuggestContainer.classList.add('hidden');
  const nameSuggestChips = document.getElementById('nameSuggestChips');
  if (nameSuggestChips) nameSuggestChips.innerHTML = '';

  // Reset duration fields (select already reset to index 0 = "at_will" above)
  toggleDurationFields();

  // Clear any field-level error styling
  document.querySelectorAll('.field.error').forEach(f => {
    f.classList.remove('error');
    const errMsg = f.querySelector('.field-error-msg');
    if (errMsg) errMsg.remove();
  });

  updatePartnerCountInput();
  updateCapitalHint();
  updateProfitHint();
  goTo(0);
  saveDraft();
  switchPage('generator');
  fetchSidebarDrafts();
}

// ── DEBOUNCED SERVER SAVE ────────────────────────────────────────────────────

let _serverSaveTimer = null;
let _sidebarRefreshTimer = null;

function debouncedSidebarRefresh() {
  clearTimeout(_sidebarRefreshTimer);
  _sidebarRefreshTimer = setTimeout(() => fetchSidebarDrafts(), 3000);
}

function debouncedServerSave() {
  clearTimeout(_serverSaveTimer);
  _serverSaveTimer = setTimeout(async () => {
    const payload = getPayload();
    const businessName = payload.businessName || 'Untitled';

    // Skip if no meaningful data entered yet
    const hasPartnerData = partners.some(p => p.name);
    if (!currentDeedId && businessName === 'Untitled' && !hasPartnerData) return;

    try {
      const saved = await dbSaveDeed({
        id: currentDeedId,
        business_name: businessName,
        partner1_name: partners[0]?.name || '',
        partner2_name: partners[1]?.name || '',
        payload
      });
      if (!currentDeedId) {
        currentDeedId = saved.id;
        saveDraft();
      }
      debouncedSidebarRefresh();
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }, 800);
}

// ── SIDEBAR DRAFTS ───────────────────────────────────────────────────────────

async function fetchSidebarDrafts() {
  const container = document.getElementById('draftList');
  if (!container) return;

  container.innerHTML = '<p class="draft-empty">Loading\u2026</p>';

  try {
    const data = await dbGetDeeds();
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="draft-empty">No saved deeds yet</p>';
      return;
    }

    const recent = data.slice(0, 8);
    container.innerHTML = recent.map(d => {
      const name = escapeHTML(d.business_name || 'Untitled');
      const isActive = d.id === currentDeedId ? ' active' : '';
      const safeId = escapeHTML(d.id);
      return `
        <div class="draft-item${isActive}" data-id="${safeId}" title="${name}">
          <span class="draft-item-text">${name}</span>
          <div class="draft-item-actions">
            <button class="draft-action-btn draft-edit-btn" data-edit-id="${safeId}" title="Edit deed" aria-label="Edit ${name}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="draft-action-btn draft-delete-btn" data-delete-id="${safeId}" title="Delete deed" aria-label="Delete ${name}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind click handlers
    container.querySelectorAll('.draft-item').forEach(item => {
      // Click on the item text area loads for editing
      const textArea = item.querySelector('.draft-item-text');
      if (textArea) {
        textArea.onclick = (e) => {
          e.stopPropagation();
          editDeed(item.dataset.id);
        };
      }

      // Edit button
      const editBtn = item.querySelector('.draft-edit-btn');
      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          editDeed(editBtn.dataset.editId);
        };
      }

      // Delete button
      const deleteBtn = item.querySelector('.draft-delete-btn');
      if (deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          deleteDeed(deleteBtn.dataset.deleteId);
        };
      }
    });
  } catch (e) {
    console.error('Failed to fetch sidebar drafts:', e);
    container.innerHTML = '<p class="draft-empty">Unable to load drafts</p>';
  }
}

// ── PAYLOAD ──────────────────────────────────────────────────────────────────

function getPayload() {
  syncPartnersFromDOM();

  // Ensure the combined address is up-to-date from sub-fields
  composeAddress();

  const p = {};

  // Collect non-partner form fields (business, clauses, etc.)
  document.querySelectorAll('.form-card input, .form-card select, .form-card textarea').forEach(el => {
    if (el.id) p[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });

  // Add partners array
  p.partners = partners.map((partner, i) => ({
    name: partner.name,
    relation: partner.relation,
    fatherName: partner.fatherName,
    age: partner.age,
    address: partner.address,
    capital: v(`partnerCapital_${i}`) || '',
    profit: v(`partnerProfit_${i}`) || '',
    isManagingPartner: partner.isManagingPartner || false,
    isBankAuthorized: partner.isBankAuthorized || false,
  }));

  // Backward compatibility: also set partner1*/partner2* for DB columns
  if (partners[0]) {
    p.partner1Name = partners[0].name;
    p.partner1Relation = partners[0].relation;
    p.partner1FatherName = partners[0].fatherName;
    p.partner1Age = partners[0].age;
    p.partner1Address = partners[0].address;
    p.partner1Capital = v('partnerCapital_0') || '';
    p.partner1Profit = v('partnerProfit_0') || '';
  }
  if (partners[1]) {
    p.partner2Name = partners[1].name;
    p.partner2Relation = partners[1].relation;
    p.partner2FatherName = partners[1].fatherName;
    p.partner2Age = partners[1].age;
    p.partner2Address = partners[1].address;
    p.partner2Capital = v('partnerCapital_1') || '';
    p.partner2Profit = v('partnerProfit_1') || '';
  }

  return p;
}

// ── GENERATE ─────────────────────────────────────────────────────────────────

async function generate() {
  const err = validate();
  if (err) return showAlert('error', err);

  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) generateBtn.disabled = true;

  const payload = getPayload();
  const businessName = payload.businessName || 'Untitled';

  // Save to DB first
  try {
    const saved = await dbSaveDeed({
      id: currentDeedId,
      business_name: businessName,
      partner1_name: partners[0]?.name || '',
      partner2_name: partners[1]?.name || '',
      payload
    });
    currentDeedId = saved.id;
    await fetchSidebarDrafts();
  } catch (e) {
    console.error('Save failed:', e);
  }

  // Generate DOCX via backend
  try {
    const generatePayload = { ...payload, _deedId: currentDeedId };
    const token = await getAccessToken();
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(generatePayload)
    });

    if (!res.ok) {
      let errMsg = 'Generation failed';
      try {
        const errBody = await res.json();
        if (errBody.details && Array.isArray(errBody.details)) {
          errMsg = errBody.details.join('; ');
        } else if (errBody.error) {
          errMsg = errBody.error;
        }
      } catch (_) { /* response wasn't JSON */ }
      throw new Error(errMsg);
    }

    // Extract filename from Content-Disposition
    const disposition = res.headers.get('Content-Disposition') || '';
    let filename = `Partnership_Deed_${businessName}.docx`;
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match) filename = match[1];

    const blob = await res.blob();

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);

    showAlert('success', 'Document generated and downloaded!');

    // Show PDF button after successful generation
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.classList.remove('hidden');

    fetchSidebarDrafts();
    if (currentPage === 'history') fetchDeeds();
  } catch (e) {
    console.error('Generate error:', e);
    showAlert('error', e.message);
  } finally {
    if (generateBtn) generateBtn.disabled = false;
  }
}

// ── HISTORY ──────────────────────────────────────────────────────────────────

function formatCardDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function fetchDeeds() {
  const gridEl = document.getElementById('deedGrid');
  const emptyEl = document.getElementById('gridEmpty');
  if (!gridEl || !emptyEl) return;

  emptyEl.classList.add('hidden');
  gridEl.innerHTML = '<p class="grid-empty">Loading deed history\u2026</p>';

  try {
    const data = await dbGetDeeds();

    if (!data || data.length === 0) {
      gridEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    gridEl.innerHTML = data.map(d => {
      const p = d.payload || {};
      const bizName = escapeHTML(d.business_name || 'Untitled');

      // Build partner names string from partners array or legacy fields
      let partnerNames;
      if (p.partners && Array.isArray(p.partners) && p.partners.length > 0) {
        partnerNames = p.partners
          .map(pt => escapeHTML(pt.name || 'N/A'))
          .join(' & ');
      } else {
        const p1 = escapeHTML(d.partner1_name || p.partner1Name || 'N/A');
        const p2 = escapeHTML(d.partner2_name || p.partner2Name || 'N/A');
        partnerNames = `${p1} & ${p2}`;
      }

      const dateStr = escapeHTML(formatCardDate(d.created_at));
      const safeId = escapeHTML(d.id);
      const hasDoc = !!d.doc_url;
      const versionCount = d._versionCount || 0;
      const versionBadge = versionCount > 1 ? `<span class="deed-card-versions">${versionCount} versions</span>` : '';

      return `
        <div class="deed-card" data-deed-id="${safeId}">
          <div class="deed-card-title">M/s. ${bizName}</div>
          <div class="deed-card-meta">${dateStr}${versionBadge}</div>
          <div class="deed-card-partners">${partnerNames}</div>
          <div class="deed-card-actions">
            ${hasDoc ? '<button class="btn btn-download" data-action="download">Download</button>' : ''}
            <button class="btn btn-gen" data-action="regenerate" style="padding: var(--space-2) var(--space-3); font-size: var(--text-xs);">Re-generate</button>
            <button class="btn btn-edit" data-action="edit">Edit</button>
            <button class="btn btn-dup" data-action="duplicate">Duplicate</button>
            <button class="btn btn-back" data-action="view">Details</button>
            <button class="btn btn-del" data-action="delete">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Event delegation on the grid
    gridEl.onclick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const card = btn.closest('.deed-card');
      if (!card) return;
      const id = card.dataset.deedId;
      const action = btn.dataset.action;
      if (action === 'download')   downloadStoredDoc(id);
      if (action === 'regenerate') regenerateDeed(id);
      if (action === 'edit')       editDeed(id);
      if (action === 'duplicate')  duplicateDeed(id);
      if (action === 'view')       viewStored(id);
      if (action === 'delete')     deleteDeed(id);
    };
  } catch (e) {
    console.error('fetchDeeds error:', e);
    gridEl.innerHTML = '<p class="grid-empty">Failed to load history. Check console for details.</p>';
  }
}

// ── HELPERS: Restore partners from payload ──────────────────────────────────

function restorePartnersFromPayload(payload) {
  if (payload.partners && Array.isArray(payload.partners) && payload.partners.length >= MIN_PARTNERS) {
    partners = payload.partners.map(p => ({
      name: p.name || '',
      relation: p.relation || 'S/O',
      fatherName: p.fatherName || '',
      age: p.age || '',
      address: p.address || '',
      isManagingPartner: !!p.isManagingPartner,
      isBankAuthorized: !!p.isBankAuthorized,
    }));
  } else {
    // Legacy: reconstruct from partner1*/partner2* fields
    partners = [
      {
        name: payload.partner1Name || '',
        relation: payload.partner1Relation || 'S/O',
        fatherName: payload.partner1FatherName || '',
        age: payload.partner1Age || '',
        address: payload.partner1Address || '',
        isManagingPartner: false,
        isBankAuthorized: false,
      },
      {
        name: payload.partner2Name || '',
        relation: payload.partner2Relation || 'S/O',
        fatherName: payload.partner2FatherName || '',
        age: payload.partner2Age || '',
        address: payload.partner2Address || '',
        isManagingPartner: false,
        isBankAuthorized: false,
      },
    ];
  }
  renderPartners();

  // Restore capital/profit values
  partners.forEach((_, i) => {
    const capEl = document.getElementById(`partnerCapital_${i}`);
    const profEl = document.getElementById(`partnerProfit_${i}`);
    if (payload.partners && payload.partners[i]) {
      if (capEl) capEl.value = payload.partners[i].capital || '';
      if (profEl) profEl.value = payload.partners[i].profit || '';
    } else if (i === 0) {
      if (capEl) capEl.value = payload.partner1Capital || '';
      if (profEl) profEl.value = payload.partner1Profit || '';
    } else if (i === 1) {
      if (capEl) capEl.value = payload.partner2Capital || '';
      if (profEl) profEl.value = payload.partner2Profit || '';
    }
  });
}

// ── DEED ACTIONS ─────────────────────────────────────────────────────────────

async function regenerateDeed(id) {
  try {
    const d = await dbGetDeedById(id);
    if (!d) return;
    currentDeedId = d.id;

    restorePartnersFromPayload(d.payload || {});

    // Restore non-partner fields
    Object.keys(d.payload || {}).forEach(key => {
      if (key === 'partners') return;
      const el = document.getElementById(key);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!d.payload[key];
      } else {
        el.value = d.payload[key];
      }
    });

    // Restore profit-same-as-capital state
    const psCb = document.getElementById('profitSameAsCapital');
    if (psCb && psCb.checked) {
      syncProfitFromCapital();
      setProfitFieldsDisabled(true);
    }

    // Backward compat: decompose old single-field address into sub-fields
    const rPayload = d.payload || {};
    if (rPayload.registeredAddress && !rPayload.addrDoorNo) {
      decomposeAddress(rPayload.registeredAddress);
    }
    composeAddress();

    // Show objective output if it has content
    const objOut = document.getElementById('objectiveOutput');
    const objTa = document.getElementById('businessObjectives');
    if (objOut && objTa && objTa.value.trim()) objOut.classList.remove('hidden');

    // Restore duration field visibility
    toggleDurationFields();

    updateCapitalHint();
    updateProfitHint();
    switchPage('generator');
    goTo(3); // Go to review step
  } catch (e) {
    console.error('Failed to load deed:', e);
  }
}

async function editDeed(id) {
  try {
    const d = await dbGetDeedById(id);
    if (!d) return;
    currentDeedId = d.id;

    restorePartnersFromPayload(d.payload || {});

    // Restore non-partner fields
    Object.keys(d.payload || {}).forEach(key => {
      if (key === 'partners') return;
      const el = document.getElementById(key);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!d.payload[key];
      } else {
        el.value = d.payload[key];
      }
    });

    // Restore profit-same-as-capital state
    const psCb = document.getElementById('profitSameAsCapital');
    if (psCb && psCb.checked) {
      syncProfitFromCapital();
      setProfitFieldsDisabled(true);
    }

    // Backward compat: decompose old single-field address into sub-fields
    const ePayload = d.payload || {};
    if (ePayload.registeredAddress && !ePayload.addrDoorNo) {
      decomposeAddress(ePayload.registeredAddress);
    }
    composeAddress();

    // Show objective output if it has content
    const objOut = document.getElementById('objectiveOutput');
    const objTa = document.getElementById('businessObjectives');
    if (objOut && objTa && objTa.value.trim()) objOut.classList.remove('hidden');

    // Restore duration field visibility
    toggleDurationFields();

    updateCapitalHint();
    updateProfitHint();
    switchPage('generator');
    goTo(0);
    saveDraft();
    fetchSidebarDrafts();
  } catch (e) {
    console.error('Failed to load deed for editing:', e);
  }
}

async function duplicateDeed(id) {
  try {
    const d = await dbGetDeedById(id);
    if (!d) return;

    const payload = { ...(d.payload || {}) };
    const newName = `${d.business_name || 'Untitled'} (Copy)`;

    const saved = await dbSaveDeed({
      id: null,
      business_name: newName,
      partner1_name: d.partner1_name || payload.partner1Name || '',
      partner2_name: d.partner2_name || payload.partner2Name || '',
      payload,
    });

    currentDeedId = saved.id;

    restorePartnersFromPayload(payload);

    // Restore non-partner fields
    Object.keys(payload).forEach(key => {
      if (key === 'partners') return;
      const el = document.getElementById(key);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!payload[key];
      } else {
        el.value = payload[key];
      }
    });

    // Update business name field to include "(Copy)"
    const nameEl = document.getElementById('businessName');
    if (nameEl && nameEl.value === d.business_name) {
      nameEl.value = newName;
    }

    // Restore profit-same-as-capital state
    const psCb = document.getElementById('profitSameAsCapital');
    if (psCb && psCb.checked) {
      syncProfitFromCapital();
      setProfitFieldsDisabled(true);
    }

    // Backward compat: decompose old single-field address into sub-fields
    if (payload.registeredAddress && !payload.addrDoorNo) {
      decomposeAddress(payload.registeredAddress);
    }
    composeAddress();

    // Show objective output if it has content
    const objOut = document.getElementById('objectiveOutput');
    const objTa = document.getElementById('businessObjectives');
    if (objOut && objTa && objTa.value.trim()) objOut.classList.remove('hidden');

    // Restore duration field visibility
    toggleDurationFields();

    updateCapitalHint();
    updateProfitHint();
    const wasOnHistory = currentPage === 'history';
    switchPage('generator');
    goTo(0);
    saveDraft();
    fetchSidebarDrafts();
    if (wasOnHistory) fetchDeeds();
    showAlert('success', `Duplicated deed for "${d.business_name || 'Untitled'}". Edit and generate.`);
  } catch (e) {
    console.error('Failed to duplicate deed:', e);
    showAlert('error', 'Failed to duplicate deed.');
  }
}

async function viewStored(id) {
  try {
    const d = await dbGetDeedById(id);
    if (!d) return;

    const p = d.payload || {};
    const details = [];

    details.push(['Business Name', `M/s. ${d.business_name || 'N/A'}`]);

    // Show partners — prefer child table data (_partners), fall back to payload
    const dbPartners = d._partners || [];
    const storedPartners = p.partners || [];
    if (dbPartners.length > 0) {
      dbPartners.forEach((pt, i) => {
        const roles = [];
        if (pt.is_managing_partner) roles.push('Managing');
        if (pt.is_bank_authorized) roles.push('Bank Auth');
        const roleStr = roles.length > 0 ? ` [${roles.join(', ')}]` : '';
        details.push([`Partner ${i + 1}`, (pt.name || 'N/A') + roleStr]);
      });
    } else if (storedPartners.length > 0) {
      storedPartners.forEach((pt, i) => {
        const roles = [];
        if (pt.isManagingPartner) roles.push('Managing');
        if (pt.isBankAuthorized) roles.push('Bank Auth');
        const roleStr = roles.length > 0 ? ` [${roles.join(', ')}]` : '';
        details.push([`Partner ${i + 1}`, (pt.name || 'N/A') + roleStr]);
      });
    } else {
      details.push(['Partner 1', d.partner1_name || p.partner1Name || 'N/A']);
      details.push(['Partner 2', d.partner2_name || p.partner2Name || 'N/A']);
    }

    details.push(['Date of Deed', p.deedDate || 'N/A']);

    // Duration
    if (p.partnershipDuration === 'fixed') {
      details.push(['Duration', `Fixed: ${p.partnershipStartDate || '—'} to ${p.partnershipEndDate || '—'}`]);
    } else {
      details.push(['Duration', 'At Will of the Partners']);
    }

    details.push(['Nature', p.natureOfBusiness || 'N/A']);

    // Address — prefer child table data, fall back to payload
    const dbAddr = d._address;
    if (dbAddr && dbAddr.full_address) {
      details.push(['Registered Address', dbAddr.full_address]);
    } else {
      details.push(['Registered Address', p.registeredAddress || 'N/A']);
    }

    // Capital & Profit — prefer child table, fall back to payload
    if (dbPartners.length > 0) {
      const capStr = dbPartners.map((pt, i) => `P${i+1}: ${pt.capital_pct ?? 0}%`).join(' / ');
      const profStr = dbPartners.map((pt, i) => `P${i+1}: ${pt.profit_pct ?? 0}%`).join(' / ');
      details.push(['Capital', capStr]);
      details.push(['Profit', profStr]);
    } else if (storedPartners.length > 0) {
      const capStr = storedPartners.map((pt, i) => `P${i+1}: ${pt.capital || 0}%`).join(' / ');
      const profStr = storedPartners.map((pt, i) => `P${i+1}: ${pt.profit || 0}%`).join(' / ');
      details.push(['Capital', capStr]);
      details.push(['Profit', profStr]);
    } else {
      details.push(['Capital (P1/P2)', `${p.partner1Capital || 0}% / ${p.partner2Capital || 0}%`]);
      details.push(['Profit (P1/P2)', `${p.partner1Profit || 0}% / ${p.partner2Profit || 0}%`]);
    }

    details.push(['Bank Operation', p.bankOperation === 'either' ? 'Either' : 'Jointly']);
    details.push(['Interest Rate', `${p.interestRate || '12'}% p.a.`]);
    details.push(['Notice Period', `${p.noticePeriod || '3'} months`]);

    // Build modal HTML
    let bodyHtml = details.map(([label, value]) =>
      `<div class="modal-row">
        <span class="modal-row-label">${escapeHTML(label)}</span>
        <span class="modal-row-value">${escapeHTML(value)}</span>
      </div>`
    ).join('');

    // Fetch document versions and render version history section
    try {
      const versions = await dbGetDocumentVersions(id);
      if (versions.length > 0) {
        bodyHtml += `<div class="modal-versions">
          <div class="modal-versions-title">Document Versions (${versions.length})</div>
          <div class="modal-versions-list">
            ${versions.map(ver => {
              const sizeKB = ver.file_size ? `${Math.round(ver.file_size / 1024)} KB` : '';
              const genDate = ver.generated_at ? formatCardDate(ver.generated_at) : '';
              return `<div class="modal-version-row">
                <span class="modal-version-label">v${ver.version}</span>
                <span class="modal-version-meta">${escapeHTML(genDate)}${sizeKB ? ` &middot; ${escapeHTML(sizeKB)}` : ''}</span>
                <button class="btn btn-download modal-version-dl" data-storage-path="${escapeHTML(ver.storage_path)}" data-file-name="${escapeHTML(ver.file_name)}">Download</button>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }
    } catch (verErr) {
      console.warn('Failed to fetch document versions:', verErr);
    }

    document.getElementById('modalTitle').textContent = `M/s. ${d.business_name || 'Deed Details'}`;
    document.getElementById('modalBody').innerHTML = bodyHtml;

    // Bind version download buttons
    document.querySelectorAll('.modal-version-dl').forEach(btn => {
      btn.onclick = async () => {
        const storagePath = btn.dataset.storagePath;
        const fileName = btn.dataset.fileName;
        try {
          const { data: blob, error } = await supabase.storage
            .from('deed-docs')
            .download(storagePath);
          if (error) throw error;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName || storagePath.split('/').pop();
          a.classList.add('hidden');
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
        } catch (dlErr) {
          console.error('Version download failed:', dlErr);
          showAlert('error', 'Failed to download this version.');
        }
      };
    });

    // Bind modal footer buttons
    document.getElementById('modalRegenBtn').onclick = () => { closeModal(); regenerateDeed(id); };
    document.getElementById('modalEditBtn').onclick = () => { closeModal(); editDeed(id); };
    document.getElementById('modalDeleteBtn').onclick = () => { closeModal(); deleteDeed(id); };
    document.getElementById('modalDupBtn').onclick = () => { closeModal(); duplicateDeed(id); };
    document.getElementById('modalDownloadBtn').onclick = () => { downloadStoredDoc(id); };

    // Show/hide download button (latest version)
    if (d.doc_url) {
      document.getElementById('modalDownloadBtn').classList.remove('hidden');
    } else {
      document.getElementById('modalDownloadBtn').classList.add('hidden');
    }

    openModal();
  } catch (e) {
    console.error('Failed to load deed details:', e);
  }
}

async function deleteDeed(id) {
  if (!confirm('Delete this partnership deed?')) return;
  try {
    await dbDeleteDeed(id);
    const wasActive = currentDeedId === id;
    if (wasActive) {
      // Reset form since the active deed was deleted
      resetForm();
    }
    fetchDeeds();
    fetchSidebarDrafts();
    showAlert('success', 'Deed deleted.');
  } catch (e) {
    console.error('Failed to delete deed:', e);
    showAlert('error', 'Failed to delete deed.');
  }
}

async function downloadStoredDoc(id) {
  try {
    const d = await dbGetDeedById(id);
    if (!d || !d.doc_url) {
      showAlert('error', 'No document found. Please re-generate it first.');
      return;
    }

    const { data: blob, error } = await supabase.storage
      .from('deed-docs')
      .download(d.doc_url);

    if (error) throw error;

    const filename = d.doc_url.split('/').pop() || `Partnership_Deed_${d.business_name}.docx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.classList.add('hidden');
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (e) {
    console.error('Download failed:', e);
    showAlert('error', 'Failed to download document. Try re-generating.');
  }
}

// ── PRINT / PDF VIEW ─────────────────────────────────────────────────────────

function openPrintView() {
  syncPartnersFromDOM();
  const d = getPayload();
  const biz = escapeHTML(d.businessName || '_______________');
  const deedDate = fmtDate(d.deedDate) || 'the _______ day of _______ 20___';
  const addr = escapeHTML(d.registeredAddress || '_______________');
  const nature = escapeHTML(d.natureOfBusiness || '_______________');
  const objectives = escapeHTML(d.businessObjectives || '_______________');
  const interestRate = escapeHTML(d.interestRate || '12');
  const noticePeriod = escapeHTML(d.noticePeriod || '3');
  const accountingYear = escapeHTML(d.accountingYear || '31st March');
  const bankOp = d.bankOperation || 'jointly';
  const additionalPoints = d.additionalPoints || '';

  // Build partner intro paragraphs (matching DOCX format)
  const partnerIntros = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const rel = escapeHTML(p.relation || 'S/O');
    const father = escapeHTML(p.fatherName || '_______________');
    const age = escapeHTML(String(p.age || '___'));
    const address = escapeHTML(p.address || '_______________');
    const label = getPartyLabel(i);
    let html = `<p class="body-text"><strong>${name}</strong> ${rel} <strong>${father}</strong> Aged <strong>${age}</strong> Years, residing at ${address}.</p>`;
    html += `<p class="body-text">(Hereinafter called as the <strong><em>"${label} Party"</em></strong>)</p>`;
    if (i < partners.length - 1) {
      html += `<p class="and-separator"><strong>AND</strong></p>`;
    }
    return html;
  }).join('\n');

  // Capital contribution bullet list (matching DOCX format)
  const capitalBullets = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const label = getPartyLabel(i);
    const cap = escapeHTML(d[`partnerCapital_${i}`] || v(`partnerCapital_${i}`) || '___');
    return `<li><strong>${label} Party (${name}):</strong> ${cap}%</li>`;
  }).join('\n');

  // Profit sharing bullet list (matching DOCX format)
  const profitBullets = partners.map((p, i) => {
    const name = escapeHTML(p.name || '_______________');
    const label = getPartyLabel(i);
    const prof = escapeHTML(d[`partnerProfit_${i}`] || v(`partnerProfit_${i}`) || '___');
    return `<li><strong>${name}</strong> (${label} Party) - ${prof}%</li>`;
  }).join('\n');

  // Duration text
  let durationText = 'The duration of the firm shall be at WILL of the partners.';
  if (d.partnershipDuration === 'fixed' && d.partnershipStartDate && d.partnershipEndDate) {
    durationText = `The duration of the partnership shall be for a fixed period commencing from <strong>${fmtDate(d.partnershipStartDate)}</strong> and ending on <strong>${fmtDate(d.partnershipEndDate)}</strong>, unless terminated earlier by mutual consent of all the partners or by operation of law.`;
  }

  // Managing Partners (matching DOCX Clause 6 structure)
  const managingPartnersList = partners
    .map((p, i) => ({ ...p, _index: i }))
    .filter(p => p.isManagingPartner);
  const effectiveManagingPartners = managingPartnersList.length > 0
    ? managingPartnersList
    : partners.map((p, i) => ({ ...p, _index: i }));

  const managingPartnersText = effectiveManagingPartners.map((p, i) => {
    const sep = i > 0 ? ' &amp; ' : '';
    return `${sep}<strong>${escapeHTML(p.name || 'N/A')}</strong> (${getPartyLabel(p._index)} Party)`;
  }).join('');

  const pluralMgr = effectiveManagingPartners.length > 1;
  const managingPowers = [
    'To manage the business of the partnership firm with a power to appoint remuneration, etc. They shall also have the power to dispense with the service of such personnel that are not required.',
    'To negotiate any business transactions and enter into agreements on behalf of the firm and to enter into all/any contracts and sub-contracts on either way. To enter to the sale and purchase agreements relating to the objective of the business.',
    'To enter into correspondence with government departments, quasi-govt departments, public and private organizations, individuals, etc regarding the partnership business.',
    'To incur all expenses necessary for the conduct of the business.',
    'To borrow moneys against credit of partnership, if necessary by hypothecating or creating a charge upon the assets of the partnership.',
    'To be in custody of all account books, documents, negotiable instruments and all other documents pertaining to the business.',
    'To look after the proper upkeep of books of accounts required for the business and to supervise the same at regular intervals.',
    'To open bank account/accounts in the name of the partnership firm.',
    'To put all the monies, cheques etc., which are not immediately required for the conduct of the business into the bank account, opened for the Partnership business.',
    'To do all other acts and things that are necessary for carrying on the business.',
  ];
  const managingPowersList = managingPowers.map(p => `<li>${p}</li>`).join('\n');

  // Banking (matching DOCX structure)
  const bankAuthPartners = partners
    .map((p, i) => ({ ...p, _index: i }))
    .filter(p => p.isBankAuthorized);

  // Connector: "and" for jointly (both must sign), "or" for either (any one can sign)
  const bankConnector = bankOp === 'either' ? ' or ' : ' and ';

  let bankingText = '';
  if (bankAuthPartners.length > 0) {
    const bankNames = bankAuthPartners.map((p, i) => {
      let sep = '';
      if (i > 0 && i < bankAuthPartners.length - 1) sep = ', ';
      else if (i === bankAuthPartners.length - 1 && bankAuthPartners.length > 1) sep = bankConnector;
      return `${sep}<strong>${escapeHTML(p.name || 'N/A')}</strong> (${getPartyLabel(p._index)} Party)`;
    }).join('');
    if (bankOp === 'either') {
      bankingText = `The firm shall maintain one or more banking accounts (e.g., current accounts, overdrafts, cash credit, etc.) as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, ${bankAuthPartners.length === 1 ? 'who is' : 'either of whom is'} independently authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm.`;
    } else {
      bankingText = `The firm shall maintain one or more banking accounts (e.g., current accounts, overdrafts, cash credit, etc.) as may be decided by the partners from time to time. The said bank accounts shall be operated by ${bankNames}, who ${bankAuthPartners.length === 1 ? 'is' : 'are jointly'} authorized for all bank-related transactions including the issuance and authorization of cheques, demand drafts, and any other banking instruments on behalf of the firm. No transaction shall be deemed valid unless signed by all the above-named authorized partners.`;
    }
  } else if (bankOp === 'jointly') {
    const jointNames = partners.map((p, i) => {
      let sep = '';
      if (i > 0 && i < partners.length - 1) sep = ', ';
      else if (i === partners.length - 1 && partners.length > 1) sep = ' and ';
      return `${sep}<strong>${escapeHTML(p.name || 'N/A')}</strong> (${getPartyLabel(i)} Party)`;
    }).join('');
    bankingText = `The firm shall maintain one or more banking accounts (e.g., current accounts, overdrafts, cash credit, etc.) as may be decided by the partners from time to time. The said bank accounts shall be operated jointly by ${jointNames}. The signatures of all partners shall be jointly required for the issuance and authorization of cheques or any other banking transactions. No transaction shall be deemed valid unless signed by all partners.`;
  } else {
    bankingText = 'The firm shall maintain one or more banking accounts as may be decided by the partners from time to time. The said bank accounts may be operated by any partner independently.';
  }

  // Additional terms clause number pivot
  const nextClause = additionalPoints.trim() ? 8 : 7;

  // Signature table (matching DOCX: witnesses on left, partners on right)
  const partnerSigRows = partners.map((p, i) => `
    <p>${i + 1}. ${escapeHTML(p.name || '________________________')}</p>
    <p style="margin-left:1em; margin-top:0;">(${getPartyLabel(i)} Party)</p>
  `).join('');

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Partnership Deed - M/s. ${biz}</title>
<style>
  @media print {
    @page { margin: 2cm; size: A4; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.8; color: #000; max-width: 210mm; margin: 0 auto; padding: 2cm; }
  h1 { text-align: center; font-size: 16pt; margin-bottom: 0.5em; text-decoration: underline; text-transform: uppercase; font-weight: bold; }
  .clause-head { margin: 1.2em 0 0.3em; font-weight: bold; font-size: 11pt; }
  .body-text { margin: 0.3em 0; text-align: justify; }
  .body-indent { margin: 0.3em 0; margin-left: 2em; text-align: justify; }
  .and-separator { text-align: center; margin: 0.8em 0; }
  .deed-witness { text-align: center; font-weight: bold; font-size: 12pt; margin: 1.5em 0 1em; }
  .powers-list { margin: 0.5em 0 0.5em 2em; }
  .powers-list li { margin-bottom: 0.4em; }
  .capital-list, .profit-list { margin: 0.5em 0 0.5em 2em; list-style-type: disc; }
  .capital-list li, .profit-list li { margin-bottom: 0.3em; }
  .sig-table { width: 100%; margin-top: 4em; border-collapse: collapse; }
  .sig-table td { vertical-align: top; width: 50%; padding: 0 1em; }
  .sig-table p { margin: 0.2em 0; }
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: #f0b929; padding: 0.75rem 1.5rem; display: flex; align-items: center; justify-content: space-between; z-index: 9999; font-family: sans-serif; font-size: 14px; }
  .print-bar button { background: #f0b929; color: #0f172a; border: none; padding: 0.5rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; }
  .print-bar button:hover { background: #ca8a04; }
  .print-body { margin-top: 40px; }
</style>
</head><body>
<div class="print-bar no-print">
  <span>Print Preview \u2014 Use Ctrl+P or click the button to save as PDF</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div class="print-body">

<h1>Partnership Deed</h1>

<p class="body-text">This Deed of Partnership is made and executed on <strong>${deedDate}</strong>, by and between:</p>

${partnerIntros}

<br>

<p class="body-text"><strong>WHEREAS</strong> the parties here have mutually decided to start a partnership business of <strong>${nature}</strong> under the name and style as <strong>M/s. ${biz}</strong>.</p>

<p class="body-text"><strong>AND WHEREAS</strong> it is felt expedient to reduce the terms and conditions agreed upon by the above said continuing partners into writing to avoid any misunderstandings amongst the partners at a future date.</p>

<br>

<p class="deed-witness">NOW THIS DEED OF PARTNERSHIP WITNESSETH AS FOLLOWS:</p>

<p class="clause-head">1. Name and Commencement</p>
<p class="body-text">The partnership business shall be carried on under the name and style as <strong>M/s. ${biz}</strong>. The partnership firm shall come into existence with effect from <strong>${deedDate}</strong>.</p>

<p class="clause-head">2. Duration</p>
<p class="body-text">${durationText}</p>

<p class="clause-head">3. Principal Place of Business</p>
<p class="body-text">The Principal place of business of the firm shall be at <strong>${addr}</strong>.</p>

<p class="clause-head">4. Objectives of Partnership</p>
<p class="body-text">The objective of partnership is to carry on the following business:</p>
<p class="body-indent">${objectives}</p>

<p class="clause-head">5. Capital Contribution of the Partners</p>
<p class="body-text">The total capital contribution of the partners in the firm shall be in the following proportions:</p>
<ul class="capital-list">
${capitalBullets}
</ul>

<p class="clause-head">6. Managing Partners</p>
<p class="body-text">The parties ${managingPartnersText} shall be the managing partner${pluralMgr ? 's' : ''} and ${pluralMgr ? 'are' : 'is'} authorized and empowered to do the following acts, deeds and things on behalf of the firm:</p>
<ol class="powers-list">
${managingPowersList}
</ol>
<p class="body-text">The managing partners are empowered to borrow money as and when found necessary for the business from any nationalized or schedule bank/banks or any other financial institutions from time to time and execute necessary actions at all the times.</p>

${additionalPoints.trim() ? `
<p class="clause-head">7. Additional Terms</p>
<p class="body-text">${escapeHTML(additionalPoints)}</p>
` : ''}

<p class="clause-head">${nextClause}. Banking</p>
<p class="body-text">${bankingText}</p>

<p class="clause-head">${nextClause + 1}. Authorized Signatory</p>
<p class="body-text">The partners, upon mutual consent of all the partners of this partnership deed appoint any another individual as the authorized signatory for entering into the agreements relating to sale and purchase of the land or/and building.</p>

<p class="clause-head">${nextClause + 2}. Working Partners and Remuneration</p>
<p class="body-text">That all the partners shall be working partners of the firm and shall be bound to devote full time and attention to the partnership business and shall be actively engaged in conducting the affairs of the firm and therefore it has been agreed to pay salary/remuneration for the services rendered as per the provisions under section 40(b) of the Income Tax Act, 1961.</p>
<p class="body-text">For the purpose of above calculation of the remuneration shall be on the basis of profit as shown by the books and computed as provided in section 20 to 44D of chapter IV of the Income Tax Act, 1961 as increased by the aggregate of remuneration paid or payable to the partners of the firm if such remuneration has been deducted while computing the net profit.</p>

<p class="clause-head">${nextClause + 3}. Interest on Capital</p>
<p class="body-text">That the interest at the rate of ${interestRate}% per annum or as may be prescribed u/s.40(b)(iv) of the Income Tax Act, 1961 or may be any other applicable provisions as may be in force in the Income tax assessment of partnership firm for the relevant accounting year shall be payable to the partners on the amount standing to the credit of the account of the partners. Such interest shall be calculated and credited to the account of each partner at the close of the accounting year.</p>

<p class="clause-head">${nextClause + 4}. Books of Accounts</p>
<p class="body-text">The books of accounts of the partnership shall be maintained at the principal place of business and the same shall be closed on the <strong>${accountingYear}</strong> every year to arrive at the profit or loss for the period ending and to draw the profit and loss account and the balance sheet to know the financial position of the firm as on date.</p>

<p class="clause-head">${nextClause + 5}. Profit and Loss Sharing</p>
<p class="body-text">That the share of the profits or losses of partnership business after taking into account all business and incidental expenses will be as follows:</p>
<ul class="profit-list">
${profitBullets}
</ul>

<p class="clause-head">${nextClause + 6}. Retirement</p>
<p class="body-text">Any partner desirous of retiring from the partnership during its continuance can exercise his/her right by giving ${noticePeriod} calendar months' notice to the other partner(s).</p>

<p class="clause-head">${nextClause + 7}. Death, Retirement or Insolvency</p>
<p class="body-text">Death, retirement or insolvency of any of the partners shall not dissolve the partnership. Further in case of death of any of the partners of the firm, the legal heirs as the case may be, shall be entitled to the capital account balance with the share of profit or loss up to the date of death of the partner only. The goodwill of the partnership business shall not be valued in the above circumstances.</p>

<p class="clause-head">${nextClause + 8}. Arbitration</p>
<p class="body-text">Any dispute that may arise between the partners shall be referred to an arbitrator whose award shall be final and binding on the parties MUTATIS MUTANDIS. The appointment of the arbitrator shall be on mutual consent.</p>

<p class="clause-head">${nextClause + 9}. Applicable Law</p>
<p class="body-text">The provision of the Partnership Act, 1932 as in vogue from time to time shall apply to this partnership except as otherwise stated above.</p>

<p class="clause-head">${nextClause + 10}. Amendments</p>
<p class="body-text">Any of the terms of this Deed may be amended, abandoned or otherwise be dealt with according to the necessities of the business and convenience of the partners and they shall be reduced to writing on Rs. 100/- stamp paper which shall have the same effect as if embodied in this Deed.</p>

<br><br><br>

<p class="body-text"><strong>IN WITNESS WHEREOF</strong> the parties hereto have set hands on this the <strong>${deedDate}</strong>.</p>

<table class="sig-table">
  <tr>
    <td>
      <p><strong>WITNESSES</strong></p>
      <br>
      <p>1. ________________________</p>
      <br><br>
      <p>2. ________________________</p>
    </td>
    <td>
      <p><strong>Partners</strong></p>
      <br>
      ${partnerSigRows}
    </td>
  </tr>
</table>

</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    showAlert('error', 'Pop-up blocked. Please allow pop-ups for this site.');
  }
}

// ── MODAL ────────────────────────────────────────────────────────────────────

let _modalTriggerEl = null;
const detailModal = document.getElementById('detailModal');

function openModal() {
  _modalTriggerEl = document.activeElement;
  detailModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    const closeBtn = document.getElementById('modalClose');
    if (closeBtn) closeBtn.focus();
  });
}

function closeModal() {
  detailModal.classList.add('hidden');
  if (_modalTriggerEl && typeof _modalTriggerEl.focus === 'function') {
    _modalTriggerEl.focus();
    _modalTriggerEl = null;
  }
}

// ── MOBILE MENU ──────────────────────────────────────────────────────────────

function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const backdrop = document.getElementById('mobileBackdrop');
  const sidebar = document.getElementById('sidebar');

  function toggleMenu() {
    const isOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', !isOpen);
    backdrop.classList.toggle('visible', !isOpen);
    backdrop.classList.toggle('hidden', isOpen);
    hamburger.setAttribute('aria-expanded', !isOpen);
  }

  function closeMenu() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('visible');
    backdrop.classList.add('hidden');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  if (hamburger) hamburger.onclick = toggleMenu;
  if (backdrop) backdrop.onclick = closeMenu;

  // Close menu when a sidebar navigation action is taken
  document.querySelectorAll('.sidebar-nav-btn, .sidebar-new-btn').forEach(btn => {
    btn.addEventListener('click', () => closeMenu());
  });

  // Close menu when a draft item is clicked
  const draftList = document.getElementById('draftList');
  if (draftList) {
    draftList.addEventListener('click', () => closeMenu());
  }
}

// ── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  // ── AUTH GUARD — redirect to login if not authenticated ──
  const session = await requireAuth();
  if (!session) return; // requireAuth redirects to /login.html

  // Listen for auth state changes (logout, token expiry)
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/login.html';
    }
  });

  // ── Show user email in sidebar ──
  const emailEl = document.getElementById('sidebarEmail');
  if (emailEl && session.user?.email) {
    emailEl.textContent = session.user.email;
  }

  // ── BIND ALL UI HANDLERS FIRST (before any async operations) ──
  // This ensures buttons work even if async network calls are slow or fail

  // Sidebar: New Deed
  const newDeedBtn = document.getElementById('newDeedBtn');
  if (newDeedBtn) {
    newDeedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        resetForm();
      } catch (err) {
        console.error('resetForm error:', err);
        showAlert('error', 'Failed to create new deed. Please reload the page.');
      }
    });
  }

  // Sidebar: Navigation
  document.getElementById('navGenerator')?.addEventListener('click', () => switchPage('generator'));
  document.getElementById('navHistory')?.addEventListener('click', () => switchPage('history'));

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });

  // Add partner button
  const addPartnerBtn = document.getElementById('addPartnerBtn');
  if (addPartnerBtn) addPartnerBtn.onclick = addPartner;

  // Partner count selector
  const partnerCountInput = document.getElementById('partnerCountInput');
  const partnerCountMinus = document.getElementById('partnerCountMinus');
  const partnerCountPlus = document.getElementById('partnerCountPlus');

  if (partnerCountInput) {
    partnerCountInput.addEventListener('change', () => setPartnerCount(partnerCountInput.value));
    partnerCountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPartnerCount(partnerCountInput.value);
        partnerCountInput.blur();
      }
    });
  }
  if (partnerCountMinus) {
    partnerCountMinus.onclick = () => setPartnerCount(partners.length - 1);
  }
  if (partnerCountPlus) {
    partnerCountPlus.onclick = () => setPartnerCount(partners.length + 1);
  }

  // Bulk Aadhaar upload
  const bulkAadhaarInput = document.getElementById('bulkAadhaarInput');
  if (bulkAadhaarInput) {
    bulkAadhaarInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        processBulkAadhaarOCR(files);
      }
      bulkAadhaarInput.value = '';
    });
  }

  // Bank operation dropdown → update hint text
  const bankOpSelect = document.getElementById('bankOperation');
  if (bankOpSelect) {
    bankOpSelect.addEventListener('change', () => {
      updateBankOperationHint();
      saveDraft();
      debouncedServerSave();
    });
    // Set initial hint to match the default dropdown value
    updateBankOperationHint();
  }

  // Business objective AI generation
  const genObjBtn = document.getElementById('generateObjectiveBtn');
  if (genObjBtn) genObjBtn.addEventListener('click', generateBusinessObjective);

  const regenObjBtn = document.getElementById('regenerateObjectiveBtn');
  if (regenObjBtn) regenObjBtn.addEventListener('click', generateBusinessObjective);

  // Business name AI suggestions
  const suggestNamesBtn = document.getElementById('suggestNamesBtn');
  if (suggestNamesBtn) suggestNamesBtn.addEventListener('click', suggestBusinessNames);

  // Structured address sub-fields → compose into hidden registeredAddress
  ADDRESS_FIELDS.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', () => {
        composeAddress();
        saveDraft();
        debouncedServerSave();
      });
    }
  });

  // Partnership duration toggle
  const durationSelect = document.getElementById('partnershipDuration');
  if (durationSelect) {
    durationSelect.addEventListener('change', () => {
      toggleDurationFields();
      saveDraft();
      debouncedServerSave();
    });
    // Restore visibility if loaded from draft with "fixed" selected
    toggleDurationFields();
  }

  // Show objective output section if businessObjectives already has content (e.g., loaded from draft)
  const objectiveOutput = document.getElementById('objectiveOutput');
  const businessObjectivesEl = document.getElementById('businessObjectives');
  if (objectiveOutput && businessObjectivesEl && businessObjectivesEl.value.trim()) {
    objectiveOutput.classList.remove('hidden');
  }

  // Step tab navigation
  document.querySelectorAll('.step-tab').forEach(t => {
    t.onclick = () => goTo(+t.dataset.step);
  });

  // Navigation buttons (data-goto)
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => goTo(+btn.dataset.goto));
  });

  // Generate button
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) generateBtn.onclick = generate;

  // PDF button
  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) pdfBtn.onclick = openPrintView;

  // Save draft on input for non-partner fields + auto-sync + clear field errors
  document.querySelectorAll('.form-card input, .form-card select, .form-card textarea').forEach(el => {
    if (el.closest('#partnersContainer')) return;
    if (el.closest('.partner-toolbar') || el.closest('.bulk-ocr-progress')) return;

    el.addEventListener('input', () => {
      const fieldWrap = el.closest('.field');
      if (fieldWrap && fieldWrap.classList.contains('error')) {
        fieldWrap.classList.remove('error');
        const errMsg = fieldWrap.querySelector('.field-error-msg');
        if (errMsg) errMsg.remove();
      }
      saveDraft();
      debouncedServerSave();
    });
  });

  // ── MODAL BINDINGS ──
  const modalClose = document.getElementById('modalClose');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  if (modalClose) modalClose.onclick = closeModal;
  if (modalCloseBtn) modalCloseBtn.onclick = closeModal;
  if (detailModal) {
    detailModal.onclick = (e) => { if (e.target === detailModal) closeModal(); };

    detailModal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const modalEl = detailModal.querySelector('.modal');
      if (!modalEl) return;
      const focusable = modalEl.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailModal && !detailModal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Mobile menu
  initMobileMenu();

  // Update partner count input to match initial state
  updatePartnerCountInput();

  // ── INITIALIZATION (load drafts, routing) ──
  try {
    loadDraft();
    fetchSidebarDrafts();
  } catch (initErr) {
    console.error('Initialization error:', initErr);
  }

  // Render initial partners (if not already loaded from draft)
  if (!document.querySelector('.partner-card')) {
    renderPartners();
  }

  // Hash routing
  window.addEventListener('hashchange', restoreFromHash);
  if (location.hash) {
    restoreFromHash();
  } else {
    location.hash = '#generator/0';
  }
}

document.addEventListener('DOMContentLoaded', init);
