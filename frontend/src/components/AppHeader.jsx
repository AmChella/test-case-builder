import React from 'react';
import { useLogger } from './LoggerProvider';

export default function AppHeader() {
  const { setOpen } = useLogger();
  return (
    <header className="sticky top-0 z-50 backdrop-blur border-b"
      style={{
        backgroundImage: 'linear-gradient(90deg, rgba(99,102,241,0.9) 0%, rgba(34,197,94,0.9) 100%)',
        color: '#ffffff'
      }}
    >
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="fa-stack" aria-hidden>
          <i className="fa-solid fa-square fa-stack-2x" style={{ color: 'rgba(255,255,255,0.2)' }}></i>
          <strong className="fa-stack-1x fa-inverse text-[10px] tracking-wider">TCB</strong>
        </span>
        <div>
          <div className="text-lg font-semibold leading-tight">Test Case Builder</div>
          <div className="text-[12px] opacity-85 leading-tight">Manage, run, and validate your UI test scenarios</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="icon-btn" style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }} onClick={() => setOpen(true)} title="Open Logs" aria-label="Open Logs">
            <i className="fa-solid fa-terminal"></i>
            <span className="hidden sm:inline">Logs</span>
          </button>
        </div>
      </div>
    </header>
  );
}
