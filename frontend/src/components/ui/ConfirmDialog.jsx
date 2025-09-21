import React, { useEffect } from 'react';

/**
 * Reusable confirmation dialog.
 * Props:
 *  open: boolean
 *  title: string
 *  message: string | ReactNode
 *  confirmLabel?: string (default 'Confirm')
 *  cancelLabel?: string (default 'Cancel')
 *  variant?: 'danger' | 'primary' | 'default'
 *  busy?: boolean (show spinner on confirm)
 *  onConfirm: () => (void | Promise<void>)
 *  onCancel: () => void
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
      if (e.key === 'Enter') {
        // Allow enter to confirm if not busy
        if (!busy) { onConfirm?.(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onConfirm, onCancel, busy]);

  if (!open) return null;

  const variantClass = variant === 'danger'
    ? 'btn btn-danger'
    : variant === 'primary'
      ? 'btn btn-primary'
      : 'btn btn-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onCancel?.()} aria-hidden></div>
      <div role="dialog" aria-modal="true" className="relative w-[min(90vw,420px)] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded shadow-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`} aria-hidden>
            <span className="mi">{variant === 'danger' ? 'warning' : 'help'}</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg leading-snug mb-1">{title}</h3>
            <div className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
              {typeof message === 'string' ? <p>{message}</p> : message}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn btn-secondary disabled:opacity-50" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={`${variantClass} disabled:opacity-50`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy && <span className="spinner mr-1" aria-hidden />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
