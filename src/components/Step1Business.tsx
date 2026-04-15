// -- Step1Business Component -------------------------------------------------
// Step 1: Business Details pane.
// Contains: business name + AI suggest, deed date, nature of business,
// address sub-fields, duration selector, AI objective generator.

'use client';

import React from 'react';
import { useWizardStore, type WizardState } from '@/hooks/useWizardStore';
import { useAINameSuggestions } from '@/hooks/useAINameSuggestions';
import { useAIObjective } from '@/hooks/useAIObjective';

interface Step1BusinessProps {
  onPrev: () => void;
  onNext: () => void;
}

export function Step1Business({ onPrev, onNext }: Step1BusinessProps) {
  const businessName = useWizardStore((s) => s.businessName);
  const deedDate = useWizardStore((s) => s.deedDate);
  const natureOfBusiness = useWizardStore((s) => s.natureOfBusiness);
  const businessObjectives = useWizardStore((s) => s.businessObjectives);
  const businessDescriptionInput = useWizardStore((s) => s.businessDescriptionInput);
  const showObjectiveOutput = useWizardStore((s) => s.showObjectiveOutput);
  const showNameSuggestions = useWizardStore((s) => s.showNameSuggestions);

  const addrDoorNo = useWizardStore((s) => s.addrDoorNo);
  const addrBuildingName = useWizardStore((s) => s.addrBuildingName);
  const addrArea = useWizardStore((s) => s.addrArea);
  const addrDistrict = useWizardStore((s) => s.addrDistrict);
  const addrState = useWizardStore((s) => s.addrState);
  const addrPincode = useWizardStore((s) => s.addrPincode);

  const partnershipDuration = useWizardStore((s) => s.partnershipDuration);
  const partnershipStartDate = useWizardStore((s) => s.partnershipStartDate);
  const partnershipEndDate = useWizardStore((s) => s.partnershipEndDate);

  const fieldErrors = useWizardStore((s) => s.fieldErrors);
  const setField = useWizardStore((s) => s.setField);
  const updateAddress = useWizardStore((s) => s.updateAddress);
  const clearFieldError = useWizardStore((s) => s.clearFieldError);

  const {
    loading: nameSugLoading,
    error: nameSugError,
    suggestions,
    selectedChip,
    suggestNames,
    selectName,
  } = useAINameSuggestions();

  const {
    loading: objLoading,
    error: objError,
    generateObjective,
  } = useAIObjective();

  const handleField = (key: keyof WizardState, value: string) => {
    setField(key, value as never);
    if (fieldErrors[key as string]) clearFieldError(key as string);

    // Recompose address when sub-fields change
    if ((key as string).startsWith('addr')) {
      // Defer to next tick so store updates first
      setTimeout(() => updateAddress(), 0);
    }
  };

  const inputCls = (fieldId: string) => `
    w-full px-4 py-3 border rounded-sm text-sm min-h-[44px]
    bg-white text-navy-800 placeholder:text-navy-400
    focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
    transition-all duration-200
    ${fieldErrors[fieldId] ? 'border-red-600 ring-[3px] ring-red-600/10' : 'border-navy-200'}
  `;

  return (
    <div className="flex flex-col gap-6">
      {/* Business Name + AI Suggest */}
      <div className="bg-white border-l-[3px] border-l-accent border border-navy-100 rounded-[10px] p-5">
        <h3 className="text-[0.82rem] font-semibold text-navy-800 mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </svg>
          Business Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Business Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Business Name <span className="text-red-600">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={businessName}
                onChange={(e) => handleField('businessName', e.target.value)}
                placeholder="e.g. Sri Lakshmi Enterprises"
                className={inputCls('businessName') + ' flex-1'}
              />
              <button
                onClick={suggestNames}
                disabled={nameSugLoading}
                className="
                  px-3 py-2 border border-accent text-accent-dark rounded-sm
                  text-2xs font-medium whitespace-nowrap
                  hover:bg-accent-bg disabled:opacity-50
                  transition-all duration-200
                "
              >
                {nameSugLoading ? (
                  <span className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin inline-block" />
                ) : (
                  'AI Suggest'
                )}
              </button>
            </div>
            {fieldErrors.businessName && (
              <p className="text-2xs text-red-600">{fieldErrors.businessName}</p>
            )}
            {nameSugError && (
              <p className="text-2xs text-red-600">{nameSugError}</p>
            )}

            {/* Name suggestion chips */}
            {showNameSuggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => selectName(name)}
                    className={`
                      px-3 py-1.5 rounded-full text-2xs font-medium
                      border transition-all duration-200
                      ${
                        selectedChip === name
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white text-navy-600 border-navy-200 hover:border-accent hover:text-accent-dark'
                      }
                    `}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date of Deed */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Date of Deed <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              value={deedDate}
              onChange={(e) => handleField('deedDate', e.target.value)}
              className={inputCls('deedDate')}
            />
            {fieldErrors.deedDate && (
              <p className="text-2xs text-red-600">{fieldErrors.deedDate}</p>
            )}
          </div>

          {/* Nature of Business */}
          <div className="flex flex-col gap-1.5 col-span-full">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Nature of Business
            </label>
            <input
              type="text"
              value={natureOfBusiness}
              onChange={(e) => handleField('natureOfBusiness', e.target.value)}
              placeholder="e.g. Retail, Manufacturing, IT Services"
              className={inputCls('natureOfBusiness')}
            />
          </div>
        </div>
      </div>

      {/* Registered Address */}
      <div className="bg-white border-l-[3px] border-l-accent border border-navy-100 rounded-[10px] p-5">
        <h3 className="text-[0.82rem] font-semibold text-navy-800 mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Registered Address
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Door No / Plot No <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={addrDoorNo}
              onChange={(e) => handleField('addrDoorNo', e.target.value)}
              placeholder="e.g. 12-3-456"
              className={inputCls('addrDoorNo')}
            />
            {fieldErrors.addrDoorNo && (
              <p className="text-2xs text-red-600">{fieldErrors.addrDoorNo}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Building / Flat Name
            </label>
            <input
              type="text"
              value={addrBuildingName}
              onChange={(e) => handleField('addrBuildingName', e.target.value)}
              placeholder="e.g. Sunrise Apartments"
              className={inputCls('addrBuildingName')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Area / Locality <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={addrArea}
              onChange={(e) => handleField('addrArea', e.target.value)}
              placeholder="e.g. Banjara Hills"
              className={inputCls('addrArea')}
            />
            {fieldErrors.addrArea && (
              <p className="text-2xs text-red-600">{fieldErrors.addrArea}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              District <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={addrDistrict}
              onChange={(e) => handleField('addrDistrict', e.target.value)}
              placeholder="e.g. Hyderabad"
              className={inputCls('addrDistrict')}
            />
            {fieldErrors.addrDistrict && (
              <p className="text-2xs text-red-600">{fieldErrors.addrDistrict}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              State <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={addrState}
              onChange={(e) => handleField('addrState', e.target.value)}
              placeholder="e.g. Telangana"
              className={inputCls('addrState')}
            />
            {fieldErrors.addrState && (
              <p className="text-2xs text-red-600">{fieldErrors.addrState}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.82rem] font-medium text-navy-800">
              Pincode <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={addrPincode}
              onChange={(e) => handleField('addrPincode', e.target.value)}
              placeholder="e.g. 500034"
              maxLength={6}
              className={inputCls('addrPincode')}
            />
            {fieldErrors.addrPincode && (
              <p className="text-2xs text-red-600">{fieldErrors.addrPincode}</p>
            )}
          </div>
        </div>
      </div>

      {/* Partnership Duration */}
      <div className="bg-white border border-navy-100 rounded-[10px] p-5">
        <h3 className="text-[0.82rem] font-semibold text-navy-800 mb-4">
          Partnership Duration
        </h3>
        <div className="flex gap-4 mb-4">
          <label className={`
            flex items-center gap-2 px-4 py-3 border rounded-sm cursor-pointer
            transition-all duration-200
            ${partnershipDuration === 'will'
              ? 'border-accent bg-accent/5 text-accent-dark font-medium'
              : 'border-navy-200 text-navy-500 hover:border-navy-300'}
          `}>
            <input
              type="radio"
              name="duration"
              value="will"
              checked={partnershipDuration === 'will'}
              onChange={() => handleField('partnershipDuration', 'will')}
              className="sr-only"
            />
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              partnershipDuration === 'will' ? 'border-accent' : 'border-navy-300'
            }`}>
              {partnershipDuration === 'will' && (
                <span className="w-2 h-2 rounded-full bg-accent" />
              )}
            </span>
            At Will
          </label>

          <label className={`
            flex items-center gap-2 px-4 py-3 border rounded-sm cursor-pointer
            transition-all duration-200
            ${partnershipDuration === 'fixed'
              ? 'border-accent bg-accent/5 text-accent-dark font-medium'
              : 'border-navy-200 text-navy-500 hover:border-navy-300'}
          `}>
            <input
              type="radio"
              name="duration"
              value="fixed"
              checked={partnershipDuration === 'fixed'}
              onChange={() => handleField('partnershipDuration', 'fixed')}
              className="sr-only"
            />
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              partnershipDuration === 'fixed' ? 'border-accent' : 'border-navy-300'
            }`}>
              {partnershipDuration === 'fixed' && (
                <span className="w-2 h-2 rounded-full bg-accent" />
              )}
            </span>
            Fixed Duration
          </label>
        </div>

        {partnershipDuration === 'fixed' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pl-4 border-l-2 border-accent">
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.82rem] font-medium text-navy-800">
                Start Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={partnershipStartDate}
                onChange={(e) => handleField('partnershipStartDate', e.target.value)}
                className={inputCls('partnershipStartDate')}
              />
              {fieldErrors.partnershipStartDate && (
                <p className="text-2xs text-red-600">{fieldErrors.partnershipStartDate}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.82rem] font-medium text-navy-800">
                End Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={partnershipEndDate}
                onChange={(e) => handleField('partnershipEndDate', e.target.value)}
                className={inputCls('partnershipEndDate')}
              />
              {fieldErrors.partnershipEndDate && (
                <p className="text-2xs text-red-600">{fieldErrors.partnershipEndDate}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Business Objective Generator */}
      <div className="bg-white border border-navy-100 rounded-[10px] p-5">
        <h3 className="text-[0.82rem] font-semibold text-navy-800 mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
          AI Business Objective Generator
        </h3>

        <div className="flex flex-col gap-3">
          <label className="text-[0.82rem] font-medium text-navy-800">
            Describe your business in a few words
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={businessDescriptionInput}
              onChange={(e) => handleField('businessDescriptionInput', e.target.value)}
              placeholder="e.g. We sell organic vegetables online"
              className={inputCls('businessDescriptionInput') + ' flex-1'}
            />
            <button
              onClick={generateObjective}
              disabled={objLoading}
              className="
                px-4 py-2 bg-accent text-white rounded-sm
                text-2xs font-semibold whitespace-nowrap
                hover:bg-accent-dark disabled:opacity-50
                transition-all duration-200
              "
            >
              {objLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                'Generate Objective'
              )}
            </button>
          </div>
          {objError && (
            <p className="text-2xs text-red-600">{objError}</p>
          )}

          {showObjectiveOutput && businessObjectives && (
            <div className="mt-2">
              <label className="text-[0.82rem] font-medium text-navy-800 mb-1.5 block">
                Business Objectives
              </label>
              <textarea
                value={businessObjectives}
                onChange={(e) => handleField('businessObjectives', e.target.value)}
                rows={4}
                className="
                  w-full px-4 py-3 border border-navy-200 rounded-sm text-sm
                  bg-white text-navy-800 placeholder:text-navy-400
                  focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none
                  transition-all duration-200 resize-y min-h-[80px]
                "
              />
              <p className="text-2xs text-navy-400 mt-1">
                AI-generated. Feel free to edit as needed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Step Actions */}
      <div className="flex justify-between pt-2">
        <button
          onClick={onPrev}
          className="
            px-5 py-3 border border-navy-200 text-navy-600 rounded-sm
            min-h-[44px] text-sm font-medium
            hover:bg-navy-50 transition-all duration-200
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          className="
            px-6 py-3 bg-accent text-white font-semibold rounded-sm
            min-h-[44px] text-sm
            hover:bg-accent-dark hover:-translate-y-px
            active:translate-y-0
            transition-all duration-200
            shadow-card
          "
        >
          Next: Clauses
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline ml-2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
