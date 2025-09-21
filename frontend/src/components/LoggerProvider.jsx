import React, { createContext, useContext, useMemo, useRef, useState, useEffect } from 'react';

const LoggerCtx = createContext(null);

export function LoggerProvider({ children }) {
  const [logs, setLogs] = useState([]); // {id, time, level, message, meta}
  const [open, setOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(() => {
    try { return localStorage.getItem('tcb-debug') === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('tcb-debug', debugEnabled ? '1' : '0'); } catch {} }, [debugEnabled]);
  const idRef = useRef(1);

  const push = (level, message, meta) => {
    if (level === 'debug' && !debugEnabled) return; // skip if debug disabled
    setLogs(prev => {
      const next = [...prev, { id: idRef.current++, time: Date.now(), level, message: String(message ?? ''), meta }];
      // Cap to last 500 entries
      if (next.length > 500) next.shift();
      return next;
    });
  };

  const api = useMemo(() => ({
    logs,
    open,
    setOpen,
    debugEnabled,
    setDebug: (v) => setDebugEnabled(Boolean(v)),
    toggleDebug: () => setDebugEnabled(d => !d),
    log: (msg, meta) => push('info', msg, meta),
    info: (msg, meta) => push('info', msg, meta),
    warn: (msg, meta) => push('warn', msg, meta),
    error: (msg, meta) => push('error', msg, meta),
    debug: (msg, meta) => push('debug', msg, meta),
    clear: () => setLogs([]),
    export: () => {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'app-logs.json'; a.click();
      URL.revokeObjectURL(url);
    }
  }), [logs, open, debugEnabled]);

  useEffect(() => {
    try { window.__tcbLogger = api; } catch {}
  }, [api]);

  return (
    <LoggerCtx.Provider value={api}>
      {children}
    </LoggerCtx.Provider>
  );
}

export function useLogger() {
  const ctx = useContext(LoggerCtx);
  if (!ctx) throw new Error('useLogger must be used within LoggerProvider');
  return ctx;
}

export default LoggerProvider;
