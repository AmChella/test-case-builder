import React, { useEffect, useMemo, useState } from 'react';
import AppSelect from './ui/AppSelect';
import { createTestcases, fetchTestcases } from '../api';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';

// ---- Helpers / Factories ----
const emptyStep = () => ({
  stepName: '',
  action: 'goto',
  path: '',
  selector: '',
  selectorType: 'css',
  data: '',
  waitTime: 0,
  iterate: false,
  iterativeGroup: '',
  customName: '',
  soft: false,
  validations: []
});

const emptyValidation = () => ({
  type: 'toBeVisible',
  selector: '',
  selectorType: 'css',
  path: '',
  data: '',
  message: '',
  soft: false,
  attribute: '',
  cssProperty: ''
});

const emptyCase = (product = 'General') => ({
  description: '',
  enabled: true,
  testSteps: [emptyStep()],
  testOrder: null,
  product
});

// ---- Utilities ----
const expectsData = (type) => {
  return [
    'toHaveText',
    'toHaveValue',
    'toHaveAttribute',
    'toHaveCSS',
    'toHaveClass',
    'custom'
  ].includes(type);
};

export default function BatchCreate({ onSaved, defaultProduct = 'General' }) {
  // Core draft state
  const [drafts, setDrafts] = useState([emptyCase(defaultProduct)]);
  const [errors, setErrors] = useState([]);

  // Existing order collision tracking
  const [existingOrders, setExistingOrders] = useState(new Set());
  const [existingOrdersByProduct, setExistingOrdersByProduct] = useState(new Map());

  // Accordion open case index
  const [openIndex, setOpenIndex] = useState(0);

  // View mode: form vs json
  const [viewMode, setViewMode] = useState('form');

  // Per-step data & JSON editors state
  const [dataMode, setDataMode] = useState({}); // { `${di}:${si}`: 'text'|'json' }
  const [jsonText, setJsonText] = useState({}); // raw text for JSON mode
  const [jsonErr, setJsonErr] = useState({}); // validation errors for JSON data
  const [actionText, setActionText] = useState({});
  const [actionErr, setActionErr] = useState({});
  const [filesText, setFilesText] = useState({});
  const [filesErr, setFilesErr] = useState({});

  const toast = useToast();
  const logger = useLogger();

  // Load existing testcases once for order collision awareness
  useEffect(() => {
    (async () => {
      try {
        const all = await fetchTestcases();
        const set = new Set(all.map(x => x.testOrder).filter(v => Number.isInteger(v)));
        setExistingOrders(set);
        const byProd = new Map();
        for (const x of all) {
          const p = x.product || 'General';
            if (!byProd.has(p)) byProd.set(p, new Set());
            if (Number.isInteger(x.testOrder)) byProd.get(p).add(x.testOrder);
        }
        setExistingOrdersByProduct(byProd);
      } catch (err) {
        logger.error('Failed loading testcases', err);
      }
    })();
  }, [logger]);

  // ---- Derived / Memo ----
  // duplicate detection map key = `${product}:${testOrder}`
  const dupKeySet = useMemo(() => {
    const counts = new Map();
    for (const d of drafts) {
      if (!Number.isInteger(d.testOrder)) continue;
      const key = `${d.product || 'General'}:${d.testOrder}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }, [drafts]);

  // ---- Draft Operations ----
  const addDraft = () => {
    setDrafts(d => [...d, emptyCase(defaultProduct)]);
    setOpenIndex(drafts.length); // open the new one
  };

  const removeDraft = (index) => {
    setDrafts(d => d.filter((_, i) => i !== index));
    if (openIndex === index) setOpenIndex(-1);
  };

  const changeDraft = (index, patch) => {
    setDrafts(ds => {
      const n = [...ds];
      n[index] = { ...n[index], ...patch };
      return n;
    });
  };

  const addStep = (di) => {
    setDrafts(ds => {
      const n = [...ds];
      n[di] = { ...n[di], testSteps: [...n[di].testSteps, emptyStep()] };
      return n;
    });
  };

  const removeStep = (di, si) => {
    setDrafts(ds => {
      const n = [...ds];
      const steps = [...n[di].testSteps];
      steps.splice(si, 1);
      n[di] = { ...n[di], testSteps: steps };
      return n;
    });
  };

  const changeStep = (di, si, patch) => {
    setDrafts(ds => {
      const n = [...ds];
      const steps = [...n[di].testSteps];
      steps[si] = { ...steps[si], ...patch };
      n[di] = { ...n[di], testSteps: steps };
      return n;
    });
  };

  const addValidation = (di, si) => {
    setDrafts(ds => {
      const n = [...ds];
      const steps = [...n[di].testSteps];
      const st = { ...steps[si] };
      st.validations = [...(st.validations || []), emptyValidation()];
      steps[si] = st;
      n[di] = { ...n[di], testSteps: steps };
      return n;
    });
  };

  const removeValidation = (di, si, vi) => {
    setDrafts(ds => {
      const n = [...ds];
      const steps = [...n[di].testSteps];
      const st = { ...steps[si] };
      const vs = [...(st.validations || [])];
      vs.splice(vi, 1);
      st.validations = vs;
      steps[si] = st;
      n[di] = { ...n[di], testSteps: steps };
      return n;
    });
  };

  const changeValidation = (di, si, vi, patch) => {
    setDrafts(ds => {
      const n = [...ds];
      const steps = [...n[di].testSteps];
      const st = { ...steps[si] };
      const vs = [...(st.validations || [])];
      vs[vi] = { ...vs[vi], ...patch };
      st.validations = vs;
      steps[si] = st;
      n[di] = { ...n[di], testSteps: steps };
      return n;
    });
  };

  // ---- Save ----
  const validateDrafts = () => {
    const errs = [];
    drafts.forEach((d, idx) => {
      if (!d.description.trim()) errs.push(`Case ${idx + 1}: description required`);
      if (!d.product || !d.product.trim()) errs.push(`Case ${idx + 1}: product required`);
      d.testSteps.forEach((s, si) => {
        if (!s.action) errs.push(`Case ${idx + 1} Step ${si + 1}: action required`);
        if ((s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) && !(s.selector || s.path)) {
          errs.push(`Case ${idx + 1} Step ${si + 1}: selector/path required`);
        }
        (s.validations || []).forEach((v, vi) => {
          if (!v.type) errs.push(`Case ${idx + 1} Step ${si + 1} Validation ${vi + 1}: type required`);
          if (expectsData(v.type) && !v.data) errs.push(`Case ${idx + 1} Step ${si + 1} Validation ${vi + 1}: data required`);
        });
      });
    });
    setErrors(errs);
    return errs.length === 0;
  };

  const saveAll = async () => {
    if (!validateDrafts()) return;
    // compute order conflicts (duplicate within batch or with existing)
    const conflict = drafts.some(d => Number.isInteger(d.testOrder) && (dupKeySet.has(`${d.product || 'General'}:${d.testOrder}`) || (existingOrdersByProduct.get(d.product || 'General') || new Set()).has(d.testOrder)));
    if (conflict) {
      toast.error('Resolve duplicate / conflicting test orders first.');
      return;
    }
    try {
      const payload = drafts.map(d => ({
        ...d,
        testSteps: d.testSteps.map(s => ({
          ...s,
          data: s.data,
          actionOptions: s.actionOptions,
          files: s.files
        }))
      }));
      await createTestcases(payload);
      toast.success('Test cases created');
      setDrafts([emptyCase(defaultProduct)]);
      setOpenIndex(0);
      setErrors([]);
      onSaved && onSaved();
    } catch (err) {
      logger.error('Failed creating testcases', err);
      toast.error('Failed creating testcases');
    }
  };

  // ---- Render ----
  return (
    <div className="space-y-4">
      {/* Toolbar: view toggle */}
      <div className="flex items-center gap-2">
        <div className="ml-auto rounded border overflow-hidden bg-white/60 dark:bg-slate-800/60" role="tablist" aria-label="View mode">
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'form' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('form')}><span className="mi">edit_note</span><span>Form</span></button>
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'json' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('json')}><span className="mi">code</span><span>JSON</span></button>
        </div>
      </div>

      {viewMode === 'json' ? (
        <div className="panel p-3 max-h-[65vh] overflow-auto space-y-3">
          <pre className="text-xs bg-slate-900/5 dark:bg-slate-900/40 rounded p-3 border border-slate-200 dark:border-slate-700 overflow-auto"><code>{JSON.stringify(drafts, null, 2)}</code></pre>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn icon-primary" title="Copy JSON" aria-label="Copy JSON" onClick={() => navigator.clipboard?.writeText(JSON.stringify(drafts, null, 2))}><span className="mi">content_copy</span><span>Copy</span></button>
            <button type="button" className="icon-btn icon-success" title="Download JSON" aria-label="Download JSON" onClick={() => { const blob = new Blob([JSON.stringify(drafts, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'test-cases.json'; a.click(); URL.revokeObjectURL(url); }}><span className="mi">download</span><span>Download</span></button>
            <div className="ml-auto"><button onClick={saveAll} className="icon-btn icon-success" title="Save all" aria-label="Save all"><span className="mi">save</span><span>Save</span></button></div>
          </div>
        </div>
      ) : (
        <>
          {!!errors.length && (
            <div className="p-3 border border-red-300 bg-red-50 text-red-700 rounded text-sm">
              <ul className="list-disc pl-5 space-y-0.5">
                {errors.map((e, i) => (<li key={i}>{e}</li>))}
              </ul>
            </div>
          )}

          {drafts.map((d, di) => {
            const isOpen = openIndex === di;
            return (
              <div key={di} className="panel overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 cursor-pointer flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-700/40 dark:to-slate-700/10"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? -1 : di)}
                >
                  <span className="badge badge-outline">Case {di + 1}</span>
                  <span className="font-medium flex-1 truncate text-sm">{d.description || '(new test case)'}</span>
                  <button type="button" title="Remove test case" aria-label="Remove test case" className="icon-btn icon-danger icon-btn-sm" onClick={(e) => { e.stopPropagation(); removeDraft(di); }}><span className="mi">delete</span></button>
                  <span className="mi ml-1 text-slate-500 text-base">{isOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-3 space-y-4 bg-white/60 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-semibold tracking-wide uppercase text-slate-500">Description <span className="text-red-600">*</span></label>
                        <input required className="field" value={d.description} onChange={e => changeDraft(di, { description: e.target.value })} placeholder="Short description" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold tracking-wide uppercase text-slate-500">Product <span className="text-red-600">*</span></label>
                        <input required className="field" value={d.product || ''} onChange={e => changeDraft(di, { product: e.target.value })} placeholder="e.g., Web, Mobile, API" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:col-span-1 items-start">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold tracking-wide uppercase text-slate-500">Test Order</label>
                          <input className={`field ${Number.isInteger(d.testOrder) && (dupKeySet.has(`${d.product || 'General'}:${d.testOrder}`) ? 'border-red-500' : ((existingOrdersByProduct.get(d.product || 'General') || new Set()).has(d.testOrder) ? 'border-red-500' : ''))}`} type="number" value={d.testOrder ?? ''} onChange={e => changeDraft(di, { testOrder: e.target.value === '' ? null : Number(e.target.value) })} />
                          {Number.isInteger(d.testOrder) && dupKeySet.has(`${d.product || 'General'}:${d.testOrder}`) && (
                            <p className="text-[10px] text-red-600 mt-1">Duplicate order within batch.</p>
                          )}
                          {Number.isInteger(d.testOrder) && !dupKeySet.has(`${d.product || 'General'}:${d.testOrder}`) && (existingOrdersByProduct.get(d.product || 'General') || new Set()).has(d.testOrder) && (
                            <p className="text-[10px] text-red-600 mt-1">Conflicts with existing test case.</p>
                          )}
                        </div>
                        <div className="flex items-end gap-2">
                          <span className="text-xs font-medium text-slate-600">Enabled</span>
                          <button
                            type="button"
                            className={`toggle-btn ${d.enabled ? 'toggle-on' : 'toggle-off'}`}
                            title={d.enabled ? 'Disable' : 'Enable'}
                            aria-label="Toggle enabled"
                            aria-pressed={d.enabled}
                            onClick={() => changeDraft(di, { enabled: !d.enabled })}
                          >
                            <span className="mi">{d.enabled ? 'toggle_on' : 'toggle_off'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold tracking-wide uppercase text-slate-500">Steps</h4>
                        <button className="icon-btn icon-add icon-btn-sm" onClick={() => addStep(di)} title="Add step" aria-label="Add step"><span className="mi">add</span> Step</button>
                      </div>
                      {d.testSteps.map((s, si) => (
                        <div key={si} className="step-block p-3 my-2 grid grid-cols-1 md:grid-cols-7 gap-3 text-[13px]">
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Step Name</label>
                            <input className="field-sm" placeholder="stepName" value={s.stepName} onChange={e => changeStep(di, si, { stepName: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <AppSelect
                              label="ACTION"
                              required
                              className="!space-y-0"
                              selectClassName="h-[30px] field-sm"
                              value={s.action}
                              onChange={e => changeStep(di, si, { action: e.target.value })}
                              options={['goto','click','fill','type','press','hover','upload','waitForTimeout','custom']}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Selector / Path {(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                            <input aria-required={(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) ? 'true' : 'false'} className="field-sm" placeholder="selector or path" value={s.selector || s.path} onChange={e => changeStep(di, si, { selector: e.target.value, path: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <AppSelect
                              label="SELECTOR TYPE"
                              className="!space-y-0"
                              selectClassName="h-[30px] field-sm"
                              value={s.selectorType || 'css'}
                              onChange={e => changeStep(di, si, { selectorType: e.target.value })}
                              options={['css','xpath','id','text','testId']}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nth</label>
                            <input className="field-sm" type="number" min="0" placeholder="0" value={s.nth ?? ''} onChange={e => changeStep(di, si, { nth: e.target.value === '' ? undefined : Number(e.target.value) })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Wait (ms)</label>
                            <input className="field-sm" type="number" min="0" placeholder="500" value={s.waitTime || 0} onChange={e => changeStep(di, si, { waitTime: Number(e.target.value || 0) })} />
                          </div>
                          <div className="md:col-span-1 space-y-1">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Step Data</label>
                              <div className="flex items-center gap-1">
                                {(s.action === 'custom' || s.action === 'upload') && (
                                  <div className="rounded border overflow-hidden text-[10px] bg-white/40 dark:bg-slate-700/40">
                                    <button
                                      type="button"
                                      className="px-2 py-0.5"
                                      title="Insert template"
                                      onClick={() => {
                                        const key = `${di}:${si}`;
                                        if (s.action === 'custom') {
                                          const tpl = { word: 'Example', selector: '', nth: 0, mode: 'mouse', method: 'double', wordwise: false };
                                          const txt = JSON.stringify(tpl, null, 2);
                                          setDataMode(m => ({ ...m, [key]: 'json' }));
                                          setJsonText(t => ({ ...t, [key]: txt }));
                                          setJsonErr(e => ({ ...e, [key]: undefined }));
                                          changeStep(di, si, { data: tpl });
                                        } else if (s.action === 'upload') {
                                          const tpl = ["relative/path/to/file.png"];
                                          const txt = JSON.stringify(tpl, null, 2);
                                          setDataMode(m => ({ ...m, [key]: 'json' }));
                                          setJsonText(t => ({ ...t, [key]: txt }));
                                          setJsonErr(e => ({ ...e, [key]: undefined }));
                                          changeStep(di, si, { data: tpl });
                                        }
                                      }}
                                    >
                                      Tpl
                                    </button>
                                  </div>
                                )}
                                <div className="rounded border overflow-hidden text-[10px] bg-white/40 dark:bg-slate-700/40">
                                {(() => { const key = `${di}:${si}`; const mode = dataMode[key] || (s && typeof s.data === 'object' && s.data !== null ? 'json' : 'text'); return (
                                  <>
                                    <button type="button" className={`px-2 py-0.5 ${mode === 'text' ? 'bg-slate-100 dark:bg-slate-600/60' : ''}`} onClick={() => {
                                      setDataMode(m => ({ ...m, [key]: 'text' }));
                                      setJsonErr(e => ({ ...e, [key]: undefined }));
                                      if (s && typeof s.data === 'object' && s.data !== null) {
                                        changeStep(di, si, { data: JSON.stringify(s.data) });
                                        setJsonText(t => ({ ...t, [key]: JSON.stringify(s.data, null, 2) }));
                                      }
                                    }}>Txt</button>
                                    <button type="button" className={`px-2 py-0.5 ${mode === 'json' ? 'bg-slate-100 dark:bg-slate-600/60' : ''}`} onClick={() => {
                                      const raw = jsonText[key] ?? (s?.data != null ? String(s.data) : '');
                                      try {
                                        const parsed = raw && raw.trim() ? JSON.parse(raw) : {};
                                        changeStep(di, si, { data: parsed });
                                        setJsonErr(e => ({ ...e, [key]: undefined }));
                                      } catch (err) {
                                        setJsonErr(e => ({ ...e, [key]: 'Invalid JSON' }));
                                      }
                                      setDataMode(m => ({ ...m, [key]: 'json' }));
                                    }}>JSON</button>
                                  </>
                                ); })()}
                                </div>
                              </div>
                            </div>
                            {(() => { const key = `${di}:${si}`; const mode = dataMode[key] || (s && typeof s.data === 'object' && s.data !== null ? 'json' : 'text'); return (
                              mode === 'json' ? (
                                <>
                                  <textarea
                                    className={`field-sm font-mono text-[11px] min-h-[90px] resize-y ${jsonErr[key] ? 'border-red-500' : ''}`}
                                    placeholder='e.g. {"key":"value"}'
                                    value={jsonText[key] ?? (typeof s.data === 'object' && s.data !== null ? JSON.stringify(s.data, null, 2) : '')}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setJsonText(t => ({ ...t, [key]: val }));
                                      try {
                                        const parsed = val && val.trim() ? JSON.parse(val) : {};
                                        changeStep(di, si, { data: parsed });
                                        setJsonErr(er => ({ ...er, [key]: undefined }));
                                      } catch (err) {
                                        setJsonErr(er => ({ ...er, [key]: 'Invalid JSON' }));
                                      }
                                    }}
                                  />
                                  {jsonErr[key] && <p className="text-[10px] text-red-600 mt-1">{jsonErr[key]}</p>}
                                </>
                              ) : (
                                <input className="field-sm" placeholder="step data (optional)" value={typeof s.data === 'object' && s.data !== null ? JSON.stringify(s.data) : (s.data || '')} onChange={e => changeStep(di, si, { data: e.target.value })} />
                              )
                            ); })()}
                          </div>
                          <div className="flex items-center gap-4">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Iterate</label>
                              <input type="checkbox" checked={!!s.iterate} onChange={e => changeStep(di, si, { iterate: e.target.checked })} />
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Soft</label>
                              <input type="checkbox" checked={!!s.soft} onChange={e => changeStep(di, si, { soft: e.target.checked })} />
                            </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Group</label>
                            <input className="field-sm" placeholder="Group (optional)" value={s.iterativeGroup || ''} onChange={e => changeStep(di, si, { iterativeGroup: e.target.value })} />
                          </div>
                          {s.action === 'custom' && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Custom Name <span className="text-red-600">*</span></label>
                              <input aria-required="true" className="field-sm" placeholder="custom logic key" value={s.customName || ''} onChange={e => changeStep(di, si, { customName: e.target.value })} />
                            </div>
                          )}
                          {s.action === 'upload' && (
                            <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-3">
                              <div className="flex items-end gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Clear</label>
                                <input type="checkbox" checked={!!s.clearFirst} onChange={e => changeStep(di, si, { clearFirst: e.target.checked })} />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Resolve</label>
                                <select className="field-sm" value={s.resolveFrom || 'cwd'} onChange={e => changeStep(di, si, { resolveFrom: e.target.value })}>
                                  <option value="cwd">cwd</option>
                                  <option value="absolute">absolute</option>
                                </select>
                              </div>
                              <div className="md:col-span-4 space-y-1">
                                  <textarea
                                    className={`field-sm font-mono text-[11px] min-h-[72px] resize-y ${filesErr[`${di}:${si}`] ? 'border-red-500' : ''}`}
                                    placeholder='FILES JSON e.g. [{"path":"relative/file.png"}]'
                                  value={filesText[`${di}:${si}`] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const key = `${di}:${si}`;
                                    setFilesText(t => ({ ...t, [key]: val }));
                                    try {
                                      const parsed = val && val.trim() ? JSON.parse(val) : [];
                                      if (!Array.isArray(parsed)) throw new Error('Files must be an array');
                                      changeStep(di, si, { files: parsed });
                                      setFilesErr(er => ({ ...er, [key]: undefined }));
                                    } catch (err) {
                                      setFilesErr(er => ({ ...er, [key]: 'Invalid JSON' }));
                                    }
                                  }}
                                />
                                {filesErr[`${di}:${si}`] && <p className="text-[10px] text-red-600 mt-1">{filesErr[`${di}:${si}`]}</p>}
                              </div>
                            </div>
                          )}

                          <div className="md:col-span-5 space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Validations</h5>
                              <button className="icon-btn icon-add icon-btn-sm" onClick={() => addValidation(di, si)} title="Add validation" aria-label="Add validation"><span className="mi">add</span> Validation</button>
                            </div>
                            {(s.validations || []).map((v, vi) => (
                              <div key={vi} className="validation-block mt-1 p-2 rounded grid grid-cols-1 md:grid-cols-6 gap-2 text-[12px]">
                                <div>
                                  <AppSelect
                                    label="TYPE"
                                    required
                                    className="!space-y-0"
                                    selectClassName="h-[30px] field-sm"
                                    value={v.type || ''}
                                    placeholder="Select type…"
                                    onChange={e => changeValidation(di, si, vi, { type: e.target.value })}
                                    options={['toBeVisible','toBeHidden','toHaveTitle','toHaveURL','toHaveText','toHaveValue','toHaveAttribute','toHaveCSS','toHaveClass','custom']}
                                  />
                                </div>
                                <div>
                                  <input className="field-sm" placeholder="selector" value={v.selector || ''} onChange={e => changeValidation(di, si, vi, { selector: e.target.value })} />
                                </div>
                                <div>
                                  <AppSelect
                                    label="SELECTOR TYPE"
                                    className="!space-y-0"
                                    selectClassName="h-[30px] field-sm"
                                    value={v.selectorType || 'css'}
                                    onChange={e => changeValidation(di, si, vi, { selectorType: e.target.value })}
                                    options={['css','xpath','id','text','testId']}
                                  />
                                </div>
                                <div>
                                  <input className="field-sm" placeholder="path" value={v.path || ''} onChange={e => changeValidation(di, si, vi, { path: e.target.value })} />
                                </div>
                                <div>
                                  <input
                                    className="field-sm"
                                    placeholder={v.type === 'toHaveText' ? 'expected text' : 'data (optional)'}
                                    aria-required={expectsData(v.type) ? 'true' : 'false'}
                                    value={v.data || ''}
                                    onChange={e => changeValidation(di, si, vi, { data: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <input className="field-sm" placeholder="message" value={v.message || ''} onChange={e => changeValidation(di, si, vi, { message: e.target.value })} />
                                </div>
                                {v.type === 'custom' && (
                                  <div>
                                    <input className="field-sm" placeholder="custom key" value={v.customName || ''} onChange={e => changeValidation(di, si, vi, { customName: e.target.value })} />
                                  </div>
                                )}
                                <div>
                                  <input className="field-sm" placeholder="attribute" value={v.attribute || ''} onChange={e => changeValidation(di, si, vi, { attribute: e.target.value })} />
                                </div>
                                <div>
                                  <input className="field-sm" placeholder="css property" value={v.cssProperty || ''} onChange={e => changeValidation(di, si, vi, { cssProperty: e.target.value })} />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Soft</label>
                                  <input type="checkbox" checked={!!v.soft} onChange={e => changeValidation(di, si, vi, { soft: e.target.checked })} />
                                  <button title="Remove validation" aria-label="Remove validation" className="icon-btn icon-danger icon-btn-sm ml-auto" onClick={() => removeValidation(di, si, vi)}><span className="mi">delete</span></button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="md:col-span-6 space-y-1">
                            <textarea
                              className={`field-sm font-mono text-[11px] min-h-[72px] resize-y ${actionErr[`${di}:${si}`] ? 'border-red-500' : ''}`}
                              placeholder='ACTION OPTIONS JSON e.g. {"timeout":5000}'
                              value={actionText[`${di}:${si}`] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const key = `${di}:${si}`;
                                setActionText(t => ({ ...t, [key]: val }));
                                try {
                                  const parsed = val && val.trim() ? JSON.parse(val) : undefined;
                                  changeStep(di, si, { actionOptions: parsed });
                                  setActionErr(er => ({ ...er, [key]: undefined }));
                                } catch (err) {
                                  setActionErr(er => ({ ...er, [key]: 'Invalid JSON' }));
                                }
                              }}
                            />
                            {actionErr[`${di}:${si}`] && <p className="text-[10px] text-red-600 mt-1">{actionErr[`${di}:${si}`]}</p>}
                          </div>

                          <div className="flex gap-2 md:col-span-6 pt-1">
                            <button title="Move step up" aria-label="Move step up" className="icon-btn icon-muted icon-btn-sm" disabled={si === 0} onClick={() => {
                              if (si === 0) return;
                              setDrafts(ds => {
                                const n = [...ds];
                                const steps = [...n[di].testSteps];
                                const tmp = steps[si - 1];
                                steps[si - 1] = steps[si];
                                steps[si] = tmp;
                                n[di] = { ...n[di], testSteps: steps };
                                return n;
                              });
                            }}><span className="mi">arrow_upward</span></button>
                            <button title="Move step down" aria-label="Move step down" className="icon-btn icon-muted icon-btn-sm" disabled={si === drafts[di].testSteps.length - 1} onClick={() => {
                              setDrafts(ds => {
                                const n = [...ds];
                                if (si === n[di].testSteps.length - 1) return n;
                                const steps = [...n[di].testSteps];
                                const tmp = steps[si + 1];
                                steps[si + 1] = steps[si];
                                steps[si] = tmp;
                                n[di] = { ...n[di], testSteps: steps };
                                return n;
                              });
                            }}><span className="mi">arrow_downward</span></button>
                            <button title="Duplicate step" aria-label="Duplicate step" className="icon-btn icon-add icon-btn-sm" onClick={() => {
                              setDrafts(ds => {
                                const n = [...ds];
                                const steps = [...n[di].testSteps];
                                const clone = { ...steps[si], validations: steps[si].validations ? JSON.parse(JSON.stringify(steps[si].validations)) : [], data: typeof steps[si].data === 'object' ? JSON.parse(JSON.stringify(steps[si].data)) : steps[si].data };
                                steps.splice(si + 1, 0, clone);
                                n[di] = { ...n[di], testSteps: steps };
                                return n;
                              });
                            }}><span className="mi">content_copy</span></button>
                            <button title="Remove step" aria-label="Remove step" className="icon-btn icon-danger icon-btn-sm" onClick={() => removeStep(di, si)}><span className="mi">delete</span></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-2">
            <button className="icon-btn icon-add" onClick={addDraft} title="Add test case" aria-label="Add test case"><span className="mi">add</span> Test Case</button>
            <button className="icon-btn icon-success" onClick={saveAll} title="Save all" aria-label="Save all"><span className="mi">save</span> Save All</button>
          </div>
        </>
      )}
    </div>
  );
}
