import React, { useState, useEffect, useMemo } from 'react';
import { createTestcases, updateTestcase } from '../api';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';

const emptyStep = () => ({ stepName: '', action: 'goto', path: '', selector: '', selectorType: 'css', data: '', waitTime: 0, iterate: false, customName: '', soft: false, validations: [] });
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
  if (existing && existing.filename) {
    await updateTestcase(existing.filename, data);
    logger.info('Updated test case', { filename: existing.filename, description: data.description });
  } else {
    await createTestcases(data);
    logger.info('Created test case', { description: data.description });
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
    <div className="p-4 border rounded bg-white">
      {/* Top toolbar: switch between Form and JSON views */}
      <div className="mb-3 flex items-center gap-2">
        <div className="ml-auto rounded border overflow-hidden" role="tablist" aria-label="View mode">
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'form' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('form')}><span className="mi">edit_note</span><span>Form</span></button>
          <button type="button" className={`icon-btn icon-muted ${viewMode === 'json' ? 'icon-indigo' : ''}`} onClick={() => setViewMode('json')}><span className="mi">code</span><span>JSON</span></button>
        </div>
      </div>

      {viewMode === 'json' ? (
        <JsonViewer />
      ) : (
        <>
      {!!errors.length && (
        <div className="mb-3 p-2 border border-red-300 bg-red-50 text-red-700 rounded">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Description <span className="text-red-600">*</span></label>
          <input aria-required="true" className="w-full px-3 py-2 border rounded" value={data.description} onChange={e => setData({ ...data, description: e.target.value })} placeholder="Short description of the test case" />
        </div>
        <div>
          <label className="block text-sm font-medium">Product <span className="text-red-600">*</span></label>
          <input aria-required="true" className="w-full px-3 py-2 border rounded" value={data.product || ''} onChange={e => setData({ ...data, product: e.target.value })} placeholder="e.g., Web, Mobile, API" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:col-span-1">
          <div>
            <label className="block text-sm font-medium">Test Order</label>
            <input className="w-full px-3 py-2 border rounded" type="number" value={data.testOrder ?? ''} onChange={e => setData({ ...data, testOrder: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-sm">Enabled</span>
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

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Test Steps</h3>
        {data.testSteps.map((s, i) => (
          <details key={i} className="border rounded mb-2 bg-blue-50/40 border-l-4 border-blue-400" open>
            <summary className="px-3 py-2 cursor-pointer flex items-center gap-2">
              <span className="text-sm inline-block px-1.5 py-0.5 rounded bg-blue-100 border">Step {i + 1}</span>
              <span className="font-medium flex-1 truncate">{s.stepName || '(unnamed step)'}</span>
              <button type="button" title="Remove step" aria-label="Remove step" className="icon-btn icon-danger" onClick={(e) => { e.preventDefault(); removeStep(i); }}><span className="mi">delete</span></button>
            </summary>
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="md:col-span-2">
                <label className="block text-sm">Step Name</label>
                <input className="w-full px-2 py-1 border rounded" placeholder="stepName" value={s.stepName} onChange={e => changeStep(i, { stepName: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Action <span className="text-red-600">*</span></label>
                <select className="w-full px-2 py-1 border rounded" value={s.action} onChange={e => changeStep(i, { action: e.target.value })}>
                  <option value="goto">goto</option>
                  <option value="click">click</option>
                  <option value="fill">fill</option>
                  <option value="type">type</option>
                  <option value="press">press</option>
                  <option value="hover">hover</option>
                  <option value="upload">upload</option>
                  <option value="waitForTimeout">waitForTimeout</option>
                  <option value="custom">custom</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">goto uses path; click/hover use selector; fill/type/press use selector + data; waitForTimeout uses waitTime; custom uses customName.</p>
              </div>
              <div>
                <label className="block text-sm">Selector / Path {(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                <input aria-required={(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) ? 'true' : 'false'} className="w-full px-2 py-1 border rounded" placeholder="selector or path" value={s.selector || s.path} onChange={e => changeStep(i, { selector: e.target.value, path: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Selector Type</label>
                <select className="w-full px-2 py-1 border rounded" value={s.selectorType || 'css'} onChange={e => changeStep(i, { selectorType: e.target.value })}>
                  <option value="css">css</option>
                  <option value="xpath">xpath</option>
                  <option value="id">id</option>
                  <option value="text">text</option>
                  <option value="testId">testId</option>
                </select>
              </div>
              <div>
                <label className="block text-sm">Nth (optional)</label>
                <input className="w-full px-2 py-1 border rounded" type="number" min="0" placeholder="0" value={s.nth ?? ''} onChange={e => changeStep(i, { nth: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm">Wait Time (ms)</label>
                <input className="w-full px-2 py-1 border rounded" type="number" min="0" placeholder="e.g., 500" value={s.waitTime || 0} onChange={e => changeStep(i, { waitTime: Number(e.target.value || 0) })} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm">Step Data {(['fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                  <div className="flex items-center gap-2">
                    {/* Templates */}
                    {(s.action === 'custom' || s.action === 'upload') && (
                      <div className="rounded border overflow-hidden text-xs">
                        {/* Insert templates */}
                        <button type="button" className="px-2 py-1" title="Insert template"
                          onClick={() => {
                            // default: insert minimal template per action
                            const insert = () => {
                              if (s.action === 'custom') {
                                const tpl = { word: 'Example', selector: '', nth: 0, mode: 'mouse', method: 'double', wordwise: false };
                                const txt = JSON.stringify(tpl, null, 2);
                                setDataModeByStep(m => ({ ...m, [i]: 'json' }));
                                setJsonTextByStep(t => ({ ...t, [i]: txt }));
                                setJsonErrByStep(e => ({ ...e, [i]: null }));
                                setData(d => { const next = [...d.testSteps]; next[i] = { ...next[i], data: tpl }; return { ...d, testSteps: next }; });
                              } else if (s.action === 'upload') {
                                const tpl = ["relative/path/to/file.png"]; const txt = JSON.stringify(tpl, null, 2);
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
                      // switch to text: if current data is object, stringify it
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
                      // switch to json: attempt to parse, or set {} and store raw text
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
                      className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[90px] ${jsonErrByStep[i] ? 'border-red-500' : ''}`}
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
                    className="w-full px-2 py-1 border rounded"
                    placeholder="data (optional)"
                    value={typeof s.data === 'object' && s.data !== null ? JSON.stringify(s.data) : (s.data || '')}
                    onChange={e => changeStep(i, { data: e.target.value })}
                  />
                )}
              </div>
              {/* Upload advanced options */}
              {s.action === 'upload' && (
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                  <div className="flex items-end gap-2">
                    <label className="text-sm">Clear First</label>
                    <input type="checkbox" checked={!!s.clearFirst} onChange={e => changeStep(i, { clearFirst: e.target.checked })} />
                  </div>
                  <div>
                    <label className="block text-sm">Resolve From</label>
                    <select className="w-full px-2 py-1 border rounded" value={s.resolveFrom || 'cwd'} onChange={e => changeStep(i, { resolveFrom: e.target.value })}>
                      <option value="cwd">cwd</option>
                      <option value="absolute">absolute</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm">Files (JSON, optional)</label>
                    <textarea
                      className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[72px] ${filesErrByStep[i] ? 'border-red-500' : ''}`}
                      placeholder='e.g. [{"path":"relative/file.png"}] or [{"contentBase64":"...","name":"file.txt","mimeType":"text/plain"}]'
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
                <div>
                  <label className="block text-sm">Custom Name <span className="text-red-600">*</span></label>
                  <input aria-required="true" className="w-full px-2 py-1 border rounded" placeholder="custom logic key" value={s.customName || ''} onChange={e => changeStep(i, { customName: e.target.value })} />
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="text-sm">Iterate elements</label>
                <input type="checkbox" checked={!!s.iterate} onChange={e => changeStep(i, { iterate: e.target.checked })} />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm">Soft</label>
                <input type="checkbox" checked={!!s.soft} onChange={e => changeStep(i, { soft: e.target.checked })} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm">Action Options (JSON)</label>
                <textarea
                  className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[72px] ${actionErrByStep[i] ? 'border-red-500' : ''}`}
                  placeholder='e.g. {"timeout": 5000} or {"force": true}'
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
            <div className="px-3 pb-3">
              <h4 className="font-medium">Validations</h4>
              {(s.validations || []).map((v, vi) => (
                <div key={vi} className="p-2 border rounded my-2 grid grid-cols-1 md:grid-cols-6 gap-2 bg-amber-50/60 border-l-4 border-amber-400">
                  <div>
                    <label className="block text-sm">Type <span className="text-red-600">*</span></label>
                    <select className="w-full px-2 py-1 border rounded" value={v.type || ''} onChange={e => changeValidation(i, vi, { type: e.target.value })}>
                      <option value="">Select type…</option>
                      <option value="toBeVisible">toBeVisible</option>
                      <option value="toBeHidden">toBeHidden</option>
                      <option value="toHaveTitle">toHaveTitle</option>
                      <option value="toHaveURL">toHaveURL</option>
                      <option value="toHaveText">toHaveText</option>
                      <option value="toHaveValue">toHaveValue</option>
                      <option value="toHaveAttribute">toHaveAttribute</option>
                      <option value="toHaveCSS">toHaveCSS</option>
                      <option value="toHaveClass">toHaveClass</option>
                      <option value="custom">custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Selector</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="selector" value={v.selector || ''} onChange={e => changeValidation(i, vi, { selector: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm">Selector Type</label>
                    <select className="w-full px-2 py-1 border rounded" value={v.selectorType || 'css'} onChange={e => changeValidation(i, vi, { selectorType: e.target.value })}>
                      <option value="css">css</option>
                      <option value="xpath">xpath</option>
                      <option value="id">id</option>
                      <option value="text">text</option>
                      <option value="testId">testId</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Path (optional)</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="path" value={v.path || ''} onChange={e => changeValidation(i, vi, { path: e.target.value })} />
                  </div>
                  {expectsData(v.type) && (
                    <div>
                      <label className="block text-sm">Data <span className="text-red-600">*</span></label>
                      <input aria-required="true" className="w-full px-2 py-1 border rounded" placeholder={v.type === 'toHaveText' ? 'expected text' : 'data'} value={v.data || ''} onChange={e => changeValidation(i, vi, { data: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm">Message</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="message" value={v.message || ''} onChange={e => changeValidation(i, vi, { message: e.target.value })} />
                  </div>
                  {v.type === 'custom' && (
                    <div>
                      <label className="block text-sm">Custom Name <span className="text-red-600">*</span></label>
                      <input className="w-full px-2 py-1 border rounded" placeholder="custom validation key" value={v.customName || ''} onChange={e => changeValidation(i, vi, { customName: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm">Attribute {v.type === 'toHaveAttribute' && <span className='text-red-600'>*</span>}</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="e.g., aria-hidden" value={v.attribute || ''} onChange={e => changeValidation(i, vi, { attribute: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm">CSS Property {v.type === 'toHaveCSS' && <span className='text-red-600'>*</span>}</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="e.g., display" value={v.cssProperty || ''} onChange={e => changeValidation(i, vi, { cssProperty: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="text-sm">Soft</label>
                    <input type="checkbox" checked={!!v.soft} onChange={e => changeValidation(i, vi, { soft: e.target.checked })} />
                    <button type="button" title="Remove validation" aria-label="Remove validation" className="icon-btn icon-danger ml-auto" onClick={() => removeValidation(i, vi)}><span className="mi">delete</span></button>
                  </div>
                </div>
              ))}
              <button className="icon-btn icon-add" onClick={() => addValidation(i)} title="Add validation" aria-label="Add validation"><span className="mi">add</span></button>
            </div>
          </details>
        ))}
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
