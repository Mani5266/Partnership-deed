// ── WIZARD STORE (Zustand) ───────────────────────────────────────────────────
// Central state store for the Partnership Deed Generator wizard.
// Combines: wizard navigation, partners, form fields, draft persistence,
// deed CRUD, and UI state into a single store with slices.
//
// Replaces: currentStep, currentPage, currentDeedId, partners[], saveDraft(),
// loadDraft(), syncPartnersFromDOM(), getPayload(), and all global state
// from frontend/js/main.js.

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Partner, FormPayload, BusinessAddress } from '@/types';
import { DEFAULT_PARTNER, MIN_PARTNERS, MAX_PARTNERS } from '@/types';
import { composeAddress } from '@/lib/utils';

// ── Field Errors ────────────────────────────────────────────────────────────

export interface FieldErrors {
  [fieldId: string]: string; // fieldId → error message
}

// ── Store State ─────────────────────────────────────────────────────────────

export interface WizardState {
  // ── Wizard Navigation ──
  currentStep: number;       // 0-3
  currentPage: 'generator' | 'history';

  // ── Deed Identity ──
  currentDeedId: string | null;

  // ── Partners Array ──
  partners: Partner[];

  // ── Form Fields (non-partner) ──
  businessName: string;
  businessDescriptionInput: string;
  natureOfBusiness: string;
  businessObjectives: string;
  deedDate: string;

  // Address sub-fields
  addrDoorNo: string;
  addrBuildingName: string;
  addrArea: string;
  addrDistrict: string;
  addrState: string;
  addrPincode: string;
  registeredAddress: string; // composed from sub-fields

  // Banking & clauses
  bankOperation: string;
  interestRate: string;
  noticePeriod: string;
  accountingYear: string;
  additionalPoints: string;

  // Duration
  partnershipDuration: 'will' | 'fixed';
  partnershipStartDate: string;
  partnershipEndDate: string;

  // Capital/Profit sync
  profitSameAsCapital: boolean;

  // ── UI State ──
  fieldErrors: FieldErrors;
  isGenerating: boolean;
  showObjectiveOutput: boolean;
  nameSuggestions: string[];
  showNameSuggestions: boolean;
  selectedNameChip: string | null;

  // ── Dirty flag (for auto-save) ──
  _dirty: boolean;
  _lastSavedAt: number; // timestamp ms
}

// ── Store Actions ───────────────────────────────────────────────────────────

export interface WizardActions {
  // ── Navigation ──
  goToStep: (step: number) => void;
  switchPage: (page: 'generator' | 'history') => void;

  // ── Deed Identity ──
  setCurrentDeedId: (id: string | null) => void;

  // ── Partners ──
  addPartner: () => boolean;               // returns false if at max
  removePartner: (index: number) => boolean; // returns false if at min
  updatePartner: (index: number, updates: Partial<Partner>) => void;
  setPartnerCount: (count: number) => void;
  setPartners: (partners: Partner[]) => void;
  syncProfitFromCapital: () => void;

  // ── Form Fields ──
  setField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  setFields: (updates: Partial<WizardState>) => void;
  updateAddress: () => void; // recompute registeredAddress from sub-fields

  // ── Validation ──
  setFieldError: (fieldId: string, message: string) => void;
  clearFieldError: (fieldId: string) => void;
  clearAllFieldErrors: () => void;
  setFieldErrors: (errors: FieldErrors) => void;

  // ── Payload ──
  getPayload: () => FormPayload;

  // ── Reset ──
  resetForm: () => void;

  // ── Restore from DB deed ──
  restoreFromDeed: (deed: {
    id: string;
    payload: FormPayload;
    business_name: string;
  }) => void;

  // ── Dirty flag ──
  markClean: () => void;
}

// ── Initial State ───────────────────────────────────────────────────────────

const initialPartners: Partner[] = [
  { ...DEFAULT_PARTNER },
  { ...DEFAULT_PARTNER },
];

const initialState: WizardState = {
  currentStep: 0,
  currentPage: 'generator',
  currentDeedId: null,

  partners: initialPartners,

  businessName: '',
  businessDescriptionInput: '',
  natureOfBusiness: '',
  businessObjectives: '',
  deedDate: '',

  addrDoorNo: '',
  addrBuildingName: '',
  addrArea: '',
  addrDistrict: '',
  addrState: '',
  addrPincode: '',
  registeredAddress: '',

  bankOperation: 'jointly',
  interestRate: '12',
  noticePeriod: '3',
  accountingYear: '31st March',
  additionalPoints: '',

  partnershipDuration: 'will',
  partnershipStartDate: '',
  partnershipEndDate: '',

  profitSameAsCapital: false,

  fieldErrors: {},
  isGenerating: false,
  showObjectiveOutput: false,
  nameSuggestions: [],
  showNameSuggestions: false,
  selectedNameChip: null,

  _dirty: false,
  _lastSavedAt: 0,
};

// ── Store ───────────────────────────────────────────────────────────────────

