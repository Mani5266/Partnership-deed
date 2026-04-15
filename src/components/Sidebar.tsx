// ── Sidebar Component ────────────────────────────────────────────────────────
// OnEasy dark sidebar with logo, new deed button, draft list, nav, and logout.
// Ported from index.html sidebar structure and layout.css styles.

'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWizardStore } from '@/hooks/useWizardStore';
import type { Deed } from '@/types';

interface SidebarProps {
  drafts: Deed[];
  onNewDeed: () => void;
  onEditDeed: (id: string) => void;
  onDeleteDeed: (id: string) => void;
  onNavigate: (page: 'generator' | 'history') => void;
}

export function Sidebar({
  drafts,
  onNewDeed,
  onEditDeed,
  onDeleteDeed,
  onNavigate,
}: SidebarProps) {
  const { email, signOut } = useAuth();
  const currentPage = useWizardStore((s) => s.currentPage);
  const currentDeedId = useWizardStore((s) => s.currentDeedId);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = useCallback(
    (page: 'generator' | 'history') => {
      onNavigate(page);
      setMobileOpen(false);
    },
    [onNavigate]
  );

  const handleDraftClick = useCallback(
    (id: string) => {
      onEditDeed(id);
      setMobileOpen(false);
    },
    [onEditDeed]
  );

  const handleNewDeed = useCallback(() => {
    onNewDeed();
    setMobileOpen(false);
  }, [onNewDeed]);

  const handleLogout = useCallback(async () => {
    await signOut();
    window.location.href = '/login';
  }, [signOut]);

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="
          fixed top-4 left-4 z-[200]
          bg-white border border-navy-200 rounded-sm
          w-11 h-11 flex flex-col items-center justify-center gap-1
          shadow-sm md:hidden
        "
        aria-label="Toggle menu"
      >
        <span className="w-5 h-0.5 bg-navy-800 rounded-full" />
        <span className="w-5 h-0.5 bg-navy-800 rounded-full" />
        <span className="w-5 h-0.5 bg-navy-800 rounded-full" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[90] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-[280px] min-w-[280px] bg-sidebar-bg text-sidebar-text
          flex flex-col justify-between z-[100]
          md:relative md:left-0
          fixed top-0 h-screen transition-[left] duration-300 ease
          ${mobileOpen ? 'left-0' : '-left-[280px]'}
        `}
      >
        {/* ── Top Section ── */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#1e293b" />
              <text
                x="50%"
                y="54%"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#f0b929"
                fontSize="22"
                fontWeight="bold"
                fontFamily="DM Serif Display, serif"
              >
                O
              </text>
            </svg>
            <div className="leading-tight">
              <span className="font-display text-lg font-bold tracking-wide text-sidebar-text block">
                OnEasy
              </span>
              <span className="text-2xs font-medium tracking-wide text-accent">
                Partnership Deed
              </span>
            </div>
          </div>

          {/* New Deed Button */}
          <button
            onClick={handleNewDeed}
            className="
              w-full flex items-center justify-center gap-2
              px-5 py-3 rounded-sm text-sm font-medium
              bg-primary text-white border border-transparent
              hover:bg-primary-light hover:-translate-y-px
              transition-all duration-200 mb-6
            "
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="2" x2="8" y2="14" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            New Partnership Deed
          </button>

          {/* Recent Drafts */}
          <div className="text-2xs uppercase tracking-[0.1em] text-sidebar-muted font-semibold mb-3 pl-1">
            Recent Drafts
          </div>

          <div className="flex flex-col gap-1">
            {drafts.length === 0 ? (
              <p className="text-[0.82rem] text-sidebar-muted italic text-center opacity-70 py-4">
                No saved deeds yet...
              </p>
            ) : (
              drafts.map((d) => (
                <div
                  key={d.id}
                  className={`
                    flex items-center gap-2 px-3 py-3 rounded-sm text-[0.82rem]
                    border border-transparent cursor-pointer
                    hover:bg-sidebar-hover group
                    transition-all duration-200
                    ${d.id === currentDeedId ? 'bg-sidebar-active border-sidebar-border' : ''}
                  `}
                >
                  <span
                    className="flex-1 truncate"
                    onClick={() => handleDraftClick(d.id)}
                  >
                    {d.business_name || 'Untitled'}
                  </span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDraftClick(d.id);
                      }}
                      className="p-1 rounded-sm text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover"
                      title="Edit"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDeed(d.id);
                      }}
                      className="p-1 rounded-sm text-sidebar-muted hover:text-red-400 hover:bg-red-500/10"
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Footer Section ── */}
        <div className="px-5 pb-5 pt-3">
          <div className="h-px bg-sidebar-border mb-4" />

          {/* Email */}
          <div className="text-[0.82rem] text-sidebar-muted truncate mb-3">
            {email}
          </div>

          {/* Nav Buttons */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => handleNav('generator')}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                px-2 py-2 rounded-sm text-[0.82rem] border border-transparent
                transition-all duration-200
                ${
                  currentPage === 'generator'
                    ? 'bg-sidebar-active border-sidebar-border text-sidebar-text'
                    : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text'
                }
              `}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Generator
            </button>
            <button
              onClick={() => handleNav('history')}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                px-2 py-2 rounded-sm text-[0.82rem] border border-transparent
                transition-all duration-200
                ${
                  currentPage === 'history'
                    ? 'bg-sidebar-active border-sidebar-border text-sidebar-text'
                    : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text'
                }
              `}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              History
            </button>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="
              w-full flex items-center justify-center gap-2
              px-3 py-3 rounded-[10px] text-[0.82rem] font-medium
              border border-sidebar-border text-sidebar-muted
              hover:bg-sidebar-hover hover:text-sidebar-text
              transition-all duration-200
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
