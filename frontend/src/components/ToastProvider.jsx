import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);
  const push = useCallback((type, message, timeout = 3000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, type, message }]);
    if (timeout > 0) setTimeout(() => remove(id), timeout);
  }, [remove]);

  const api = useMemo(() => ({
    success: (m, t) => push('success', m, t),
    error: (m, t) => push('error', m, t),
    info: (m, t) => push('info', m, t),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="w-full flex flex-col gap-2">
          {toasts.map(t => {
            const isError = t.type === 'error';
            const isSuccess = t.type === 'success';
            const icon = isError ? 'error' : isSuccess ? 'check_circle' : 'info';
            const title = isError ? 'Error' : isSuccess ? 'Success' : 'Info';
            const bg = isError
              ? 'bg-gradient-to-r from-rose-500 to-orange-500'
              : isSuccess
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
              : 'bg-gradient-to-r from-indigo-500 to-sky-500';
            const role = isError ? 'alert' : 'status';
            return (
              <div key={t.id} role={role} aria-live={isError ? 'assertive' : 'polite'}
                   className={`pointer-events-auto ${bg} text-white shadow-md w-full px-4 py-3`}> 
                <div className="max-w-5xl mx-auto flex items-center gap-3">
                  <span className="mi" aria-hidden>{icon}</span>
                  <div className="flex-1">
                    <span className="font-medium mr-1">{title}:</span>
                    <span>{t.message}</span>
                  </div>
                  <button
                    className="toggle-btn toggle-off text-white/90 hover:text-white"
                    title="Dismiss"
                    aria-label="Dismiss notification"
                    onClick={() => remove(t.id)}
                  >
                    <span className="mi">close</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
