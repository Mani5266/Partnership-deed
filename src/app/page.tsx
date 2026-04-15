// -- Main App Page ------------------------------------------------------------
// Renders the app shell: Sidebar + content area.
// Switches between Generator (wizard) and History (deed grid) views
// based on useWizardStore.currentPage — matching legacy SPA behavior.

'use client';

import React, { useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ProgressBar, WizardTabs } from '@/components/WizardTabs';
import { Step0Partners } from '@/components/Step0Partners';
import { Step1Business } from '@/components/Step1Business';
import { Step2Clauses } from '@/components/Step2Clauses';
import { Step3Review } from '@/components/Step3Review';
import { DeedGrid } from '@/components/DeedGrid';
import DetailModal from '@/components/DetailModal';
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
  const [modalDeedId, setModalDeedId] = React.useState<string | null>(null);

  // ── Fetch deeds on mount ──
  useEffect(() => {
    fetchDeeds();
  }, [fetchDeeds]);

  // ── Sidebar handlers ──
  const handleNewDeed = useCallback(() => {
    resetForm();
    switchPage('generator');
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
