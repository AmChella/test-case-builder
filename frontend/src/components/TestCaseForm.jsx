import React, { useState, useEffect, useMemo } from 'react';
import AppSelect from './ui/AppSelect';
import { createTestcases, updateTestcase } from '../api';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';

const emptyStep = () => ({ stepName: '', action: 'goto', path: '', selector: '', selectorType: 'css', data: '', waitTime: 0, iterate: false, iterativeGroup: '', customName: '', soft: false, validations: [] });
const emptyValidation = () => ({ type: 'toBeVisible', selector: '', selectorType: 'css', path: '', data: '', message: '', soft: false, attribute: '', cssProperty: '' });

export default function TestCaseForm({ existing, onSaved, defaultProduct = 'General' }) {
  const [viewMode, setViewMode] = useState('form'); // 'form' | 'json'
  const [data, setData] = useState({ description: '', enabled: true, testSteps: [], testOrder: 0, product: defaultProduct });
  const [errors, setErrors] = useState([]);
  const toast = useToast();
  const logger = useLogger();
  // UI-only state: per-step data mode ('text' | 'json') and raw JSON text & parse errors
  const [dataModeByStep, setDataModeByStep] = useState({}); // { [index]: 'text'|'json' }
  const [jsonTextByStep, setJsonTextByStep] = useState({}); // { [index]: string }
  const [jsonErrByStep, setJsonErrByStep] = useState({}); // { [index]: string|null }
  // Action options JSON per-step
  const [actionTextByStep, setActionTextByStep] = useState({}); // { [index]: string }
  const [actionErrByStep, setActionErrByStep] = useState({}); // { [index]: string|null }
  // Upload files JSON per-step (optional advanced)
  const [filesTextByStep, setFilesTextByStep] = useState({}); // { [index]: string }
  const [filesErrByStep, setFilesErrByStep] = useState({}); // { [index]: string|null }

  const expectsData = (type) => type === 'toHaveText' || type === 'count' || type === 'text';
  const selectorRequiredFor = new Set(['toBeVisible','toBeHidden','toHaveText','toHaveValue','toHaveAttribute','toHaveCSS','toHaveClass']);

  useEffect(() => {
    if (existing) setData(existing); else setData({ description: '', enabled: true, testSteps: [], testOrder: 0, product: defaultProduct });
  }, [existing, defaultProduct]);

  // Keep UI mode and JSON text in sync with current steps
  useEffect(() => {
    const modes = {};
    const texts = {};
    const actionTexts = {};
    const fileTexts = {};
    (data.testSteps || []).forEach((s, i) => {
      const isJson = s && typeof s.data === 'object' && s.data !== null;
      modes[i] = isJson ? 'json' : 'text';
      if (isJson) texts[i] = JSON.stringify(s.data, null, 2);
      else texts[i] = s?.data != null ? String(s.data) : '';
      if (s && s.actionOptions && typeof s.actionOptions === 'object') {
        actionTexts[i] = JSON.stringify(s.actionOptions, null, 2);
      } else {
        actionTexts[i] = '';
      }
      if (Array.isArray(s?.files)) {
        fileTexts[i] = JSON.stringify(s.files, null, 2);
      } else {
        fileTexts[i] = '';
      }
    });
    setDataModeByStep(modes);
    setJsonTextByStep(texts);
    setJsonErrByStep({});
    setActionTextByStep(actionTexts);
    setActionErrByStep({});
    setFilesTextByStep(fileTexts);
    setFilesErrByStep({});
  }, [data.testSteps]);

  function addStep() { setData(d => ({ ...d, testSteps: [...d.testSteps, emptyStep()] })); }
  function removeStep(i) { setData(d => ({ ...d, testSteps: d.testSteps.filter((_, idx) => idx !== i) })); }
  function changeStep(i, patch) { setData(d => { const s = [...d.testSteps]; s[i] = { ...s[i], ...patch }; return { ...d, testSteps: s }; }); }
  function addValidation(i) { setData(d => { const s = [...d.testSteps]; const v = s[i].validations || []; s[i] = { ...s[i], validations: [...v, emptyValidation()] }; return { ...d, testSteps: s }; }); }
  function changeValidation(i, vi, patch) { setData(d => { const s = [...d.testSteps]; const v = [...(s[i].validations || [])]; v[vi] = { ...v[vi], ...patch }; s[i] = { ...s[i], validations: v }; return { ...d, testSteps: s }; }); }
  function removeValidation(i, vi) { setData(d => { const s = [...d.testSteps]; const v = (s[i].validations || []).filter((_, idx) => idx !== vi); s[i] = { ...s[i], validations: v }; return { ...d, testSteps: s }; }); }

  function clientValidate(d) {
    const errs = [];
    // Block save if any JSON parse errors exist
    Object.values(jsonErrByStep || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in step data before saving.'); });
    Object.values(actionErrByStep || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in action options before saving.'); });
    Object.values(filesErrByStep || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in upload files before saving.'); });
  if (!d.description?.trim()) errs.push('Description is required.');
  if (!d.product?.trim()) errs.push('Product is required.');
    if (!Array.isArray(d.testSteps) || d.testSteps.length === 0) errs.push('At least one step is required.');
    d.testSteps.forEach((s, i) => {
      if (!s.action) errs.push(`Step ${i + 1}: action is required.`);
      if (s.action === 'goto' && !(s.path && s.path.toString().length)) errs.push(`Step ${i + 1}: path is required for goto.`);
      if ((['click','hover','fill','type','press']).includes(s.action) && !(s.selector && s.selector.toString().length)) errs.push(`Step ${i + 1}: selector is required for ${s.action}.`);
      if ((['fill','type','press']).includes(s.action) && (s.data === undefined || s.data === null || s.data === '')) errs.push(`Step ${i + 1}: data is required for ${s.action}.`);
      if (s.action === 'custom' && !(s.customName && String(s.customName).trim())) errs.push(`Step ${i + 1}: customName is required for custom action.`);
      if (s.action === 'waitForTimeout' && (typeof s.waitTime !== 'number' || s.waitTime < 0)) errs.push(`Step ${i + 1}: waitTime must be >= 0.`);
      if (s.waitTime !== undefined && s.waitTime !== null && s.waitTime !== '' && Number(s.waitTime) < 0) errs.push(`Step ${i + 1}: waitTime must be >= 0.`);
      if (s.nth !== undefined && s.nth !== null && s.nth !== '' && (!Number.isInteger(Number(s.nth)) || Number(s.nth) < 0)) errs.push(`Step ${i + 1}: nth must be a non-negative integer.`);
      (s.validations || []).forEach((v, vi) => {
        if (!v.type) errs.push(`Step ${i + 1} - Validation ${vi + 1}: type is required.`);
        if (selectorRequiredFor.has(v.type) && !v.selector) errs.push(`Step ${i + 1} - Validation ${vi + 1}: selector is required for ${v.type}.`);
        if (expectsData(v.type) && (v.data === undefined || v.data === null || v.data === '')) {
          errs.push(`Step ${i + 1} - Validation ${vi + 1}: data is required for ${v.type}.`);
        }
        if (v.type === 'toHaveAttribute' && !v.attribute) errs.push(`Step ${i + 1} - Validation ${vi + 1}: attribute is required for toHaveAttribute.`);
        if (v.type === 'toHaveCSS' && !v.cssProperty) errs.push(`Step ${i + 1} - Validation ${vi + 1}: cssProperty is required for toHaveCSS.`);
      });
    });
    return errs;
  }

  async function save() {
    try {
      const localErrors = clientValidate(data);
      setErrors(localErrors);
      if (localErrors.length) return;
      // Prepare payload: remove empty iterativeGroup fields
      const payload = {
        ...data,
        testSteps: (data.testSteps || []).map(s => {
          const copy = { ...s };
          if (!copy.iterativeGroup) delete copy.iterativeGroup;
          return copy;
        })
      };
  if (existing && existing.filename) {
    await updateTestcase(existing.filename, payload);
    logger.info('Updated test case', { filename: existing.filename, description: payload.description });
  } else {
    await createTestcases(payload);
    logger.info('Created test case', { description: payload.description });
  }
      onSaved && onSaved();
  toast.success(existing && existing.filename ? 'Updated test case' : 'Created test case');
    } catch (err) {
      console.error(err);
      const serverErr = (err?.response?.data?.error || err.message);
      setErrors(prev => [...prev, serverErr]);
  toast.error('Save failed — ' + serverErr);
      logger.error('Save failed', { error: serverErr, editing: !!existing?.filename });
    }
  }

  // JSON Tree Viewer components
  function JsonTree({ value, path = '$', depth = 0, expanded, toggle }) {
    const isObj = value && typeof value === 'object';
    const isArr = Array.isArray(value);
    const isCollapsible = isObj;
    const open = expanded.has(path);
    const indentStyle = { marginLeft: depth ? 16 : 0 };

    if (!isCollapsible) {
      return (
        <div style={indentStyle} className="text-xs text-gray-700 break-all">
          {typeof value === 'string' ? '"' + value + '"' : String(value)}
        </div>
      );
    }

    const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
    return (
      <div style={indentStyle} className="text-xs">
        <button type="button" className="icon-btn icon-muted icon-btn-sm" onClick={() => toggle(path)} aria-label={open ? 'Collapse' : 'Expand'}>
          <span className="mi">{open ? 'remove' : 'add'}</span>
        </button>
        <span className="ml-2 text-gray-800 align-middle">
          {isArr ? '[' : '{'} {entries.length} {isArr ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys')} {isArr ? ']' : '}'}
        </span>
        {open && (
          <div className="mt-1">
            {entries.map(([k, v]) => {
              const childPath = `${path}.${String(k)}`;
              const childIsObj = v && typeof v === 'object';
              return (
                <div key={childPath} className="mt-0.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-[160px] text-gray-600 break-all">
                      {isArr ? <span className="text-gray-500">[{String(k)}]</span> : <span>{String(k)}:</span>}
                    </div>
                    <div className="flex-1">
                      {childIsObj ? (
                        <JsonTree value={v} path={childPath} depth={depth + 1} expanded={expanded} toggle={toggle} />
                      ) : (
                        <div className="text-gray-700 break-all">{typeof v === 'string' ? '"' + v + '"' : String(v)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function JsonViewer() {
    const [expanded, setExpanded] = useState(new Set(['$']));
    const toggle = (key) => setExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    const expandAll = () => {
      const keys = new Set(['$']);
      const walk = (val, p) => {
        if (val && typeof val === 'object') {
          keys.add(p);
          if (Array.isArray(val)) val.forEach((v, i) => walk(v, `${p}.${i}`));
          else Object.entries(val).forEach(([k, v]) => walk(v, `${p}.${k}`));
        }
      };
      walk(data, '$');
      setExpanded(keys);
    };
    const collapseAll = () => setExpanded(new Set(['$']));
    const jsonText = useMemo(() => JSON.stringify(data, null, 2), [data]);

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button type="button" className="icon-btn icon-muted" onClick={expandAll} title="Expand all" aria-label="Expand all"><span className="mi">unfold_more</span><span>Expand</span></button>
          <button type="button" className="icon-btn icon-muted" onClick={collapseAll} title="Collapse all" aria-label="Collapse all"><span className="mi">unfold_less</span><span>Collapse</span></button>
          <button type="button" className="icon-btn icon-primary" title="Copy JSON" aria-label="Copy JSON" onClick={() => navigator.clipboard?.writeText(jsonText)}><span className="mi">content_copy</span><span>Copy</span></button>
          <button type="button" className="icon-btn icon-success" title="Download JSON" aria-label="Download JSON" onClick={() => { const blob = new Blob([jsonText], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (existing?.filename || 'testcase') + '.json'; a.click(); URL.revokeObjectURL(url); }}><span className="mi">download</span><span>Download</span></button>
          <div className="ml-auto">
            <button onClick={save} className="icon-btn icon-success" title="Save" aria-label="Save"><span className="mi">save</span><span>Save</span></button>
          </div>
        </div>
        <div className="border rounded bg-white p-3 max-h-[65vh] overflow-auto">
          <JsonTree value={data} expanded={expanded} toggle={toggle} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-5 animate-in">
      {/* Top toolbar: switch between Form and JSON views */}
  <div className="mb-4 flex items-center gap-2">
  <div className="ml-auto rounded border overflow-hidden shadow-sm" role="tablist" aria-label="View mode">
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'form' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('form')}><span className="mi">edit_note</span><span>Form</span></button>
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'json' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('json')}><span className="mi">code</span><span>JSON</span></button>
        </div>
      </div>

      {viewMode === 'json' ? (
        <JsonViewer />
      ) : (
        <>
      {!!errors.length && (
  <div className="mb-4 p-3 border border-red-300 bg-red-50 text-red-700 rounded-md text-sm">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        </div>
      )}

  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 space-y-1">
          <label className="block text-[11px] font-semibold tracking-wide uppercase">Description <span className="text-red-600">*</span></label>
          <input aria-required="true" className="field" value={data.description} onChange={e => setData({ ...data, description: e.target.value })} placeholder="SHORT DESCRIPTION" />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold tracking-wide uppercase">Product <span className="text-red-600">*</span></label>
          <input aria-required="true" className="field" value={data.product || ''} onChange={e => setData({ ...data, product: e.target.value })} placeholder="PRODUCT (E.G., WEB, MOBILE)" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-1">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold tracking-wide uppercase">Test Order</label>
            <input className="field" type="number" value={data.testOrder ?? ''} onChange={e => setData({ ...data, testOrder: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-[11px] font-semibold tracking-wide uppercase">Enabled</span>
            <button
              type="button"
              className={`toggle-btn ${data.enabled ? 'toggle-on' : 'toggle-off'}`}
              title={data.enabled ? 'Disable' : 'Enable'}
              aria-label="Toggle enabled"
              aria-pressed={data.enabled}
              onClick={() => setData({ ...data, enabled: !data.enabled })}
            >
              <span className="mi">{data.enabled ? 'toggle_on' : 'toggle_off'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center mb-3">
          <h3 className="section-title tracking-wide">Test Steps</h3>
          <span className="badge ml-2">{data.testSteps.length}</span>
        </div>
        {data.testSteps.map((s, i) => {
          const colors = ['blue','purple','emerald','amber','rose','indigo','teal'];
          let groupColor = 'blue';
          if (s.iterativeGroup) {
            let hash = 0; for (let c of s.iterativeGroup) hash = (hash * 31 + c.charCodeAt(0)) >>> 0; groupColor = colors[hash % colors.length];
          }
          const baseClasses = s.iterativeGroup
            ? `panel mb-3 border-l-4 pl-0 border-${groupColor}-400 bg-${groupColor}-50/40`
            : 'panel mb-3 border-l-4 pl-0 border-blue-400 bg-blue-50/40';
          return (
            <details key={i} className={baseClasses + ' overflow-hidden'} open>
              <summary className="px-4 py-2 cursor-pointer flex items-center gap-2 bg-gradient-to-r from-white/70 to-transparent dark:from-white/5">
                <span className="badge badge-outline">{i + 1}</span>
                <span className="font-medium flex-1 truncate text-sm">{s.stepName || '(unnamed step)'}</span>
                {s.iterativeGroup && (
                  <span className="badge" title="Iterative group name">
                    <span className="mi text-[14px] leading-none">group</span>{s.iterativeGroup}
                  </span>
                )}
                <button type="button" title="Move step up" aria-label="Move step up" className="icon-btn icon-muted" disabled={i === 0} onClick={(e) => { e.preventDefault(); setData(d => { if (i === 0) return d; const steps = [...d.testSteps]; const tmp = steps[i - 1]; steps[i - 1] = steps[i]; steps[i] = tmp; return { ...d, testSteps: steps }; }); }}><span className="mi">arrow_upward</span></button>
                <button type="button" title="Move step down" aria-label="Move step down" className="icon-btn icon-muted" disabled={i === data.testSteps.length - 1} onClick={(e) => { e.preventDefault(); setData(d => { if (i === d.testSteps.length - 1) return d; const steps = [...d.testSteps]; const tmp = steps[i + 1]; steps[i + 1] = steps[i]; steps[i] = tmp; return { ...d, testSteps: steps }; }); }}><span className="mi">arrow_downward</span></button>
                <button type="button" title="Duplicate step" aria-label="Duplicate step" className="icon-btn icon-add" onClick={(e) => { e.preventDefault(); setData(d => { const steps = [...d.testSteps]; const clone = { ...steps[i], validations: steps[i].validations ? JSON.parse(JSON.stringify(steps[i].validations)) : [], data: typeof steps[i].data === 'object' ? JSON.parse(JSON.stringify(steps[i].data)) : steps[i].data }; steps.splice(i + 1, 0, clone); return { ...d, testSteps: steps }; }); }}><span className="mi">content_copy</span></button>
                <button type="button" title="Remove step" aria-label="Remove step" className="icon-btn icon-danger" onClick={(e) => { e.preventDefault(); removeStep(i); }}><span className="mi">delete</span></button>
              </summary>
              <div className="px-4 pb-4 pt-3 grid grid-cols-1 md:grid-cols-6 gap-3 text-[13px]">
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-[10px] font-semibold tracking-wide uppercase">Step Name</label>
                  <input className="field-sm" placeholder="step name" value={s.stepName} onChange={e => changeStep(i, { stepName: e.target.value })} />
                </div>
                <div>
                  <AppSelect
                    label="ACTION"
                    required
                    className="!space-y-0"
                    selectClassName="h-[34px]"
                    value={s.action}
                    onChange={e => changeStep(i, { action: e.target.value })}
                    options={['goto','click','fill','type','press','hover','upload','waitForTimeout','custom']}
                    helper="Select the step action"
                  />
                  <p className="text-xs text-gray-500 mt-1">goto uses path; click/hover use selector; fill/type/press use selector + data; waitForTimeout uses waitTime; custom uses customName.</p>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold tracking-wide uppercase">Selector / Path {(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                  <input aria-required={(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) ? 'true' : 'false'} className="field-sm" placeholder="selector or path" value={s.selector || s.path} onChange={e => changeStep(i, { selector: e.target.value, path: e.target.value })} />
                </div>
                <div>
                  <AppSelect
                    label="SELECTOR TYPE"
                    className="!space-y-0"
                    selectClassName="h-[34px]"
                    value={s.selectorType || 'css'}
                    onChange={e => changeStep(i, { selectorType: e.target.value })}
                    options={['css','xpath','id','text','testId']}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold tracking-wide uppercase">Nth</label>
                  <input className="field-sm" type="number" min="0" placeholder="0" value={s.nth ?? ''} onChange={e => changeStep(i, { nth: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold tracking-wide uppercase">Wait (ms)</label>
                  <input className="field-sm" type="number" min="0" placeholder="500" value={s.waitTime || 0} onChange={e => changeStep(i, { waitTime: Number(e.target.value || 0) })} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-semibold tracking-wide uppercase">Step Data {(['fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                    <div className="flex items-center gap-2">
                      {(s.action === 'custom' || s.action === 'upload') && (
                        <div className="rounded border overflow-hidden text-xs">
                          <button type="button" className="px-2 py-1" title="Insert template"
                            onClick={() => {
                              const insert = () => {
                                if (s.action === 'custom') {
                                  const tpl = { word: 'Example', selector: '', nth: 0, mode: 'mouse', method: 'double', wordwise: false };
                                  const txt = JSON.stringify(tpl, null, 2);
                                  setDataModeByStep(m => ({ ...m, [i]: 'json' }));
                                  setJsonTextByStep(t => ({ ...t, [i]: txt }));
                                  setJsonErrByStep(e => ({ ...e, [i]: null }));
                                  setData(d => { const next = [...d.testSteps]; next[i] = { ...next[i], data: tpl }; return { ...d, testSteps: next }; });
                                } else if (s.action === 'upload') {
                                  const tpl = ['relative/path/to/file.png']; const txt = JSON.stringify(tpl, null, 2);
                                  setDataModeByStep(m => ({ ...m, [i]: 'json' }));
                                  setJsonTextByStep(t => ({ ...t, [i]: txt }));
                                  setJsonErrByStep(e => ({ ...e, [i]: null }));
                                  setData(d => { const next = [...d.testSteps]; next[i] = { ...next[i], data: tpl }; return { ...d, testSteps: next }; });
                                }
                              };
                              insert();
                            }}>Template</button>
                        </div>
                      )}
                      <div className="rounded border overflow-hidden text-xs" role="tablist" aria-label="Data type">
                        <button type="button" className={`px-2 py-1 ${dataModeByStep[i] === 'text' ? 'bg-gray-100' : ''}`} onClick={() => {
                          setData(d => {
                            const next = [...d.testSteps];
                            const cur = next[i] || {};
                            if (cur && typeof cur.data === 'object' && cur.data !== null) {
                              next[i] = { ...cur, data: JSON.stringify(cur.data) };
                            }
                            return { ...d, testSteps: next };
                          });
                          setDataModeByStep(m => ({ ...m, [i]: 'text' }));
                          setJsonErrByStep(e => ({ ...e, [i]: null }));
                        }}>Text</button>
                        <button type="button" className={`px-2 py-1 ${dataModeByStep[i] === 'json' ? 'bg-gray-100' : ''}`} onClick={() => {
                          const raw = jsonTextByStep[i] ?? (s?.data != null ? String(s.data) : '');
                          try {
                            const parsed = raw && raw.trim() ? JSON.parse(raw) : {};
                            setData(d => { const next = [...d.testSteps]; next[i] = { ...next[i], data: parsed }; return { ...d, testSteps: next }; });
                            setJsonErrByStep(e => ({ ...e, [i]: null }));
                          } catch (err) {
                            setJsonErrByStep(e => ({ ...e, [i]: 'Invalid JSON' }));
                          }
                          setDataModeByStep(m => ({ ...m, [i]: 'json' }));
                        }}>JSON</button>
                      </div>
                    </div>
                  </div>
                  {dataModeByStep[i] === 'json' ? (
                    <>
                      <textarea
                        className={`field-sm font-mono text-xs min-h-[90px] ${jsonErrByStep[i] ? 'border-red-500' : ''}`}
                        placeholder='e.g. {"key":"value"}'
                        value={jsonTextByStep[i] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setJsonTextByStep(t => ({ ...t, [i]: val }));
                          try {
                            const parsed = val && val.trim() ? JSON.parse(val) : {};
                            setData(d => { const next = [...d.testSteps]; next[i] = { ...next[i], data: parsed }; return { ...d, testSteps: next }; });
                            setJsonErrByStep(e => ({ ...e, [i]: null }));
                          } catch (err) {
                            setJsonErrByStep(e => ({ ...e, [i]: 'Invalid JSON' }));
                          }
                        }}
                      />
                      {jsonErrByStep[i] && <p className="text-xs text-red-600 mt-1">{jsonErrByStep[i]}</p>}
                    </>
                  ) : (
                    <input
                      aria-required={['fill','type','press'].includes(s.action) ? 'true' : 'false'}
                      className="field-sm"
                      placeholder="data (optional)"
                      value={typeof s.data === 'object' && s.data !== null ? JSON.stringify(s.data) : (s.data || '')}
                      onChange={e => changeStep(i, { data: e.target.value })}
                    />
                  )}
                </div>
                {s.action === 'upload' && (
                  <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <div className="flex items-end gap-2">
                      <label className="text-[10px] font-semibold tracking-wide uppercase">Clear</label>
                      <input type="checkbox" checked={!!s.clearFirst} onChange={e => changeStep(i, { clearFirst: e.target.checked })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Resolve</label>
                      <select className="field-sm" value={s.resolveFrom || 'cwd'} onChange={e => changeStep(i, { resolveFrom: e.target.value })}>
                        <option value="cwd">cwd</option>
                        <option value="absolute">absolute</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <textarea
                        className={`field-sm font-mono text-xs min-h-[72px] ${filesErrByStep[i] ? 'border-red-500' : ''}`}
                        placeholder='FILES JSON e.g. [{"path":"relative/file.png"}]'
                        value={filesTextByStep[i] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilesTextByStep(t => ({ ...t, [i]: val }));
                          try {
                            const parsed = val && val.trim() ? JSON.parse(val) : [];
                            if (!Array.isArray(parsed)) throw new Error('Files must be an array');
                            changeStep(i, { files: parsed });
                            setFilesErrByStep(er => ({ ...er, [i]: null }));
                          } catch (err) {
                            setFilesErrByStep(er => ({ ...er, [i]: 'Invalid JSON' }));
                          }
                        }}
                      />
                      {filesErrByStep[i] && <p className="text-xs text-red-600 mt-1">{filesErrByStep[i]}</p>}
                    </div>
                  </div>
                )}
                {s.action === 'custom' && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold tracking-wide uppercase">Custom Name <span className="text-red-600">*</span></label>
                    <input aria-required="true" className="field-sm" placeholder="custom logic key" value={s.customName || ''} onChange={e => changeStep(i, { customName: e.target.value })} />
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="text-[10px] font-semibold tracking-wide uppercase">Iterate</label>
                  <input type="checkbox" checked={!!s.iterate} onChange={e => changeStep(i, { iterate: e.target.checked })} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold tracking-wide uppercase">Group</label>
                  <input
                    className="field-sm"
                    placeholder="Group (optional)"
                    value={s.iterativeGroup || ''}
                    onChange={e => changeStep(i, { iterativeGroup: e.target.value })}
                  />
                  <p className="text-[11px] text-gray-500 mt-0.5">Steps sharing the same group name will be processed together.</p>
                </div>
                <div className="flex items-end gap-2">
                  <label className="text-[10px] font-semibold tracking-wide uppercase">Soft</label>
                  <input type="checkbox" checked={!!s.soft} onChange={e => changeStep(i, { soft: e.target.checked })} />
                </div>
                <div className="md:col-span-3">
                  <textarea
                    className={`field-sm font-mono text-xs min-h-[72px] ${actionErrByStep[i] ? 'border-red-500' : ''}`}
                    placeholder='ACTION OPTIONS JSON e.g. {"timeout":5000}'
                    value={actionTextByStep[i] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActionTextByStep(t => ({ ...t, [i]: val }));
                      try {
                        const parsed = val && val.trim() ? JSON.parse(val) : undefined;
                        changeStep(i, { actionOptions: parsed });
                        setActionErrByStep(er => ({ ...er, [i]: null }));
                      } catch (err) {
                        setActionErrByStep(er => ({ ...er, [i]: 'Invalid JSON' }));
                      }
                    }}
                  />
                  {actionErrByStep[i] && <p className="text-xs text-red-600 mt-1">{actionErrByStep[i]}</p>}
                </div>
              </div>
              <div className="px-4 pb-4">
                <h4 className="font-medium text-xs tracking-wide uppercase text-slate-500">Validations</h4>
                {(s.validations || []).map((v, vi) => (
                  <div key={vi} className="validation-block mt-2 p-2 rounded grid grid-cols-1 md:grid-cols-6 gap-2 text-[12px]">
                    <div>
                      <AppSelect
                        label="TYPE"
                        required
                        className="!space-y-0"
                        selectClassName="h-[34px]"
                        value={v.type || ''}
                        placeholder="Select type…"
                        onChange={e => changeValidation(i, vi, { type: e.target.value })}
                        options={['toBeVisible','toBeHidden','toHaveTitle','toHaveURL','toHaveText','toHaveValue','toHaveAttribute','toHaveCSS','toHaveClass','custom']}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Selector</label>
                      <input className="field-sm" placeholder="selector" value={v.selector || ''} onChange={e => changeValidation(i, vi, { selector: e.target.value })} />
                    </div>
                    <div>
                      <AppSelect
                        label="SELECTOR TYPE"
                        className="!space-y-0"
                        selectClassName="h-[34px]"
                        value={v.selectorType || 'css'}
                        onChange={e => changeValidation(i, vi, { selectorType: e.target.value })}
                        options={['css','xpath','id','text','testId']}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Path</label>
                      <input className="field-sm" placeholder="path" value={v.path || ''} onChange={e => changeValidation(i, vi, { path: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Data {expectsData(v.type) && <span className="text-red-600">*</span>}</label>
                      <input
                        aria-required={expectsData(v.type) ? 'true' : 'false'}
                        className="field-sm"
                        placeholder={v.type === 'toHaveText' ? 'expected text' : 'data (optional)'}
                        value={v.data || ''}
                        onChange={e => changeValidation(i, vi, { data: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Message</label>
                      <input className="field-sm" placeholder="message" value={v.message || ''} onChange={e => changeValidation(i, vi, { message: e.target.value })} />
                    </div>
                    {v.type === 'custom' && (
                      <div>
                        <label className="block text-[10px] font-semibold tracking-wide uppercase">Custom Name <span className="text-red-600">*</span></label>
                        <input className="field-sm" placeholder="custom validation key" value={v.customName || ''} onChange={e => changeValidation(i, vi, { customName: e.target.value })} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">Attribute {v.type === 'toHaveAttribute' && <span className='text-red-600'>*</span>}</label>
                      <input className="field-sm" placeholder="e.g., aria-hidden" value={v.attribute || ''} onChange={e => changeValidation(i, vi, { attribute: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold tracking-wide uppercase">CSS Property {v.type === 'toHaveCSS' && <span className='text-red-600'>*</span>}</label>
                      <input className="field-sm" placeholder="e.g., display" value={v.cssProperty || ''} onChange={e => changeValidation(i, vi, { cssProperty: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="text-[10px] font-semibold tracking-wide uppercase">Soft</label>
                      <input type="checkbox" checked={!!v.soft} onChange={e => changeValidation(i, vi, { soft: e.target.checked })} />
                      <button type="button" title="Remove validation" aria-label="Remove validation" className="icon-btn icon-danger ml-auto" onClick={() => removeValidation(i, vi)}><span className="mi">delete</span></button>
                    </div>
                  </div>
                ))}
                <button className="icon-btn icon-add" onClick={() => addValidation(i)} title="Add validation" aria-label="Add validation"><span className="mi">add</span></button>
              </div>
            </details>
          );
        })}
        <div className="mt-2">
          <button className="icon-btn icon-add" onClick={addStep} title="Add step" aria-label="Add step"><span className="mi">add</span></button>
        </div>
      </div>

    <div className="mt-4">
      <button onClick={save} className="icon-btn icon-success" title="Save" aria-label="Save"><span className="mi">save</span></button>
    </div>
        </>
      )}
    </div>
  );
}
