import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTestcases, deleteTestcase, createTestcases, updateTestcase, runTest, fetchProducts, createProduct, deleteProduct } from '../api';
import TestCaseForm from './TestCaseForm';
import BatchCreate from './BatchCreate';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [isOverDropzone, setIsOverDropzone] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const toast = useToast();
  const logger = useLogger();
  const [query, setQuery] = useState('');
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [mode, setMode] = useState('single'); // 'single' | 'batch'
  const [sidebarOpen, setSidebarOpen] = useState(true); // collapsible list panel
  const [running, setRunning] = useState(null); // filename currently running
  const [runResult, setRunResult] = useState(null); // { ok, code, stdout, stderr, for }
  const [products, setProducts] = useState([]);
  const [currentProduct, setCurrentProduct] = useState('All');
  // Add-product modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  // Helpers: human-readable time formatting
  const formatTimestamp = (ts) => {
    if (ts === null || ts === undefined) return '-';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };
  const formatDuration = (ms) => {
    if (ms === null || ms === undefined || isNaN(ms)) return '-';
    const val = Math.max(0, ms);
    if (val < 1000) return `${val} ms`;
    const s = val / 1000;
    if (s < 60) return `${s.toFixed(2)} s`;
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    return `${m}m ${rem.toFixed(1)}s`;
  };

  useEffect(() => { refreshProducts(); }, []);
  useEffect(() => { load(); }, [currentProduct]);
  const refreshProducts = async () => {
    try {
      const list = await fetchProducts();
      const names = ['All', 'General', ...list.map(p => p.name).filter(n => n !== 'General')];
      setProducts([...new Set(names)]);
    } catch {}
  };
  const load = async () => { const data = await fetchTestcases(currentProduct !== 'All' ? currentProduct : undefined); setItems(data); };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      const matches = !q || it.description?.toLowerCase().includes(q) || String(it.testOrder || '').includes(q);
      const enabledOk = !showEnabledOnly || it.enabled;
      return matches && enabledOk;
    });
  }, [items, query, showEnabledOnly]);

  // Group filtered items by product (defaulting to "General"), with General first, then alpha
  const groupedByProduct = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const prod = it.product || 'General';
      if (!map.has(prod)) map.set(prod, []);
      map.get(prod).push(it);
    }
    const groups = Array.from(map.entries());
    groups.sort(([a], [b]) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    });
    // sort each group by testOrder ascending
    groups.forEach(([, arr]) => arr.sort((x, y) => (x.testOrder ?? 0) - (y.testOrder ?? 0)));
    return groups; // [ [productName, items[]], ... ]
  }, [filtered]);

  const exportAll = () => {
    const payload = items.map(({ filename, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases.json';
    a.click();
    URL.revokeObjectURL(url);
    logger.info('Export all', { count: items.length });
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
    logger.info('Export one', { filename: it.filename });
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
      const items = Array.isArray(json) ? json : [json];
      const adjusted = items.map(p => ({ product: currentProduct !== 'All' ? (p.product || currentProduct) : (p.product || undefined), ...p }));
  await createTestcases(adjusted);
  await load();
  toast.success('Imported test case(s) successfully');
      logger.info('Import from file input', { count: Array.isArray(json) ? json.length : 1, name: file.name });
    } catch (err) {
      console.error(err);
  toast.error('Import failed — ' + (err?.response?.data?.error || err.message));
      logger.error('Import failed (file input)', { error: err?.response?.data?.error || err.message });
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
      // If a specific product is selected (not All), apply it to imported items that don't specify product
      const adjusted = payload.map(p => ({ product: currentProduct !== 'All' ? (p.product || currentProduct) : (p.product || undefined), ...p }));
  await createTestcases(adjusted);
  await load();
  toast.success('Imported test case(s) successfully');
      logger.info('Import via drop', { files: files.map(f => f.name), count: payload.length });
    } catch (err) {
      console.error(err);
  toast.error('Import failed — ' + (err?.response?.data?.error || err.message));
      logger.error('Import failed (drop)', { error: err?.response?.data?.error || err.message });
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
    logger.info('Deleted selected', { count: selected.size });
  };

  // Duplicate actions
  const duplicateOne = async (it) => {
    const { filename, ...content } = it;
  await createTestcases({ ...content });
  await load();
  toast.success('Duplicated test case');
    logger.info('Duplicated one', { source: filename });
  };
  const duplicateSelected = async () => {
    const toDup = items.filter(i => selected.has(i.filename)).map(({ filename, ...content }) => content);
    if (!toDup.length) return;
  await createTestcases(toDup);
    clearSelection();
  await load();
  toast.success('Duplicated selected test case(s)');
    logger.info('Duplicated selected', { count: toDup.length });
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
    // Reassign testOrder within each product group (1-based per product)
    const byProduct = new Map();
    next.forEach(it => { const p = it.product || 'General'; if (!byProduct.has(p)) byProduct.set(p, []); byProduct.get(p).push(it); });
    const reassigned = [];
    for (const [p, arr] of byProduct.entries()) {
      arr.forEach((it, idx) => reassigned.push({ ...it, testOrder: idx + 1 }));
    }
    setItems(reassigned);
    setDragIndex(null);
    // Persist only changed items
    try {
      setSavingOrder(true);
      const changed = reassigned.filter(it => prevOrderByFile.get(it.filename) !== it.testOrder);
      await Promise.all(changed.map(it => updateTestcase(it.filename, { description: it.description, enabled: it.enabled, testSteps: it.testSteps, testOrder: it.testOrder })));
      logger.info('Reorder saved', { changed: changed.length });
    } catch (err) {
      console.error(err);
  toast.error('Failed to save order — ' + (err?.response?.data?.error || err.message));
      logger.error('Reorder save failed', { error: err?.response?.data?.error || err.message });
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
    // Reassign testOrder within each product group (1-based per product)
    const byProduct = new Map();
    next.forEach(it => { const p = it.product || 'General'; if (!byProduct.has(p)) byProduct.set(p, []); byProduct.get(p).push(it); });
    const reassigned = [];
    for (const [p, arr] of byProduct.entries()) {
      arr.forEach((it, idx) => reassigned.push({ ...it, testOrder: idx + 1 }));
    }
    setItems(reassigned);
    try {
      setSavingOrder(true);
      const changed = reassigned.filter(it => prevOrderByFile.get(it.filename) !== it.testOrder);
      await Promise.all(changed.map(it => updateTestcase(it.filename, { description: it.description, enabled: it.enabled, testSteps: it.testSteps, testOrder: it.testOrder })));
      logger.info('Move saved', { changed: changed.length });
    } catch (err) {
      console.error(err);
  toast.error('Failed to save order — ' + (err?.response?.data?.error || err.message));
      logger.error('Move save failed', { error: err?.response?.data?.error || err.message });
      await load();
    } finally {
      setSavingOrder(false);
    }
  };

  return (
  <div className="p-6 min-h-screen">
      {/* Add Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !savingProduct && setShowProductModal(false)} aria-hidden></div>
          <div role="dialog" aria-modal="true" className="relative bg-white border rounded shadow-lg w-full max-w-md p-4 z-10">
            <div className="flex items-center mb-3">
              <h3 className="text-lg font-semibold mr-auto">Add Product</h3>
              <button className="icon-btn icon-muted" onClick={() => !savingProduct && setShowProductModal(false)} title="Close" aria-label="Close"><span className="mi">close</span></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); /* submit */ (async () => { if (!savingProduct) await (async () => { if (!newProductName.trim()) { toast.error('Product name is required'); return; } try { setSavingProduct(true); await createProduct({ name: newProductName.trim(), description: newProductDesc.trim() || undefined }); await refreshProducts(); setCurrentProduct(newProductName.trim()); setShowProductModal(false); toast.success('Product created'); } catch (err) { toast.error('Failed to create product — ' + (err?.response?.data?.error || err.message)); } finally { setSavingProduct(false); } })(); })(); } }}
                  placeholder="e.g. WebApp, Mobile, API"
                  className="w-full px-3 py-2 border rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  placeholder="Optional details about this product"
                  className="w-full px-3 py-2 border rounded bg-white min-h-[80px]"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowProductModal(false)} disabled={savingProduct}>Cancel</button>
              <button
                className="btn btn-primary disabled:opacity-50"
                disabled={savingProduct || !newProductName.trim()}
                onClick={async () => {
                  if (!newProductName.trim()) { toast.error('Product name is required'); return; }
                  try {
                    setSavingProduct(true);
                    await createProduct({ name: newProductName.trim(), description: newProductDesc.trim() || undefined });
                    await refreshProducts();
                    setCurrentProduct(newProductName.trim());
                    setShowProductModal(false);
                    toast.success('Product created');
                  } catch (err) {
                    toast.error('Failed to create product — ' + (err?.response?.data?.error || err.message));
                  } finally {
                    setSavingProduct(false);
                  }
                }}
              >
                {savingProduct ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Test Cases</h1>
          <p className="text-sm text-gray-500">Create, import, export, and order your test cases</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Product selector */}
          <div className="flex items-center gap-2">
            <select className="px-2 py-1 border rounded bg-white" value={currentProduct} onChange={(e) => setCurrentProduct(e.target.value)} title="Filter by product" aria-label="Filter by product">
              {products.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
            <button className="icon-btn icon-primary" title="Add product" aria-label="Add product" onClick={() => { setNewProductName(''); setNewProductDesc(''); setShowProductModal(true); }}><span className="mi">library_add</span></button>
            {currentProduct !== 'All' && currentProduct !== 'General' && (
              <button className="icon-btn icon-danger" title="Delete product" aria-label="Delete product" onClick={async () => {
                if (!confirm(`Delete product "${currentProduct}"? This does not delete test cases.`)) return;
                try {
                  await deleteProduct(currentProduct);
                  await refreshProducts();
                  setCurrentProduct('All');
                  toast.success('Product deleted');
                } catch (err) { toast.error('Failed to delete product — ' + (err?.response?.data?.error || err.message)); }
              }}><span className="mi">delete</span></button>
            )}
          </div>
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
            <button
              className="icon-btn icon-muted"
              onClick={() => setSidebarOpen(false)}
              title="Hide test list"
              aria-label="Hide test list"
            >
              <span className="mi">chevron_left</span>
            </button>
            <button className="icon-btn icon-muted" onClick={selectAll} title="Select all" aria-label="Select all"><span className="mi">select_check_box</span></button>
            <button className="icon-btn icon-muted" onClick={clearSelection} title="Clear selection" aria-label="Clear selection"><span className="mi">clear_all</span></button>
            <button className="icon-btn icon-danger disabled:opacity-50" onClick={deleteSelected} disabled={!selected.size} title="Delete selected" aria-label="Delete selected"><span className="mi">delete</span></button>
            <button className="icon-btn icon-primary disabled:opacity-50" onClick={duplicateSelected} disabled={!selected.size} title="Duplicate selected" aria-label="Duplicate selected"><span className="mi">content_copy</span></button>
          </div>
          <div className="bg-white border rounded divide-y">
            {groupedByProduct.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No test cases match your search.</div>
            )}
            {groupedByProduct.map(([prodName, group]) => (
              <React.Fragment key={`group-${prodName}`}>
                <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex items-center justify-between">
                  <span>{prodName}</span>
                  <span className="text-gray-400">{group.length}</span>
                </div>
                {group.map((it) => {
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
                        <div className="text-xs text-gray-500">Product: {it.product || 'General'}</div>
                        <div className="mt-1 flex gap-2 text-sm text-gray-700 items-center">
                          <button
                            className="icon-btn icon-danger disabled:opacity-50"
                            title="Run this test"
                            aria-label="Run test"
                            disabled={running === it.filename}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setRunResult(null);
                              setRunning(it.filename);
                              toast.info(`Running: ${it.description || it.filename}`);
                              logger.info('Run started', { filename: it.filename, description: it.description });
                              try {
                                const { filename, ...scenario } = it;
                                const res = await runTest({ scenarios: [scenario], headless: true });
                                // Normalize possible response shapes
                                let report = null;
                                if (Array.isArray(res)) report = res[0];
                                else if (Array.isArray(res?.reports)) report = res.reports[0];
                                else if (Array.isArray(res?.results)) report = res.results[0];
                                else if (Array.isArray(res?.scenarios)) report = res.scenarios[0];
                                else if (res?.report) report = res.report;
                                else if (res?.result) report = res.result;
                                else if (res?.data?.report) report = res.data.report;
                                else if (res?.title || res?.steps || res?.status || res?.location) report = res;

                                // Structured report handling
                                if (report && Array.isArray(report.steps)) {
                                  const allPassed = ((report.status || '').toLowerCase() === 'passed') || report.steps.every(s => s.status === 'passed');
                                  // Convert string timestamps to numbers for duration rendering
                                  const startTime = typeof report.startTime === 'string' ? Date.parse(report.startTime) : report.startTime;
                                  const endTime = typeof report.endTime === 'string' ? Date.parse(report.endTime) : report.endTime;
                                  const steps = report.steps.map(s => ({
                                    ...s,
                                    startTime: typeof s.startTime === 'string' ? Date.parse(s.startTime) : s.startTime,
                                    endTime: typeof s.endTime === 'string' ? Date.parse(s.endTime) : s.endTime,
                                  }));
                                  setRunResult({ ok: allPassed, for: it.filename, ...report, startTime, endTime, steps });
                                  if (allPassed) {
                                    toast.success('Test run finished successfully');
                                    logger.info('Run succeeded', { filename: it.filename, steps: steps.length, passed: steps.filter(s => s.status === 'passed').length, durationMs: (endTime && startTime) ? (endTime - startTime) : undefined });
                                  } else {
                                    toast.error('Test run failed — see error panel');
                                    logger.warn('Run failed', { filename: it.filename, steps: steps.length, failed: steps.filter(s => s.status !== 'passed').length, status: report.status });
                                  }
                                } else {
                                  // Fallback to CLI-like output
                                  const code = report?.code ?? res?.code;
                                  const stdout = report?.stdout ?? res?.stdout ?? report?.output ?? res?.output ?? report?.logs ?? res?.logs ?? '';
                                  const stderr = report?.stderr ?? res?.stderr ?? report?.error ?? res?.error ?? '';
                                  const ok = code !== undefined ? Number(code) === 0 : false;
                                  setRunResult({ ok, code, stdout, stderr, for: it.filename });
                                  if (ok) {
                                    toast.success('Test run finished successfully');
                                    logger.info('Run succeeded (CLI mode)', { filename: it.filename, code, stdoutLen: String(stdout || '').length, stderrLen: String(stderr || '').length });
                                  } else {
                                    toast.error('Test run failed — see error panel');
                                    logger.warn('Run failed (CLI mode)', { filename: it.filename, code, stderrSnippet: String(stderr || '').slice(0, 200) });
                                  }
                                }
                              } catch (err) {
                                const msg = err?.response?.data?.error || err.message || 'Unknown error';
                                setRunResult({ ok: false, code: undefined, stdout: '', stderr: msg, for: it.filename });
                                toast.error('Test run failed — see error panel');
                                logger.error('Run error', { filename: it.filename, error: msg });
                              } finally {
                                setRunning(null);
                                logger.debug('Run finished', { filename: it.filename });
                              }
                            }}
                          >
                            {running === it.filename ? (
                              <span className="spinner" aria-hidden />
                            ) : (
                              <span className="mi">play_arrow</span>
                            )}
                          </button>
                          <span className={`toggle-btn ${it.enabled ? 'toggle-on' : 'toggle-off'}`} title={it.enabled ? 'Enabled' : 'Disabled'} aria-label="Enabled state"><span className="mi">{it.enabled ? 'toggle_on' : 'toggle_off'}</span></span>
                          <button className="icon-btn icon-muted" title="Edit" aria-label="Edit" onClick={(e) => { e.stopPropagation(); openForEdit(it); }}><span className="mi">edit</span></button>
                          <button className="icon-btn icon-success" title="Export" aria-label="Export" onClick={(e) => { e.stopPropagation(); exportOne(it); }}><span className="mi">download</span></button>
                          <button className="icon-btn icon-primary" title="Duplicate" aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateOne(it); }}><span className="mi">content_copy</span></button>
                          <button className="icon-btn icon-danger" title="Delete" aria-label="Delete" onClick={async (e) => { e.stopPropagation(); try { await deleteTestcase(it.filename); await load(); toast.success('Deleted'); logger.info('Deleted one', { filename: it.filename }); } catch (err) { toast.error('Delete failed — ' + (err?.response?.data?.error || err.message)); logger.error('Delete failed', { filename: it.filename, error: err?.response?.data?.error || err.message }); } }}><span className="mi">delete</span></button>
                        </div>
                      </div>
                      <span className="icon-btn icon-muted cursor-grab select-none" title="Drag to reorder" aria-label="Drag handle"><span className="mi">drag_indicator</span></span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
  </div>
        )}

        {/* Editor column */}
        <div className={sidebarOpen ? "md:col-span-2" : "md:col-span-3 relative"}>
          <div className="bg-white border rounded p-4">
            {runResult && (
              <div className={`mb-4 border rounded ${runResult.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="mi" aria-hidden>{runResult.ok ? 'check_circle' : 'error'}</span>
                  <strong className={runResult.ok ? 'text-emerald-700' : 'text-red-700'}>
                    {runResult.ok ? 'Test run completed' : 'Test run finished'}
                  </strong>
                  {runResult.code !== undefined && (
                    <span className="text-gray-700">(exit code: {String(runResult.code)})</span>
                  )}
                  <span className="text-gray-500">{runResult.for}</span>
                  <button className="icon-btn icon-muted ml-auto" onClick={() => setRunResult(null)} title="Close" aria-label="Close"><span className="mi">close</span></button>
                </div>
                {/* Structured steps view if available */}
                {Array.isArray(runResult.steps) ? (
                  <div className="px-3 pb-3">
                    <div className="text-sm text-gray-700 mb-2">
                      <div><span className="font-medium">Title:</span> {runResult.title}</div>
                      {runResult.location && (<div><span className="font-medium">Location:</span> <code className="text-xs">{runResult.location}</code></div>)}
                      {(runResult.startTime || runResult.endTime) && (
                        <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                          {runResult.startTime && <span>Started: {formatTimestamp(runResult.startTime)}</span>}
                          {runResult.endTime && <span>Ended: {formatTimestamp(runResult.endTime)}</span>}
                          {runResult.startTime && runResult.endTime && (
                            <span>Duration: {formatDuration(runResult.endTime - runResult.startTime)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-2 text-xs text-gray-600">
                      {(() => {
                        const total = Array.isArray(runResult.steps) ? runResult.steps.length : 0;
                        const passed = Array.isArray(runResult.steps) ? runResult.steps.filter(s => s.status === 'passed').length : 0;
                        const allPassed = total > 0 && passed === total;
                        return (
                          <div>
                            <span className={allPassed ? 'text-emerald-700' : 'text-gray-700'}>
                              {passed} / {total} steps passed
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm bg-white border rounded">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-2">Step</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Start</th>
                            <th className="text-left p-2">End</th>
                            <th className="text-left p-2">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runResult.steps.map((s, idx) => {
                            const dur = (s.endTime && s.startTime) ? (s.endTime - s.startTime) : undefined;
                            const statusClass = s.status === 'passed' ? 'text-emerald-700' : s.status === 'failed' ? 'text-red-700' : 'text-gray-700';
                            const statusBadge = s.status === 'passed' ? 'bg-emerald-100' : s.status === 'failed' ? 'bg-red-100' : 'bg-gray-100';
                            return (
                              <tr key={idx} className="border-b last:border-0">
                                <td className="p-2 whitespace-pre-wrap">{s.title}</td>
                                <td className="p-2"><span className={`inline-block px-2 py-0.5 rounded ${statusBadge} ${statusClass}`}>{s.status || 'unknown'}</span></td>
                                <td className="p-2 text-xs text-gray-500">{formatTimestamp(s.startTime)}</td>
                                <td className="p-2 text-xs text-gray-500">{formatTimestamp(s.endTime)}</td>
                                <td className="p-2 text-xs text-gray-500">{dur !== undefined ? formatDuration(dur) : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
                    <div>
                      <div className="text-xs font-medium text-gray-600">stdout</div>
                      <pre className="overflow-auto text-xs bg-white border rounded p-2 max-h-64"><code>{runResult.stdout || ''}</code></pre>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600">stderr</div>
                      <pre className="overflow-auto text-xs bg-white border rounded p-2 max-h-64"><code>{runResult.stderr || ''}</code></pre>
                    </div>
                  </div>
                )}
              </div>
            )}
            {mode === 'single' ? (
              <>
                <div className="flex items-center mb-3">
                  <h2 className="text-lg font-semibold mr-auto">{editing?.filename ? 'Edit Test Case' : 'New Test Case'}</h2>
                  {editing?.filename && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border">{editing.filename}</span>
                  )}
                </div>
                <TestCaseForm key={editing?.filename || 'new'} existing={editing} defaultProduct={currentProduct !== 'All' ? currentProduct : 'General'} onSaved={() => { setEditing(null); load(); }} />
              </>
            ) : (
              <>
                <div className="flex items-center mb-3">
                  <h2 className="text-lg font-semibold mr-auto">Batch Create</h2>
                </div>
                <BatchCreate defaultProduct={currentProduct !== 'All' ? currentProduct : 'General'} onSaved={() => { setEditing(null); load(); }} />
              </>
            )}
          </div>
          {!sidebarOpen && (
            <button
              className="icon-btn icon-muted absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"
              title="Show test list"
              aria-label="Show test list"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="mi">chevron_right</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
