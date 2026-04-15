// ── PARTNERSHIP DEED GENERATOR — TypeScript Type Definitions ─────────────────

// ── Partner ─────────────────────────────────────────────────────────────────

export interface Partner {
  name: string;
  relation: string;        // "S/O" | "D/O" | "W/O" etc.
  fatherName: string;
  age: number | string;
  address: string;
  capital: number | string; // percentage
  profit: number | string;  // percentage
  isManagingPartner: boolean;
  isBankAuthorized: boolean;
}

/** Default empty partner for form initialization */
export const DEFAULT_PARTNER: Partner = {
  name: '',
  relation: 'S/O',
  fatherName: '',
  age: '',
  address: '',
  capital: 0,
  profit: 0,
  isManagingPartner: false,
  isBankAuthorized: false,
};

export const MIN_PARTNERS = 2;
export const MAX_PARTNERS = 20;

// ── Business Address (structured sub-fields) ────────────────────────────────

export interface BusinessAddress {
  doorNo: string;
  buildingName: string;
  area: string;
  district: string;
  state: string;
  pincode: string;
}

// ── Deed (Supabase `deeds` table row) ───────────────────────────────────────

export interface Deed {
  id: string;
  user_id: string;
  business_name: string;
  partner1_name: string;
  partner2_name: string;
  payload: FormPayload;
  created_at: string;
  updated_at: string;
  /** Latest document storage path (updated on each generation) */
  doc_url?: string | null;
  /** Joined from deed_documents aggregate — not in the table itself */
  _versionCount?: number;
  /** Joined from partners child table */
  _partners?: PartnerRow[];
  /** Joined from business_addresses child table */
  _address?: BusinessAddressRow | null;
}

// ── Child table rows (as stored in Supabase) ────────────────────────────────

export interface PartnerRow {
  id: string;
  deed_id: string;
  ordinal: number;
  name: string;
  relation: string;
  father_name: string;
  age: number | null;
  address: string;
  capital_pct: number | null;
  profit_pct: number | null;
  is_managing_partner: boolean;
  is_bank_authorized: boolean;
  created_at: string;
}

export interface BusinessAddressRow {
  id: string;
  deed_id: string;
  door_no: string;
  building_name: string;
  area: string;
  district: string;
  state: string;
  pincode: string;
  full_address: string; // trigger-computed
  created_at: string;
  updated_at: string;
}

// ── Deed Document (version history) ─────────────────────────────────────────

export interface DeedDocument {
  id: string;
  deed_id: string;
  version: number;
  file_name: string;
  file_size: number;
  storage_path: string;
  content_type: string;
  generated_at: string;
}

// ── Form Payload (the full data blob stored in deeds.payload) ───────────────

export interface FormPayload {
  /** Internal deed ID for storage path */
  _deedId?: string;

  /** Date of deed execution */
  deedDate: string;

  /** Dynamic partners array */
  partners: Partner[];

  // Legacy 2-partner fields (backward compat)
  partner1Name?: string;
  partner1FatherName?: string;
  partner1Age?: number;
  partner1Address?: string;
  partner1Relation?: string;
  partner1Capital?: number;
  partner1Profit?: number;
  partner2Name?: string;
  partner2FatherName?: string;
  partner2Age?: number;
  partner2Address?: string;
  partner2Relation?: string;
  partner2Capital?: number;
  partner2Profit?: number;

  /** Business details */
  businessName: string;
  natureOfBusiness: string;
  businessObjectives: string;
  businessDescriptionInput: string;
  registeredAddress: string;

  /** Structured address sub-fields */
  addrDoorNo?: string;
  addrBuildingName?: string;
  addrArea?: string;
  addrDistrict?: string;
  addrState?: string;
  addrPincode?: string;

  /** Banking */
  bankOperation: string; // "jointly" | "either"

  /** Additional clauses */
  interestRate: string;
  noticePeriod: string;
  accountingYear: string;
  additionalPoints: string;

  /** Partnership duration */
  partnershipDuration: 'will' | 'fixed';
  partnershipStartDate: string;
  partnershipEndDate: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult<T = FormPayload> {
  success: boolean;
  data?: T;
  errors?: string[];
}

// ── Ordinal Labels ──────────────────────────────────────────────────────────

export const ORDINAL_LABELS = [
  'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth',
  'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth',
  'Nineteenth', 'Twentieth',
] as const;

export function getPartyLabel(index: number): string {
  return ORDINAL_LABELS[index] ?? `${index + 1}th`;
}

// ── API Response Types ──────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: string[];
}

export interface GenerateResponse {
  message: string;
  deedId: string;
  version: number;
  downloadUrl: string;
}

export interface OcrResponse {
  name: string;
  fatherName: string;
  age: string;
  address: string;
  relation: string;
}

export interface ObjectiveResponse {
  objectives: string;
}

export interface NameSuggestionResponse {
  names: string[];
}