export const useWizardStore = create<WizardState & WizardActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ── Navigation ──

      goToStep: (step) => {
        const clamped = Math.max(0, Math.min(3, step));
        set({ currentStep: clamped });
      },

      switchPage: (page) => set({ currentPage: page }),

      // ── Deed Identity ──

      setCurrentDeedId: (id) => set({ currentDeedId: id }),

      // ── Partners ──

      addPartner: () => {
        const { partners } = get();
        if (partners.length >= MAX_PARTNERS) return false;
        set({
          partners: [...partners, { ...DEFAULT_PARTNER }],
          _dirty: true,
        });
        return true;
      },

      removePartner: (index) => {
        const { partners } = get();
        if (partners.length <= MIN_PARTNERS) return false;
        const next = partners.filter((_, i) => i !== index);
        set({ partners: next, _dirty: true });
        return true;
      },

      updatePartner: (index, updates) => {
        const { partners, profitSameAsCapital } = get();
        if (index < 0 || index >= partners.length) return;
        const next = partners.map((p, i) => {
          if (i !== index) return p;
          const updated = { ...p, ...updates };
          // If profit synced to capital, keep them equal
          if (profitSameAsCapital && 'capital' in updates) {
            updated.profit = updates.capital ?? p.capital;
          }
          return updated;
        });
        set({ partners: next, _dirty: true });
      },

      setPartnerCount: (count) => {
        const clamped = Math.max(MIN_PARTNERS, Math.min(MAX_PARTNERS, count));
        const { partners } = get();
        if (clamped === partners.length) return;

        let next: Partner[];
        if (clamped > partners.length) {
          // Add empty partners
          const toAdd = clamped - partners.length;
          next = [
            ...partners,
            ...Array.from({ length: toAdd }, () => ({ ...DEFAULT_PARTNER })),
          ];
        } else {
          // Remove from end
          next = partners.slice(0, clamped);
        }
        set({ partners: next, _dirty: true });
      },

      setPartners: (partners) => set({ partners, _dirty: true }),

      syncProfitFromCapital: () => {
        const { partners } = get();
        const synced = partners.map((p) => ({ ...p, profit: p.capital }));
        set({ partners: synced, _dirty: true });
      },

      // ── Form Fields ──

      setField: (key, value) => {
        set({ [key]: value, _dirty: true } as Partial<WizardState & WizardActions>);
      },

      setFields: (updates) => {
        set({ ...updates, _dirty: true } as Partial<WizardState & WizardActions>);
      },

      updateAddress: () => {
        const s = get();
        const addr: BusinessAddress = {
          doorNo: s.addrDoorNo,
          buildingName: s.addrBuildingName,
          area: s.addrArea,
          district: s.addrDistrict,
          state: s.addrState,
          pincode: s.addrPincode,
        };
        set({ registeredAddress: composeAddress(addr), _dirty: true });
      },

      // ── Validation ──

      setFieldError: (fieldId, message) =>
        set((s) => ({
          fieldErrors: { ...s.fieldErrors, [fieldId]: message },
        })),

      clearFieldError: (fieldId) =>
        set((s) => {
          const next = { ...s.fieldErrors };
          delete next[fieldId];
          return { fieldErrors: next };
        }),

      clearAllFieldErrors: () => set({ fieldErrors: {} }),

      setFieldErrors: (errors) => set({ fieldErrors: errors }),

      // ── Payload ──

      getPayload: (): FormPayload => {
        const s = get();
        const p = s.partners;
        return {
          _deedId: s.currentDeedId ?? undefined,
          deedDate: s.deedDate,
          partners: p,
          businessName: s.businessName,
          natureOfBusiness: s.natureOfBusiness,
          businessObjectives: s.businessObjectives,
          businessDescriptionInput: s.businessDescriptionInput,
          registeredAddress: s.registeredAddress,
          addrDoorNo: s.addrDoorNo,
          addrBuildingName: s.addrBuildingName,
          addrArea: s.addrArea,
          addrDistrict: s.addrDistrict,
          addrState: s.addrState,
          addrPincode: s.addrPincode,
          bankOperation: s.bankOperation,
          interestRate: s.interestRate,
          noticePeriod: s.noticePeriod,
          accountingYear: s.accountingYear,
          additionalPoints: s.additionalPoints,
          partnershipDuration: s.partnershipDuration,
          partnershipStartDate: s.partnershipStartDate,
          partnershipEndDate: s.partnershipEndDate,
          // Legacy backward-compat fields
          ...(p[0]
            ? {
                partner1Name: p[0].name,
                partner1FatherName: p[0].fatherName,
                partner1Age: typeof p[0].age === 'string' ? Number(p[0].age) || 0 : p[0].age,
                partner1Address: p[0].address,
                partner1Relation: p[0].relation,
                partner1Capital: typeof p[0].capital === 'string' ? Number(p[0].capital) || 0 : p[0].capital,
                partner1Profit: typeof p[0].profit === 'string' ? Number(p[0].profit) || 0 : p[0].profit,
              }
            : {}),
          ...(p[1]
            ? {
                partner2Name: p[1].name,
                partner2FatherName: p[1].fatherName,
                partner2Age: typeof p[1].age === 'string' ? Number(p[1].age) || 0 : p[1].age,
                partner2Address: p[1].address,
                partner2Relation: p[1].relation,
                partner2Capital: typeof p[1].capital === 'string' ? Number(p[1].capital) || 0 : p[1].capital,
                partner2Profit: typeof p[1].profit === 'string' ? Number(p[1].profit) || 0 : p[1].profit,
              }
            : {}),
        };
      },

      // ── Reset ──

      resetForm: () => {
        set({
          ...initialState,
          // Preserve navigation state
          currentPage: get().currentPage,
        });
      },

      // ── Restore from DB ──

      restoreFromDeed: (deed) => {
        const p = deed.payload;
        if (!p) return;

        // Restore partners from payload.partners or legacy fields
        let partners: Partner[];
        if (p.partners && Array.isArray(p.partners) && p.partners.length >= 2) {
          partners = p.partners.map((pp) => ({
            name: pp.name || '',
            relation: pp.relation || 'S/O',
            fatherName: pp.fatherName || '',
            age: pp.age ?? '',
            address: pp.address || '',
            capital: pp.capital ?? 0,
            profit: pp.profit ?? 0,
            isManagingPartner: !!pp.isManagingPartner,
            isBankAuthorized: !!pp.isBankAuthorized,
          }));
        } else {
          // Legacy 2-partner format
          partners = [
            {
              name: p.partner1Name || '',
              relation: p.partner1Relation || 'S/O',
              fatherName: p.partner1FatherName || '',
              age: p.partner1Age ?? '',
              address: p.partner1Address || '',
              capital: p.partner1Capital ?? 0,
              profit: p.partner1Profit ?? 0,
              isManagingPartner: false,
              isBankAuthorized: false,
            },
            {
              name: p.partner2Name || '',
              relation: p.partner2Relation || 'S/O',
              fatherName: p.partner2FatherName || '',
              age: p.partner2Age ?? '',
              address: p.partner2Address || '',
              capital: p.partner2Capital ?? 0,
              profit: p.partner2Profit ?? 0,
              isManagingPartner: false,
              isBankAuthorized: false,
            },
          ];
        }

        set({
          currentDeedId: deed.id,
          partners,
          businessName: p.businessName || '',
          businessDescriptionInput: p.businessDescriptionInput || '',
          natureOfBusiness: p.natureOfBusiness || '',
          businessObjectives: p.businessObjectives || '',
          deedDate: p.deedDate || '',
          addrDoorNo: p.addrDoorNo || '',
          addrBuildingName: p.addrBuildingName || '',
          addrArea: p.addrArea || '',
          addrDistrict: p.addrDistrict || '',
          addrState: p.addrState || '',
          addrPincode: p.addrPincode || '',
          registeredAddress: p.registeredAddress || '',
          bankOperation: p.bankOperation || 'jointly',
          interestRate: p.interestRate || '12',
          noticePeriod: p.noticePeriod || '3',
          accountingYear: p.accountingYear || '31st March',
          additionalPoints: p.additionalPoints || '',
          partnershipDuration: p.partnershipDuration || 'will',
          partnershipStartDate: p.partnershipStartDate || '',
          partnershipEndDate: p.partnershipEndDate || '',
          showObjectiveOutput: !!(p.businessObjectives),
          currentStep: 0,
          currentPage: 'generator',
          _dirty: false,
        });
      },

      // ── Dirty flag ──
      markClean: () => set({ _dirty: false, _lastSavedAt: Date.now() }),
    }),
    {
      name: 'oneasy_draft', // localStorage key — matches legacy key
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          // SSR fallback — noop storage
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Only persist form data, not UI state
      partialize: (state) => ({
        currentStep: state.currentStep,
        currentDeedId: state.currentDeedId,
        partners: state.partners,
        businessName: state.businessName,
        businessDescriptionInput: state.businessDescriptionInput,
        natureOfBusiness: state.natureOfBusiness,
        businessObjectives: state.businessObjectives,
        deedDate: state.deedDate,
        addrDoorNo: state.addrDoorNo,
        addrBuildingName: state.addrBuildingName,
        addrArea: state.addrArea,
        addrDistrict: state.addrDistrict,
        addrState: state.addrState,
        addrPincode: state.addrPincode,
        registeredAddress: state.registeredAddress,
        bankOperation: state.bankOperation,
        interestRate: state.interestRate,
        noticePeriod: state.noticePeriod,
        accountingYear: state.accountingYear,
        additionalPoints: state.additionalPoints,
        partnershipDuration: state.partnershipDuration,
        partnershipStartDate: state.partnershipStartDate,
        partnershipEndDate: state.partnershipEndDate,
        profitSameAsCapital: state.profitSameAsCapital,
        showObjectiveOutput: state.showObjectiveOutput,
      }),
    }
  )
);
