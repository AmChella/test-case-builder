import React, { useMemo, useState } from 'react';
import { useLogger } from './LoggerProvider';

const levelColors = {
  info: 'text-blue-700 bg-blue-50 border-blue-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  error: 'text-red-700 bg-red-50 border-red-200',
  debug: 'text-gray-700 bg-gray-50 border-gray-200',
};

export default function LogConsole() {
  const { logs, open, setOpen, clear, export: exportLogs } = useLogger();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const items = useMemo(() => {
    return logs.filter(l => (filter === 'all' || l.level === filter) && (!q || l.message.toLowerCase().includes(q.toLowerCase())));
  }, [logs, filter, q]);

  const fmtTime = (t) => new Date(t).toLocaleTimeString();

  return (
    <div className="fixed bottom-3 right-3 z-40">
      {!open && (
        <button className="icon-btn icon-indigo" title="Open Logs" aria-label="Open logs" onClick={() => setOpen(true)}>
          <span className="mi">terminal</span>
        </button>
      )}
      {open && (
        <div className="w-[min(90vw,800px)] h-[min(60vh,480px)] bg-white border rounded shadow-xl flex flex-col">
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <span className="mi">terminal</span>
            <strong className="mr-auto">TCB Logs</strong>
            <select className="border rounded px-2 py-1 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
            </select>
            <input className="border rounded px-2 py-1 text-sm" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
            <button className="icon-btn icon-warning" onClick={clear} title="Clear logs" aria-label="Clear logs"><span className="mi">backspace</span></button>
            <button className="icon-btn icon-success" onClick={exportLogs} title="Export logs" aria-label="Export logs"><span className="mi">download</span></button>
            <button className="icon-btn icon-muted" onClick={() => setOpen(false)} title="Close" aria-label="Close"><span className="mi">close</span></button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {items.length === 0 && (
              <div className="text-sm text-gray-500 px-2">No logs</div>
            )}
            {items.map(l => (
              <div key={l.id} className={`text-sm border rounded px-2 py-1 ${levelColors[l.level] || levelColors.debug}`}>
                <span className="text-xs text-gray-500 mr-2">{fmtTime(l.time)}</span>
                <span className="uppercase text-xs font-semibold mr-2">{l.level}</span>
                <span>{l.message}</span>
                {l.meta && (
                  <details className="mt-1">
                    <summary className="text-xs text-gray-600 cursor-pointer">Details</summary>
                    <pre className="text-xs overflow-auto bg-gray-50 border rounded p-2"><code>{JSON.stringify(l.meta, null, 2)}</code></pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
