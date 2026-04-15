// -- Main App Page ------------------------------------------------------------
// Renders the app shell: Sidebar | AI Chat Panel (inline) | Main Content.
// Switches between Generator (wizard) and History (deed grid) views
// based on useWizardStore.currentPage — matching legacy SPA behavior.
// Layout matches Networth Agent 3-column pattern:
//   Left sidebar → Middle chat panel (toggleable) → Right form content.

'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  const { saveNow } = useAutoSave();

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
  const handleNewDeed = useCallback(async () => {
    // Save the current deed before resetting (if there's meaningful data)
    const state = useWizardStore.getState();
    const hasData = state.businessName || state.partners.some((p) => p.name.trim());
    if (hasData) {
      try {
        await saveNow();
        // Refresh sidebar so the saved deed appears
        fetchDeeds();
      } catch {
        // Save failed — still allow creating a new deed
      }
    }

    resetForm();
    switchPage('generator');
    // Reset chat when starting a new deed
    setChatMessages([]);
    setChatExtractedData({});
  }, [resetForm, switchPage, saveNow, fetchDeeds]);

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

  // ── Toggle chat panel ──
  const handleToggleChat = useCallback(() => {
    setChatOpen((v) => !v);
  }, []);

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

      {/* App Shell — fixed to viewport, prevents body scroll */}
      <div className="fixed inset-0 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          drafts={sidebarDrafts}
          onNewDeed={handleNewDeed}
          onEditDeed={handleEditDeed}
          onDeleteDeed={handleDeleteDeed}
          onNavigate={handleNavigate}
          onToggleChat={handleToggleChat}
        />

        {/* Main area — flex row: chat panel + form content, pinned to viewport height */}
        <main
          id="mainContent"
          className="flex-1 flex flex-col lg:flex-row min-w-0 h-full overflow-hidden"
        >
          {/* ── AI Chat Panel (inline middle column on desktop, overlay on mobile) ── */}
          {currentPage === 'generator' && chatOpen && (
            <>
              {/* Mobile overlay backdrop */}
              <div
                className="lg:hidden fixed inset-0 z-40 bg-black/50"
                onClick={() => setChatOpen(false)}
                aria-hidden="true"
              />
              <div
                className="
                  fixed inset-0 z-50
                  lg:relative lg:inset-auto lg:z-auto
                  lg:w-[340px] lg:min-w-[280px] lg:max-w-[380px] lg:shrink-0
                  lg:border-r lg:border-navy-100
                  lg:h-full lg:overflow-hidden
                "
              >
                <ChatPanel
                  onExtractedData={handleExtractedData}
                  onClose={() => setChatOpen(false)}
                  messages={chatMessages}
                  setMessages={setChatMessages}
                  latestExtractedData={chatExtractedData}
                  setLatestExtractedData={setChatExtractedData}
                />
              </div>
            </>
          )}

          {/* ── Form / Content area — flex column: sticky header + scrollable form ── */}
          <div
            className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--bg-main)]"
          >
            {/* ── Generator View ── */}
            {currentPage === 'generator' && (
              <>
                {/* Sticky header: title + progress + tabs — does NOT scroll */}
                <div className="shrink-0 px-4 pt-6 lg:px-8 lg:pt-8">
                  <div className="max-w-[820px] mx-auto">
                    {/* Page header */}
                    <div className="mb-4">
                      <h2 className="font-display text-2xl text-navy-800 m-0 mb-1">
                        Partnership Deed
                      </h2>
                      <div className="flex items-center gap-3">
                        <p className="text-navy-500 text-base m-0">
                          Fill in the details below to generate your deed
                        </p>
                        <button
                          onClick={handleToggleChat}
                          className="text-xs font-semibold text-accent hover:text-accent-dark whitespace-nowrap transition-colors"
                        >
                          {chatOpen ? 'close AI panel' : 'or fill with AI'}
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <ProgressBar step={currentStep} />

                    {/* Step tabs */}
                    <WizardTabs currentStep={currentStep} onStepClick={goToStep} />
                  </div>
                </div>

                {/* Scrollable form card — ONLY this part scrolls */}
                <div className="flex-1 overflow-y-auto px-4 pb-12 lg:px-8">
                  <div className="max-w-[820px] mx-auto">
                    <div className="bg-white rounded-[10px] border-l-[3px] border-l-accent border border-navy-100 p-6 md:p-8 shadow-card">
                      {currentStep === 0 && <Step0Partners onNext={nextStep} />}
                      {currentStep === 1 && <Step1Business onPrev={prevStep} onNext={nextStep} />}
                      {currentStep === 2 && <Step2Clauses onPrev={prevStep} onNext={nextStep} />}
                      {currentStep === 3 && <Step3Review onPrev={prevStep} />}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── History View ── */}
            {currentPage === 'history' && (
              <div className="flex-1 overflow-y-auto px-4 py-8 lg:px-8 lg:py-8 pb-12">
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
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Detail Modal */}
      <DetailModal
        deedId={modalDeedId}
        onClose={() => setModalDeedId(null)}
        onRefresh={fetchDeeds}
      />
    </>
  );
}
