import React, { createContext, useContext, useMemo, useRef, useState } from 'react';

const LoggerCtx = createContext(null);

export function LoggerProvider({ children }) {
  const [logs, setLogs] = useState([]); // {id, time, level, message, meta}
  const [open, setOpen] = useState(false);
  const idRef = useRef(1);

  const push = (level, message, meta) => {
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
  }), [logs, open]);

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
