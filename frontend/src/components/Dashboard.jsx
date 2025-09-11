import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTestcases, deleteTestcase, createTestcases, updateTestcase } from '../api';
import TestCaseForm from './TestCaseForm';
import BatchCreate from './BatchCreate';
import { useToast } from './ToastProvider';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [isOverDropzone, setIsOverDropzone] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [mode, setMode] = useState('single'); // 'single' | 'batch'
  const [sidebarOpen, setSidebarOpen] = useState(true); // collapsible list panel

  useEffect(() => { load(); }, []);
  const load = async () => { const data = await fetchTestcases(); setItems(data); };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      const matches = !q || it.description?.toLowerCase().includes(q) || String(it.testOrder || '').includes(q);
      const enabledOk = !showEnabledOnly || it.enabled;
      return matches && enabledOk;
    });
  }, [items, query, showEnabledOnly]);

  const exportAll = () => {
    const payload = items.map(({ filename, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOne = (it) => {
    const { filename, ...rest } = it;
    const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'testcase.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Open a test case in editor; if currently in batch mode, switch to single and notify
  const openForEdit = (it) => {
    if (mode === 'batch') {
      setMode('single');
      const name = it.description || `#${it.testOrder}`;
      toast.info(`Switched to Single mode to edit: ${name}`);
    }
    setEditing({ ...it, filename: it.filename });
  };

  const onPickImport = () => fileRef.current?.click();
  const onImportFiles = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
  await createTestcases(json);
  await load();
  toast.success('Imported test case(s) successfully');
    } catch (err) {
      console.error(err);
  toast.error('Import failed — ' + (err?.response?.data?.error || err.message));
    } finally {
      e.target.value = '';
    }
  };

  // Drag-and-drop import area
  const onDropImport = async (e) => {
    e.preventDefault();
    setIsOverDropzone(false);
    try {
      const files = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/json' || f.name.endsWith('.json'));
      if (!files.length) return;
      const texts = await Promise.all(files.map(f => f.text()));
      const payload = texts.flatMap(t => {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : [parsed];
      });
  await createTestcases(payload);
  await load();
  toast.success('Imported test case(s) successfully');
    } catch (err) {
      console.error(err);
  toast.error('Import failed — ' + (err?.response?.data?.error || err.message));
    }
  };

  // Selection helpers for bulk actions
  const toggleSelect = (filename) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map(i => i.filename)));
  const clearSelection = () => setSelected(new Set());

  // Bulk delete
  const deleteSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected item(s)?`)) return;
  await Promise.all(Array.from(selected).map(fn => deleteTestcase(fn)));
    clearSelection();
  await load();
  toast.success('Deleted selected test case(s)');
  };

  // Duplicate actions
  const duplicateOne = async (it) => {
    const { filename, ...content } = it;
  await createTestcases({ ...content });
  await load();
  toast.success('Duplicated test case');
  };
  const duplicateSelected = async () => {
    const toDup = items.filter(i => selected.has(i.filename)).map(({ filename, ...content }) => content);
    if (!toDup.length) return;
  await createTestcases(toDup);
    clearSelection();
  await load();
  toast.success('Duplicated selected test case(s)');
  };

  // Drag-and-drop reordering within list
  const onDragStart = (index) => setDragIndex(index);
  const onDragOver = (e, overIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === overIndex) return;
  };
  const onDropReorder = async (e, overIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === overIndex) return;
    const prevOrderByFile = new Map(items.map(it => [it.filename, it.testOrder]));
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    // Reassign testOrder based on new position (1-based)
    const reassigned = next.map((it, idx) => ({ ...it, testOrder: idx + 1 }));
    setItems(reassigned);
    setDragIndex(null);
    // Persist only changed items
    try {
      setSavingOrder(true);
      const changed = reassigned.filter(it => prevOrderByFile.get(it.filename) !== it.testOrder);
      await Promise.all(changed.map(it => updateTestcase(it.filename, { description: it.description, enabled: it.enabled, testSteps: it.testSteps, testOrder: it.testOrder })));
    } catch (err) {
      console.error(err);
  toast.error('Failed to save order — ' + (err?.response?.data?.error || err.message));
      await load();
    } finally {
      setSavingOrder(false);
    }
  };

  // Keyboard/mouse move helpers
  const moveItem = async (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const prevOrderByFile = new Map(items.map(it => [it.filename, it.testOrder]));
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const reassigned = next.map((it, idx) => ({ ...it, testOrder: idx + 1 }));
    setItems(reassigned);
    try {
      setSavingOrder(true);
      const changed = reassigned.filter(it => prevOrderByFile.get(it.filename) !== it.testOrder);
      await Promise.all(changed.map(it => updateTestcase(it.filename, { description: it.description, enabled: it.enabled, testSteps: it.testSteps, testOrder: it.testOrder })));
    } catch (err) {
      console.error(err);
  toast.error('Failed to save order — ' + (err?.response?.data?.error || err.message));
      await load();
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          className={`icon-btn ${sidebarOpen ? 'icon-primary' : 'icon-muted'}`}
          onClick={() => setSidebarOpen(v => !v)}
          title={sidebarOpen ? 'Hide test list' : 'Show test list'}
          aria-label="Toggle test list"
          aria-expanded={sidebarOpen}
        >
          <span className="mi">{sidebarOpen ? 'menu_open' : 'menu'}</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold">Test Cases</h1>
          <p className="text-sm text-gray-500">Create, import, export, and order your test cases</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="rounded border overflow-hidden" role="tablist" aria-label="Mode">
            <button className={`icon-btn icon-muted ${mode === 'single' ? 'icon-indigo' : ''}`} onClick={() => setMode('single')} title="Single create/edit" aria-label="Single mode"><span className="mi">edit_note</span></button>
            <button className={`icon-btn icon-muted ${mode === 'batch' ? 'icon-indigo' : ''}`} onClick={() => setMode('batch')} title="Batch create" aria-label="Batch mode"><span className="mi">view_module</span></button>
          </div>
          <button className="icon-btn icon-add" onClick={() => setEditing(null)} title="New test case" aria-label="New"><span className="mi">add</span></button>
          <button className="icon-btn icon-warning" onClick={onPickImport} title="Import JSON" aria-label="Import"><span className="mi">upload</span></button>
          <button className="icon-btn icon-success" onClick={exportAll} title="Export all" aria-label="Export all"><span className="mi">download</span></button>
          <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={onImportFiles} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by description or order..."
            className="w-full px-3 py-2 border rounded bg-white"
          />
        </div>
        <label className="text-sm text-gray-700 flex items-center gap-2">
          <input type="checkbox" checked={showEnabledOnly} onChange={e => setShowEnabledOnly(e.target.checked)} /> Enabled only
        </label>
        {savingOrder && <span className="text-sm text-gray-500">Saving order…</span>}
      </div>

      {/* Dropzone for import */}
      <div
        className={`mt-4 p-4 border-2 border-dashed rounded bg-white ${isOverDropzone ? 'bg-gray-100' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsOverDropzone(true); }}
        onDragLeave={() => setIsOverDropzone(false)}
        onDrop={onDropImport}
        aria-label="Drop JSON files here to import"
      >
        <span className="text-sm text-gray-600">Drag and drop JSON file(s) here to import</span>
      </div>

      {/* Content */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* List column */}
        {sidebarOpen && (
        <div className="md:col-span-1">
          {/* Bulk bar */}
          <div className="flex items-center gap-2 mb-2">
            <button className="icon-btn icon-muted" onClick={selectAll} title="Select all" aria-label="Select all"><span className="mi">select_check_box</span></button>
            <button className="icon-btn icon-muted" onClick={clearSelection} title="Clear selection" aria-label="Clear selection"><span className="mi">clear_all</span></button>
            <button className="icon-btn icon-danger disabled:opacity-50" onClick={deleteSelected} disabled={!selected.size} title="Delete selected" aria-label="Delete selected"><span className="mi">delete</span></button>
            <button className="icon-btn icon-primary disabled:opacity-50" onClick={duplicateSelected} disabled={!selected.size} title="Duplicate selected" aria-label="Duplicate selected"><span className="mi">content_copy</span></button>
          </div>
          <div className="bg-white border rounded divide-y">
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No test cases match your search.</div>
            )}
            {filtered.map((it, idx) => {
              const originalIndex = items.findIndex(x => x.filename === it.filename);
              const isActive = editing?.filename === it.filename;
              return (
                <div
                  key={it.filename}
                  className={`p-3 flex items-start gap-3 cursor-pointer ${isActive ? 'bg-blue-50' : ''}`}
                  draggable
                  onDragStart={() => onDragStart(originalIndex)}
                  onDragOver={(e) => onDragOver(e, originalIndex)}
                  onDrop={(e) => onDropReorder(e, originalIndex)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveItem(originalIndex, originalIndex - 1); }
                    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveItem(originalIndex, originalIndex + 1); }
                  }}
                  onClick={() => openForEdit(it)}
                >
          <input type="checkbox" className="mt-1" checked={selected.has(it.filename)} onChange={(e) => { e.stopPropagation(); toggleSelect(it.filename); }} title="Select" aria-label="Select" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs inline-block px-1.5 py-0.5 rounded bg-gray-100 border">#{it.testOrder}</span>
                      <span className={`toggle-btn ${it.enabled ? 'toggle-on' : 'toggle-off'}`} aria-label="Enabled state" title={it.enabled ? 'Enabled' : 'Disabled'}>
                        <span className="mi">{it.enabled ? 'toggle_on' : 'toggle_off'}</span>
                      </span>
                    </div>
                    <div className="font-medium truncate">{it.description}</div>
                    <div className="mt-1 flex gap-2 text-sm text-gray-700 items-center">
                      <span className={`toggle-btn ${it.enabled ? 'toggle-on' : 'toggle-off'}`} title={it.enabled ? 'Enabled' : 'Disabled'} aria-label="Enabled state"><span className="mi">{it.enabled ? 'toggle_on' : 'toggle_off'}</span></span>
                      <button className="icon-btn icon-muted" title="Edit" aria-label="Edit" onClick={(e) => { e.stopPropagation(); openForEdit(it); }}><span className="mi">edit</span></button>
                      <button className="icon-btn icon-success" title="Export" aria-label="Export" onClick={(e) => { e.stopPropagation(); exportOne(it); }}><span className="mi">download</span></button>
                      <button className="icon-btn icon-primary" title="Duplicate" aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateOne(it); }}><span className="mi">content_copy</span></button>
                      <button className="icon-btn icon-danger" title="Delete" aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteTestcase(it.filename).then(load).then(() => toast.success('Deleted')); }}><span className="mi">delete</span></button>
                    </div>
                  </div>
                  <span className="icon-btn icon-muted cursor-grab select-none" title="Drag to reorder" aria-label="Drag handle"><span className="mi">drag_indicator</span></span>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Editor column */}
        <div className={sidebarOpen ? "md:col-span-2" : "md:col-span-3"}>
          <div className="bg-white border rounded p-4">
            {mode === 'single' ? (
              <>
                <div className="flex items-center mb-3">
                  <h2 className="text-lg font-semibold mr-auto">{editing?.filename ? 'Edit Test Case' : 'New Test Case'}</h2>
                  {editing?.filename && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border">{editing.filename}</span>
                  )}
                </div>
                <TestCaseForm key={editing?.filename || 'new'} existing={editing} onSaved={() => { setEditing(null); load(); }} />
              </>
            ) : (
              <>
                <div className="flex items-center mb-3">
                  <h2 className="text-lg font-semibold mr-auto">Batch Create</h2>
                </div>
                <BatchCreate onSaved={() => { setEditing(null); load(); }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
