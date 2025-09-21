import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppSelect from './ui/AppSelect';
import { fetchTestcases, deleteTestcase, createTestcases, updateTestcase, runTest, fetchProducts, createProduct, deleteProduct } from '../api';
import TestCaseForm from './TestCaseForm';
import BatchCreate from './BatchCreate';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';
import ConfirmDialog from './ui/ConfirmDialog';

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
  const [confirmState, setConfirmState] = useState({ open: false, type: null, payload: null });

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
  // Global drag events to show file drop overlay for JSON imports
  useEffect(() => {
    let dragCounter = 0;
    const onEnter = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        dragCounter++;
        setIsOverDropzone(true);
      }
    };
    const onOver = (e) => {
      if (isOverDropzone) e.preventDefault();
    };
    const onLeave = (e) => {
      if (--dragCounter <= 0) {
        dragCounter = 0;
        setIsOverDropzone(false);
      }
    };
    const onDrop = (e) => {
      if (!isOverDropzone) return;
      onDropImport(e);
      dragCounter = 0;
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [isOverDropzone]);
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
      // Auto-resolve: remove testOrder if it might conflict (we'll let backend assign)
      const adjusted = items.map(p => {
        const out = { product: currentProduct !== 'All' ? (p.product || currentProduct) : (p.product || undefined), ...p };
        if (out.testOrder !== undefined && out.testOrder !== null && typeof out.testOrder !== 'number') delete out.testOrder;
        // Strip server-managed fields
        delete out._id; delete out.filename; delete out.createdAt; delete out.updatedAt;
        return out;
      });
      try {
        await createTestcases(adjusted);
      } catch (err) {
        // If duplicate order error, retry with testOrder removed
        const dup = err?.response?.data?.error && err.response.data.error.toLowerCase().includes('duplicate testorder');
        if (dup) {
          const stripped = adjusted.map(o => { const c = { ...o }; delete c.testOrder; return c; });
          await createTestcases(stripped);
        } else {
          throw err;
        }
      }
  await load();
  toast.success('Imported test case(s) successfully');
      logger.info('Import from file input', { count: Array.isArray(json) ? json.length : 1, name: file.name });
    } catch (err) {
      console.error(err);
      const resp = err?.response?.data;
      let detailMsg = '';
      if (resp?.details) {
        if (Array.isArray(resp.details)) detailMsg = ' Details: ' + resp.details.map(d => d.message || JSON.stringify(d)).join('; ');
        else if (typeof resp.details === 'string') detailMsg = ' Details: ' + resp.details;
        else detailMsg = ' Details: ' + JSON.stringify(resp.details);
      }
      toast.error('Import failed — ' + (resp?.error || err.message) + detailMsg);
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
      const adjusted = payload.map(p => {
        const out = { product: currentProduct !== 'All' ? (p.product || currentProduct) : (p.product || undefined), ...p };
        if (out.testOrder !== undefined && out.testOrder !== null && typeof out.testOrder !== 'number') delete out.testOrder;
        delete out._id; delete out.filename; delete out.createdAt; delete out.updatedAt;
        return out;
      });
      try {
        await createTestcases(adjusted);
      } catch (err) {
        const dup = err?.response?.data?.error && err.response.data.error.toLowerCase().includes('duplicate testorder');
        if (dup) {
          const stripped = adjusted.map(o => { const c = { ...o }; delete c.testOrder; return c; });
          await createTestcases(stripped);
        } else {
          throw err;
        }
      }
  await load();
  toast.success('Imported test case(s) successfully');
      logger.info('Import via drop', { files: files.map(f => f.name), count: payload.length });
    } catch (err) {
      console.error(err);
      const resp = err?.response?.data;
      let detailMsg = '';
      if (resp?.details) {
        if (Array.isArray(resp.details)) detailMsg = ' Details: ' + resp.details.map(d => d.message || JSON.stringify(d)).join('; ');
        else if (typeof resp.details === 'string') detailMsg = ' Details: ' + resp.details;
        else detailMsg = ' Details: ' + JSON.stringify(resp.details);
      }
      toast.error('Import failed — ' + (resp?.error || err.message) + detailMsg);
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

  // Duplicate actions (restored)
  const duplicateOne = async (it) => {
    const { filename, ...content } = it;
    try {
      await createTestcases({ ...content });
      await load();
      toast.success('Duplicated test case');
      logger.info('Duplicated one', { source: filename });
    } catch (err) {
      toast.error('Duplicate failed — ' + (err?.response?.data?.error || err.message));
      logger.error('Duplicate one failed', { source: filename, error: err?.response?.data?.error || err.message });
    }
  };
  const duplicateSelected = async () => {
    const toDup = items.filter(i => selected.has(i.filename)).map(({ filename, ...content }) => content);
    if (!toDup.length) return;
    try {
      await createTestcases(toDup);
      clearSelection();
      await load();
      toast.success('Duplicated selected test case(s)');
      logger.info('Duplicated selected', { count: toDup.length });
    } catch (err) {
      toast.error('Duplicate selected failed — ' + (err?.response?.data?.error || err.message));
      logger.error('Duplicate selected failed', { error: err?.response?.data?.error || err.message });
    }
  };

  // Bulk delete
  const deleteSelected = async () => {
    if (!selected.size) return;
    setConfirmState({ open: true, type: 'bulk-delete', payload: { count: selected.size } });
  };
  const performBulkDelete = async () => {
    const size = selected.size;
    if (!size) { setConfirmState({ open: false, type: null, payload: null }); return; }
    try {
      await Promise.all(Array.from(selected).map(fn => deleteTestcase(fn)));
      clearSelection();
      await load();
      toast.success('Deleted selected test case(s)');
      logger.info('Deleted selected', { count: size });
    } catch (err) {
      toast.error('Failed to delete selected — ' + (err?.response?.data?.error || err.message));
      logger.error('Bulk delete failed', { error: err?.response?.data?.error || err.message });
    } finally {
      setConfirmState({ open: false, type: null, payload: null });
    }
  };
  // Product delete replace inline confirm
  const requestDeleteProduct = () => {
    setConfirmState({ open: true, type: 'product-delete', payload: { name: currentProduct } });
  };
  const performDeleteProduct = async () => {
    try {
      await deleteProduct(currentProduct);
      await refreshProducts();
      setCurrentProduct('All');
      toast.success('Product deleted');
    } catch (err) {
      toast.error('Failed to delete product — ' + (err?.response?.data?.error || err.message));
    } finally {
      setConfirmState({ open: false, type: null, payload: null });
    }
  };
  // Single testcase delete
  const requestDeleteSingle = (it) => {
    setConfirmState({ open: true, type: 'single-delete', payload: { filename: it.filename, description: it.description } });
  };
  const performDeleteSingle = async () => {
    const { filename, description } = confirmState.payload || {};
    if (!filename) { setConfirmState({ open: false, type: null, payload: null }); return; }
    try {
      await deleteTestcase(filename);
      await load();
      toast.success('Deleted');
      logger.info('Deleted one', { filename });
      if (editing?.filename === filename) setEditing(null);
    } catch (err) {
      toast.error('Delete failed — ' + (err?.response?.data?.error || err.message));
      logger.error('Delete failed', { filename, error: err?.response?.data?.error || err.message });
    } finally {
      setConfirmState({ open: false, type: null, payload: null });
    }
  };

  // Helpers: reordering logic (drag-and-drop, etc.)
  const reorderItems = async (next) => {
    const prevOrderByFile = new Map(items.map(it => [it.filename, it.testOrder]));
    // Reassign testOrder within each product group (1-based per product)
    const byProduct = new Map();
    next.forEach(it => { const p = it.product || 'General'; if (!byProduct.has(p)) byProduct.set(p, []); byProduct.get(p).push(it); });
    const reassigned = [];
    for (const [p, arr] of byProduct.entries()) {
      arr.forEach((it, idx) => reassigned.push({ ...it, testOrder: idx + 1 }));
    }
    setItems(reassigned);
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
  // Drag-and-drop reordering within list
  const onDragStart = (index) => setDragIndex(index);
  const onDragOver = (e, overIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === overIndex) return;
  };
  const onDropReorder = async (e, overIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === overIndex) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    await reorderItems(next);
    setDragIndex(null);
  };

  // Keyboard/mouse move helpers
  const moveItem = async (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await reorderItems(next);
  };

  // Global hotkey: Ctrl+L toggles list visibility
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setSidebarOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="p-6 min-h-screen flex flex-col space-y-5">
      {/* File drop overlay for importing JSON test cases */}
      {isOverDropzone && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600/80 text-white p-10 border-4 border-dashed border-white/70"
          onDragOver={e => e.preventDefault()}
          onDrop={onDropImport}
        >
          <span className="mi text-6xl mb-4 animate-pulse">upload_file</span>
          <h2 className="text-2xl font-semibold mb-2">Drop JSON file(s) to import</h2>
          <p className="text-sm opacity-90">You can drag one or many .json files containing test case definitions.</p>
          <p className="text-xs mt-4 opacity-70">(Esc / click outside to cancel)</p>
          <button
            type="button"
            className="mt-6 btn btn-muted"
            onClick={() => setIsOverDropzone(false)}
          >Cancel</button>
        </div>
      )}
      {/* Add Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !savingProduct && setShowProductModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-white dark:bg-slate-800 shadow-lg">
            <div className="px-5 py-4 border-b flex items-center">
              <h2 className="text-lg font-semibold mr-auto">Add Product</h2>
              <button className="icon-btn icon-muted" onClick={() => !savingProduct && setShowProductModal(false)} aria-label="Close" title="Close"><span className="mi">close</span></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const name = newProductName.trim();
              if (!name) { toast.error('Name required'); return; }
              try {
                setSavingProduct(true);
                await createProduct({ name, description: newProductDesc });
                toast.success('Product saved');
                logger.info('Product created', { name });
                await refreshProducts();
                setCurrentProduct(name);
                setShowProductModal(false);
              } catch (err) {
                toast.error('Failed to save product — ' + (err?.response?.data?.error || err.message));
                logger.error('Product create failed', { error: err?.response?.data?.error || err.message });
              } finally {
                setSavingProduct(false);
              }
            }}>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold tracking-wide text-gray-600 dark:text-slate-300 mb-1">NAME</label>
                  <input
                    autoFocus
                    className="field w-full"
                    placeholder="e.g. Onboarding"
                    value={newProductName}
                    onChange={e => setNewProductName(e.target.value)}
                    maxLength={60}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-wide text-gray-600 dark:text-slate-300 mb-1">DESCRIPTION (OPTIONAL)</label>
                  <textarea
                    className="field w-full min-h-[80px] resize-y"
                    placeholder="Short description"
                    value={newProductDesc}
                    onChange={e => setNewProductDesc(e.target.value)}
                    maxLength={300}
                  />
                  <div className="text-[10px] text-gray-500 mt-1">{newProductDesc.length}/300</div>
                </div>
              </div>
              <div className="px-5 py-3 border-t flex items-center gap-2 justify-end bg-gray-50 dark:bg-slate-700/30 rounded-b-lg">
                <button type="button" className="btn btn-muted" disabled={savingProduct} onClick={() => setShowProductModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary disabled:opacity-50" disabled={savingProduct}>
                  {savingProduct ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.type === 'bulk-delete' ? 'Delete Selected Test Cases' : confirmState.type === 'product-delete' ? 'Delete Product' : confirmState.type === 'single-delete' ? 'Delete Test Case' : ''}
        message={(
          <> {confirmState.type === 'bulk-delete' && (
              <>Are you sure you want to delete <strong>{confirmState.payload?.count}</strong> selected test case(s)? This action cannot be undone.</>
            )}
            {confirmState.type === 'product-delete' && (
              <>Delete product <strong>{confirmState.payload?.name}</strong>? This will NOT delete its test cases; they will move to General.</>
            )}
            {confirmState.type === 'single-delete' && (
              <>Delete test case <strong>{confirmState.payload?.description || confirmState.payload?.filename}</strong>? This cannot be undone.</>
            )}
          </>
        )}
        variant={confirmState.type?.includes('delete') ? 'danger' : 'default'}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setConfirmState({ open: false, type: null, payload: null })}
        onConfirm={() => {
          if (confirmState.type === 'bulk-delete') return performBulkDelete();
          if (confirmState.type === 'product-delete') return performDeleteProduct();
          if (confirmState.type === 'single-delete') return performDeleteSingle();
        }}
      />
      {/* Header */}
      <div className="flex items-start flex-wrap gap-4">
        {/* Header left */}
        <div className="mr-auto space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Test Cases</h1>
          <p className="text-sm text-gray-500">Create, import, export, order & run automated scenarios</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Product selector */}
          <div className="flex items-center gap-2">
            <div className="min-w-[160px]">
              <AppSelect
                label={null}
                value={currentProduct}
                onChange={(e) => setCurrentProduct(e.target.value)}
                options={products.map(p => ({ value: p, label: p }))}
                aria-label="Filter by product"
              />
            </div>
            <button className="icon-btn icon-primary" title="Add product" aria-label="Add product" onClick={() => { setNewProductName(''); setNewProductDesc(''); setShowProductModal(true); }}><span className="mi">library_add</span></button>
            {currentProduct !== 'All' && currentProduct !== 'General' && (
              <button className="icon-btn icon-danger" title="Delete product" aria-label="Delete product" onClick={requestDeleteProduct}><span className="mi">delete</span></button>
            )}
          </div>
          <div className="rounded border overflow-hidden" role="tablist" aria-label="Mode">
            <button className={`icon-btn icon-muted ${mode === 'single' ? 'icon-indigo' : ''}`} onClick={() => setMode('single')} title="Single create/edit" aria-label="Single mode"><span className="mi">edit_note</span></button>
            <button className={`icon-btn icon-muted ${mode === 'batch' ? 'icon-indigo' : ''}`} onClick={() => setMode('batch')} title="Batch create" aria-label="Batch mode"><span className="mi">view_module</span></button>
          </div>
          <button className="icon-btn icon-add" onClick={() => setEditing(null)} title="New test case" aria-label="New"><span className="mi">add</span></button>
          <button className={`icon-btn ${logger.debugEnabled ? 'icon-success' : 'icon-muted'}`} onClick={() => { logger.toggleDebug(); logger.info(`Debug ${logger.debugEnabled ? 'disabled' : 'enabled'}`); }} title={logger.debugEnabled ? 'Disable debug logging' : 'Enable debug logging'} aria-label="Toggle debug mode"><span className="mi">bug_report</span></button>
          <button className="icon-btn icon-warning" onClick={onPickImport} title="Import JSON" aria-label="Import"><span className="mi">upload</span></button>
          <button className="icon-btn icon-success" onClick={exportAll} title="Export all" aria-label="Export all"><span className="mi">download</span></button>
          <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={onImportFiles} />
          <button
            className="icon-btn icon-muted"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Hide list (Ctrl+L)' : 'Show list (Ctrl+L)'}
            aria-label={sidebarOpen ? 'Hide list' : 'Show list'}
          >
            <span className="mi">{sidebarOpen ? 'menu_open' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* Main split area */}
      <div className="flex-1 flex gap-5 min-h-0">
        {sidebarOpen && (
          <aside className="w-full md:w-1/3 xl:w-1/4 flex flex-col gap-3" id="test-list-panel" aria-label="Test cases list" aria-expanded={sidebarOpen}>
            <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-600 rounded p-3 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search description or order..." className="field w-full" />
                </div>
                <label className="text-[10px] font-medium text-gray-600 flex items-center gap-1 whitespace-nowrap">
                  <input type="checkbox" className="scale-110" checked={showEnabledOnly} onChange={e => setShowEnabledOnly(e.target.checked)} /> EN
                </label>
              </div>
              {savingOrder && <div className="text-xs text-gray-500">Saving order…</div>}
              <div className="flex items-center gap-2">
                <button className="icon-btn icon-muted" onClick={selectAll} title="Select all" aria-label="Select all"><span className="mi">select_check_box</span></button>
                <button className="icon-btn icon-muted" onClick={clearSelection} title="Clear selection" aria-label="Clear selection"><span className="mi">clear_all</span></button>
                <button className="icon-btn icon-primary disabled:opacity-50" onClick={duplicateSelected} disabled={!selected.size} title="Duplicate selected" aria-label="Duplicate selected"><span className="mi">content_copy</span></button>
                <button className="icon-btn icon-danger disabled:opacity-50" onClick={deleteSelected} disabled={!selected.size} title="Delete selected" aria-label="Delete selected"><span className="mi">delete</span></button>
              </div>
            </div>
            {/* Scrollable list panel (allow vertical scroll, prevent last item stretch) */}
            <div className="panel divide-y overflow-auto flex-1 min-h-0">
              {groupedByProduct.length === 0 && (
                <div className="p-4 text-sm text-gray-500">No test cases match your search.</div>
              )}
              {groupedByProduct.map(([prodName, group]) => (
                <React.Fragment key={`group-${prodName}`}>
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/40 text-[11px] font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-300 flex items-center justify-between">
                    <span>{prodName}</span>
                    <span className="text-slate-400">{group.length}</span>
                  </div>
                  {group.map(it => {
                    const originalIndex = items.findIndex(x => x.filename === it.filename);
                    const isActive = editing?.filename === it.filename;
                    return (
                      <div
                        key={it.filename}
                        className={`px-3 py-2 flex items-start gap-3 cursor-pointer group transition-colors text-sm relative ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                        draggable
                        onDragStart={() => onDragStart(originalIndex)}
                        onDragOver={e => onDragOver(e, originalIndex)}
                        onDrop={e => onDropReorder(e, originalIndex)}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveItem(originalIndex, originalIndex - 1); }
                          if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveItem(originalIndex, originalIndex + 1); }
                        }}
                        onClick={() => openForEdit(it)}
                      >
                        <span className="icon-btn icon-muted icon-btn-sm cursor-grab select-none -ml-1" aria-hidden><span className="mi">drag_indicator</span></span>
                        <input type="checkbox" className="mt-1" checked={selected.has(it.filename)} onChange={e => { e.stopPropagation(); toggleSelect(it.filename); }} title="Select" aria-label="Select" />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-outline">#{it.testOrder}</span>
                            <span className={`toggle-btn ${it.enabled ? 'toggle-on' : 'toggle-off'}`} aria-label="Enabled state" title={it.enabled ? 'Enabled' : 'Disabled'}><span className="mi">{it.enabled ? 'toggle_on' : 'toggle_off'}</span></span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 uppercase tracking-wide">{it.product || 'General'}</span>
                          </div>
                          <div className="font-medium truncate leading-tight">{it.description}</div>
                          <div className="flex gap-1.5 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="icon-btn icon-danger disabled:opacity-50 icon-btn-sm" title="Run this test" aria-label="Run test" disabled={running === it.filename} onClick={async e => { e.stopPropagation(); setRunResult(null); setRunning(it.filename); toast.info(`Running: ${it.description || it.filename}`); logger.info('Run started', { filename: it.filename, description: it.description }); try { const { filename, ...scenario } = it; const res = await runTest({ scenarios: [scenario], headless: true }); let report = null; if (Array.isArray(res)) report = res[0]; else if (Array.isArray(res?.reports)) report = res.reports[0]; else if (Array.isArray(res?.results)) report = res.results[0]; else if (Array.isArray(res?.scenarios)) report.scenarios[0]; else if (res?.report) report = res.report; else if (res?.result) report = res.result; else if (res?.data?.report) report = res.data.report; else if (res?.title || res?.steps || res?.status || res?.location) report = res; if (report && Array.isArray(report.steps)) { const allPassed = ((report.status || '').toLowerCase() === 'passed') || report.steps.every(s => s.status === 'passed'); const startTime = typeof report.startTime === 'string' ? Date.parse(report.startTime) : report.startTime; const endTime = typeof report.endTime === 'string' ? Date.parse(report.endTime) : report.endTime; const steps = report.steps.map(s => ({ ...s, startTime: typeof s.startTime === 'string' ? Date.parse(s.startTime) : s.startTime, endTime: typeof s.endTime === 'string' ? Date.parse(s.endTime) : s.endTime })); setRunResult({ ok: allPassed, for: it.filename, ...report, startTime, endTime, steps }); if (allPassed) { toast.success('Test run finished successfully'); logger.info('Run succeeded', { filename: it.filename, steps: steps.length, passed: steps.filter(s => s.status === 'passed').length, durationMs: (endTime && startTime) ? (endTime - startTime) : undefined }); } else { toast.error('Test run failed — see error panel'); logger.warn('Run failed', { filename: it.filename, steps: steps.length, failed: steps.filter(s => s.status !== 'passed').length, status: report.status }); } } else { const code = report?.code ?? res?.code; const stdout = report?.stdout ?? res?.stdout ?? report?.output ?? res?.output ?? report?.logs ?? res?.logs ?? ''; const stderr = report?.stderr ?? res?.stderr ?? report?.error ?? res?.error ?? ''; const ok = code !== undefined ? Number(code) === 0 : false; setRunResult({ ok, code, stdout, stderr, for: it.filename }); if (ok) { toast.success('Test run finished successfully'); logger.info('Run succeeded (CLI mode)', { filename: it.filename, code, stdoutLen: String(stdout || '').length, stderrLen: String(stderr || '').length }); } else { toast.error('Test run failed — see error panel'); logger.warn('Run failed (CLI mode)', { filename: it.filename, code, stderrSnippet: String(stderr || '').slice(0, 200) }); } } } catch (err) { const msg = err?.response?.data?.error || err.message || 'Unknown error'; setRunResult({ ok: false, code: undefined, stdout: '', stderr: msg, for: it.filename }); toast.error('Test run failed — see error panel'); logger.error('Run error', { filename: it.filename, error: msg }); } finally { setRunning(null); logger.debug('Run finished', { filename: it.filename }); } }}>
                              {running === it.filename ? <span className="spinner" aria-hidden /> : <span className="mi">play_arrow</span>}
                            </button>
                            <span className={`toggle-btn ${it.enabled ? 'toggle-on' : 'toggle-off'}`} title={it.enabled ? 'Enabled' : 'Disabled'} aria-label="Enabled state"><span className="mi">{it.enabled ? 'toggle_on' : 'toggle_off'}</span></span>
                            <button className="icon-btn icon-muted icon-btn-sm" title="Edit" aria-label="Edit" onClick={e => { e.stopPropagation(); openForEdit(it); }}><span className="mi">edit</span></button>
                            <button className="icon-btn icon-success icon-btn-sm" title="Export" aria-label="Export" onClick={e => { e.stopPropagation(); exportOne(it); }}><span className="mi">download</span></button>
                            <button className="icon-btn icon-primary icon-btn-sm" title="Duplicate" aria-label="Duplicate" onClick={e => { e.stopPropagation(); duplicateOne(it); }}><span className="mi">content_copy</span></button>
                            <button className="icon-btn icon-danger icon-btn-sm" title="Delete" aria-label="Delete" onClick={e => { e.stopPropagation(); requestDeleteSingle(it); }}><span className="mi">delete</span></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
          </div>
        </aside>
        )}
        <section className={`${sidebarOpen ? 'flex-1' : 'flex-1'} min-w-0`}>
          <div className="panel p-4">
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
          {/* Fixed toggle handle when list hidden */}
          {!sidebarOpen && (
            <button
              className="icon-btn icon-muted fixed z-30 left-2 top-32 shadow-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-300 dark:border-slate-600"
              title="Show test list (Ctrl+L)"
              aria-label="Show test list"
              aria-controls="test-list-panel"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <span className="mi">chevron_right</span>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
