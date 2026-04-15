// -- Main App Page ------------------------------------------------------------
// Renders the app shell: Sidebar + content area.
// Switches between Generator (wizard) and History (deed grid) views
// based on useWizardStore.currentPage — matching legacy SPA behavior.
// Phase 8: Added ChatPanel (AI assistant) with voice + text form-filling.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { ProgressBar, WizardTabs } from '@/components/WizardTabs';
import { Step0Partners } from '@/components/Step0Partners';
import { Step1Business } from '@/components/Step1Business';
import { Step2Clauses } from '@/components/Step2Clauses';
import { Step3Review } from '@/components/Step3Review';
import { DeedGrid } from '@/components/DeedGrid';
import DetailModal from '@/components/DetailModal';
import { ChatPanel, type ChatMessage } from '@/components/ChatPanel';
import type { ExtractedDeedData } from '@/lib/merge';
import type { Partner } from '@/types';
import { useWizardStore } from '@/hooks/useWizardStore';
import { useDeedList } from '@/hooks/useDeedList';
import { useDeedActions } from '@/hooks/useDeedActions';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useAuth } from '@/hooks/useAuth';

export default function HomePage() {
  const { loading: authLoading } = useAuth();
  const currentPage = useWizardStore((s) => s.currentPage);
  const currentStep = useWizardStore((s) => s.currentStep);
  const goToStep = useWizardStore((s) => s.goToStep);
  const switchPage = useWizardStore((s) => s.switchPage);
  const resetForm = useWizardStore((s) => s.resetForm);
  const setFields = useWizardStore((s) => s.setFields);
  const setPartners = useWizardStore((s) => s.setPartners);
  const updateAddress = useWizardStore((s) => s.updateAddress);

  // ── Deed list for sidebar ──
  const {
    sidebarDrafts,
    fetchDeeds,
  } = useDeedList();

  // ── Deed actions (for sidebar edit/delete) ──
  const {
    editDeed,
    deleteDeed,
  } = useDeedActions({ onRefresh: fetchDeeds });

  // ── Auto-save ──
  useAutoSave();

  // ── Detail modal state ──
  const [modalDeedId, setModalDeedId] = useState<string | null>(null);

  // ── Chat panel state (lifted so messages persist across panel open/close) ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatExtractedData, setChatExtractedData] = useState<ExtractedDeedData>({});

  // ── Fetch deeds on mount ──
  useEffect(() => {
    fetchDeeds();
  }, [fetchDeeds]);

  // ── Sidebar handlers ──
  const handleNewDeed = useCallback(() => {
    resetForm();
    switchPage('generator');
    // Reset chat when starting a new deed
    setChatMessages([]);
    setChatExtractedData({});
  }, [resetForm, switchPage]);

  const handleEditDeed = useCallback(
    async (id: string) => {
      await editDeed(id);
      switchPage('generator');
    },
    [editDeed, switchPage]
  );

  const handleDeleteDeed = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this partnership deed?')) return;
      await deleteDeed(id);
    },
    [deleteDeed]
  );

  const handleNavigate = useCallback(
    (page: 'generator' | 'history') => {
      switchPage(page);
      if (page === 'history') fetchDeeds();
    },
    [switchPage, fetchDeeds]
  );

  // ── History grid handlers ──
  const handleViewDeed = useCallback((id: string) => {
    setModalDeedId(id);
  }, []);

  // ── Step navigation helpers ──
  const nextStep = useCallback(() => goToStep(currentStep + 1), [goToStep, currentStep]);
  const prevStep = useCallback(() => goToStep(currentStep - 1), [goToStep, currentStep]);

  // ── Chat: handle AI-extracted data → push to Zustand store ──
  const handleExtractedData = useCallback(
    (data: ExtractedDeedData) => {
      // 1. If AI returned partners, push them to the store
      if (data.partners && Array.isArray(data.partners) && data.partners.length > 0) {
        // Ensure minimum 2 partners — pad with defaults if needed
        const aiPartners: Partner[] = data.partners.map((p) => ({
          name: p.name || '',
          relation: p.relation || 'S/O',
          fatherName: p.fatherName || '',
          age: p.age ?? '',
          address: p.address || '',
          capital: p.capital ?? 0,
          profit: p.profit ?? 0,
          isManagingPartner: p.isManagingPartner ?? false,
          isBankAuthorized: p.isBankAuthorized ?? false,
        }));
        // Pad to minimum 2
        while (aiPartners.length < 2) {
          aiPartners.push({
            name: '',
            relation: 'S/O',
            fatherName: '',
            age: '',
            address: '',
            capital: 0,
            profit: 0,
            isManagingPartner: false,
            isBankAuthorized: false,
          });
        }
        setPartners(aiPartners);
      }

      // 2. Push scalar (non-partner, non-address) fields
      const scalarFields: Partial<Record<string, unknown>> = {};
      const scalarKeys = [
        'businessName',
        'businessDescriptionInput',
        'natureOfBusiness',
        'businessObjectives',
        'deedDate',
        'bankOperation',
        'interestRate',
        'noticePeriod',
        'accountingYear',
        'additionalPoints',
        'partnershipDuration',
        'partnershipStartDate',
        'partnershipEndDate',
      ] as const;

      for (const key of scalarKeys) {
        if (data[key] !== undefined && data[key] !== null) {
          scalarFields[key] = data[key];
        }
      }

      // 3. Push address sub-fields
      const addrKeys = [
        'addrDoorNo',
        'addrBuildingName',
        'addrArea',
        'addrDistrict',
        'addrState',
        'addrPincode',
      ] as const;

      let hasAddrUpdate = false;
      for (const key of addrKeys) {
        if (data[key] !== undefined && data[key] !== null) {
          scalarFields[key] = data[key];
          hasAddrUpdate = true;
        }
      }

      if (Object.keys(scalarFields).length > 0) {
        setFields(scalarFields as Parameters<typeof setFields>[0]);
      }

      // 4. Recompute composed address if any address sub-field was updated
      if (hasAddrUpdate) {
        // Small delay to ensure setFields has applied
        setTimeout(() => updateAddress(), 0);
      }
    },
    [setFields, setPartners, updateAddress]
  );

  // ── Auth loading screen ──
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-navy-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Skip to main content */}
      <a
        href="#mainContent"
        className="
          sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2
          focus:z-[9999] focus:px-4 focus:py-2 focus:bg-accent focus:text-navy-900
          focus:font-semibold focus:rounded-sm
        "
      >
        Skip to main content
      </a>

      {/* App Shell */}
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          drafts={sidebarDrafts}
          onNewDeed={handleNewDeed}
          onEditDeed={handleEditDeed}
          onDeleteDeed={handleDeleteDeed}
          onNavigate={handleNavigate}
        />

        {/* Content Area */}
        <main
          id="mainContent"
          className="flex-1 overflow-y-auto bg-[var(--bg-main)] px-8 py-8 pb-12"
        >
          {/* ── Generator View ── */}
          {currentPage === 'generator' && (
            <div className="max-w-[820px] mx-auto">
              {/* Page header */}
              <div className="mb-6">
                <h2 className="font-display text-2xl text-navy-800 m-0 mb-1">
                  Partnership Deed
                </h2>
                <p className="text-navy-500 text-base m-0">
                  Fill in the details below to generate your deed
                </p>
              </div>

              {/* Progress bar */}
               <ProgressBar step={currentStep} />

               {/* Step tabs */}
               <WizardTabs currentStep={currentStep} onStepClick={goToStep} />

              {/* Form card */}
              <div className="bg-white rounded-[10px] border-l-[3px] border-l-accent border border-navy-100 p-6 md:p-8 shadow-card">
                {currentStep === 0 && <Step0Partners onNext={nextStep} />}
                {currentStep === 1 && <Step1Business onPrev={prevStep} onNext={nextStep} />}
                {currentStep === 2 && <Step2Clauses onPrev={prevStep} onNext={nextStep} />}
                {currentStep === 3 && <Step3Review onPrev={prevStep} />}
              </div>
            </div>
          )}

          {/* ── History View ── */}
          {currentPage === 'history' && (
            <div className="max-w-[1200px] mx-auto">
              {/* Page header */}
              <div className="mb-6">
                <h2 className="font-display text-2xl text-navy-800 m-0 mb-1">
                  Deed History
                </h2>
                <p className="text-navy-500 text-base m-0">
                  View and manage your saved partnership deeds
                </p>
              </div>

              <DeedGrid onViewDeed={handleViewDeed} />
            </div>
          )}
        </main>

        {/* ── AI Chat Panel (right side, generator view only) ── */}
        {currentPage === 'generator' && chatOpen && (
          <aside className="w-[360px] shrink-0 h-full border-l border-navy-100 bg-white hidden lg:block">
            <ChatPanel
              onExtractedData={handleExtractedData}
              onClose={() => setChatOpen(false)}
              messages={chatMessages}
              setMessages={setChatMessages}
              latestExtractedData={chatExtractedData}
              setLatestExtractedData={setChatExtractedData}
            />
          </aside>
        )}
      </div>

      {/* ── AI Chat Toggle FAB (generator view only, when panel is closed) ── */}
      {currentPage === 'generator' && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="
            fixed bottom-6 right-6 z-50
            flex items-center gap-2 px-4 py-3
            bg-navy-900 text-white
            rounded-full shadow-lg
            hover:bg-navy-800 hover:shadow-xl
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
            lg:flex
          "
          aria-label="Open AI Assistant"
        >
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">AI Assistant</span>
        </button>
      )}

      {/* ── Mobile Chat Panel (overlay for small screens) ── */}
      {currentPage === 'generator' && chatOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setChatOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-[400px] bg-white shadow-2xl">
            <ChatPanel
              onExtractedData={handleExtractedData}
              onClose={() => setChatOpen(false)}
              messages={chatMessages}
              setMessages={setChatMessages}
              latestExtractedData={chatExtractedData}
              setLatestExtractedData={setChatExtractedData}
            />
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        deedId={modalDeedId}
        onClose={() => setModalDeedId(null)}
        onRefresh={fetchDeeds}
      />
    </>
  );
}
