// ── SUPABASE CRUD HELPERS ────────────────────────────────────────────────────
// Ported from frontend/js/main.js (lines 42-221) → TypeScript
// Uses the browser Supabase client (anon key + JWT via RLS)

import { supabase } from '@/lib/supabase';
import type {
  Deed,
  DeedDocument,
  FormPayload,
  PartnerRow,
  BusinessAddressRow,
} from '@/types';

// ── Types for CRUD operations ───────────────────────────────────────────────

interface DeedInsertParams {
  business_name: string;
  partner1_name: string;
  partner2_name: string;
  payload: FormPayload;
}

interface DeedSaveParams extends DeedInsertParams {
  id?: string | null;
}

// ── Helper: get current user ID ─────────────────────────────────────────────

export async function getUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

// ── Helper: get current access token ────────────────────────────────────────

export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) throw new Error('No active session');
  return session.access_token;
}

// ── INSERT ──────────────────────────────────────────────────────────────────

export async function dbInsertDeed(
  params: DeedInsertParams
): Promise<Deed> {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from('deeds')
    .insert({
      business_name: params.business_name,
      partner1_name: params.partner1_name,
      partner2_name: params.partner2_name,
      payload: params.payload,
      user_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Deed;
}

// ── UPDATE ──────────────────────────────────────────────────────────────────

export async function dbUpdateDeed(
  id: string,
  updates: Partial<Pick<Deed, 'business_name' | 'partner1_name' | 'partner2_name' | 'payload'>>
): Promise<Deed> {
  const { data, error } = await supabase
    .from('deeds')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Deed;
}

// ── LIST ALL DEEDS ──────────────────────────────────────────────────────────

export async function dbGetDeeds(): Promise<Deed[]> {
  // Try with document count join; fall back if child tables don't exist
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
    return (data as Deed[]) || [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((d) => ({
    ...d,
    _versionCount: d.deed_documents?.[0]?.count ?? 0,
  })) as Deed[];
}

// ── GET SINGLE DEED (with child table data) ─────────────────────────────────

export async function dbGetDeedById(id: string): Promise<Deed> {
  // Fetch the deed (required)
  const { data: deed, error: deedErr } = await supabase
    .from('deeds')
    .select('*')
    .eq('id', id)
    .single();
  if (deedErr) throw deedErr;

  const result = deed as Deed;
  result._partners = [];
  result._address = null;

  // Fetch child tables in parallel (best-effort)
  try {
    const [partnersRes, addressRes] = await Promise.all([
      supabase
        .from('partners')
        .select('*')
        .eq('deed_id', id)
        .order('ordinal', { ascending: true }),
      supabase
        .from('business_addresses')
        .select('*')
        .eq('deed_id', id)
        .maybeSingle(),
    ]);
    if (!partnersRes.error)
      result._partners = (partnersRes.data as PartnerRow[]) || [];
    if (!addressRes.error)
      result._address = (addressRes.data as BusinessAddressRow) || null;
  } catch {
    // Child tables may not exist pre-migration; proceed with payload fallback
  }

  return result;
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function dbDeleteDeed(id: string): Promise<void> {
  const { error } = await supabase.from('deeds').delete().eq('id', id);
  if (error) throw error;
}

// ── SAVE (UPSERT) ───────────────────────────────────────────────────────────

/**
 * Insert if no id, update if id exists.
 * After saving, also upserts partners + business address into child tables.
 */
export async function dbSaveDeed(params: DeedSaveParams): Promise<Deed> {
  let deed: Deed;
  if (params.id) {
    deed = await dbUpdateDeed(params.id, {
      business_name: params.business_name,
      partner1_name: params.partner1_name,
      partner2_name: params.partner2_name,
      payload: params.payload,
    });
  } else {
    deed = await dbInsertDeed({
      business_name: params.business_name,
      partner1_name: params.partner1_name,
      partner2_name: params.partner2_name,
      payload: params.payload,
    });
  }

  // Upsert child tables in parallel (best-effort)
  const deedId = deed.id;
  try {
    await Promise.all([
      dbUpsertPartners(deedId, params.payload),
      dbUpsertAddress(deedId, params.payload),
    ]);
  } catch (childErr) {
    console.warn('Child table upsert failed (deed saved OK):', childErr);
  }

  return deed;
}

// ── CHILD TABLE: Partners ───────────────────────────────────────────────────

/**
 * Upsert partners from the payload into the `partners` table.
 * Strategy: delete all existing partners for this deed, then bulk-insert.
 */
export async function dbUpsertPartners(
  deedId: string,
  payload: FormPayload
): Promise<void> {
  const partnerData = payload.partners;
  if (!partnerData || !Array.isArray(partnerData) || partnerData.length === 0)
    return;

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
    age: p.age ? parseInt(String(p.age), 10) || null : null,
    address: p.address || '',
    capital_pct: p.capital ? parseFloat(String(p.capital)) || null : null,
    profit_pct: p.profit ? parseFloat(String(p.profit)) || null : null,
    is_managing_partner: !!p.isManagingPartner,
    is_bank_authorized: !!p.isBankAuthorized,
  }));

  const { error: insError } = await supabase.from('partners').insert(rows);
  if (insError) throw insError;
}

// ── CHILD TABLE: Business Address ───────────────────────────────────────────

/**
 * Upsert the business address into the `business_addresses` table.
 * Uses Supabase upsert with onConflict on deed_id (1:1 relationship).
 */
export async function dbUpsertAddress(
  deedId: string,
  payload: FormPayload
): Promise<void> {
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

// ── DOCUMENT VERSIONS ───────────────────────────────────────────────────────

/**
 * Fetch all document versions for a deed, newest first.
 * Returns empty array if the deed_documents table doesn't exist yet.
 */
export async function dbGetDocumentVersions(
  deedId: string
): Promise<DeedDocument[]> {
  const { data, error } = await supabase
    .from('deed_documents')
    .select('*')
    .eq('deed_id', deedId)
    .order('version', { ascending: false });
  if (error) {
    console.warn(
      'deed_documents query failed (table may not exist yet):',
      error.message
    );
    return [];
  }
  return (data as DeedDocument[]) || [];
}
