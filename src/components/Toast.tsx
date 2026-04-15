// ── Toast Notification System ─────────────────────────────────────────────────
// Context-based toast system matching OnEasy's toast design.

'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const TOAST_DURATION = 4000;

const toastIcons: Record<ToastType, string> = {
  success: '\u2714',
  error: '\u2718',
  warning: '\u26A0',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setRemoving((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), TOAST_DURATION);
    },
    [removeToast]
  );

  const typeStyles: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-5 right-5 z-[9999] max-w-[400px] flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              flex items-center justify-between gap-3
              px-5 py-4 rounded-[10px] border text-[0.82rem] leading-snug
              shadow-lg
              ${typeStyles[toast.type]}
              ${removing.has(toast.id)
                ? 'animate-[toastOut_0.2s_ease_forwards]'
                : 'animate-[toastIn_0.3s_ease]'
              }
            `}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">{toastIcons[toast.type]}</span>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-lg opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer leading-none"
              aria-label="Close notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
