import React, { useEffect, useMemo, useState } from 'react';
import { createTestcases, fetchTestcases } from '../api';
import { useToast } from './ToastProvider';
import { useLogger } from './LoggerProvider';

const emptyStep = () => ({ stepName: '', action: 'goto', path: '', selector: '', selectorType: 'css', data: '', waitTime: 0, iterate: false, customName: '', soft: false, validations: [] });
const emptyValidation = () => ({ type: 'toBeVisible', selector: '', selectorType: 'css', path: '', data: '', message: '', soft: false, attribute: '', cssProperty: '' });
const emptyCase = () => ({ description: '', enabled: true, testSteps: [emptyStep()], testOrder: null });

export default function BatchCreate({ onSaved }) {
  const [drafts, setDrafts] = useState([emptyCase()]);
  const [errors, setErrors] = useState([]);
  const [existingOrders, setExistingOrders] = useState(new Set());
  const [openIndex, setOpenIndex] = useState(0); // accordion: only one open
  const toast = useToast();
  const logger = useLogger();
  // UI-only: track per-step data mode and raw JSON text/errors
  const [dataMode, setDataMode] = useState({}); // { `${di}:${si}`: 'text'|'json' }
  const [jsonText, setJsonText] = useState({}); // { `${di}:${si}`: string }
  const [jsonErr, setJsonErr] = useState({}); // { `${di}:${si}`: string|undefined }
  const [actionText, setActionText] = useState({}); // { `${di}:${si}`: string }
  const [actionErr, setActionErr] = useState({}); // { `${di}:${si}`: string|undefined }
  const [filesText, setFilesText] = useState({}); // { `${di}:${si}`: string }
  const [filesErr, setFilesErr] = useState({}); // { `${di}:${si}`: string|undefined }

  useEffect(() => {
    (async () => {
      try {
        const all = await fetchTestcases();
        const set = new Set(all.map(x => x.testOrder).filter(v => Number.isInteger(v)));
        setExistingOrders(set);
      } catch {}
    })();
  }, []);

  const addDraft = () => setDrafts(ds => { const next = [...ds, emptyCase()]; setOpenIndex(next.length - 1); return next; });
  const removeDraft = (i) => setDrafts(ds => {
    const next = ds.filter((_, idx) => idx !== i);
    // adjust open index
    if (next.length === 0) setOpenIndex(-1);
    else if (openIndex === i) setOpenIndex(Math.max(0, i - 1));
    else if (openIndex > i) setOpenIndex(openIndex - 1);
    return next;
  });
  const changeDraft = (i, patch) => setDrafts(ds => { const n = [...ds]; n[i] = { ...n[i], ...patch }; return n; });

  const addStep = (i) => setDrafts(ds => { const n = [...ds]; n[i] = { ...n[i], testSteps: [...n[i].testSteps, emptyStep()] }; return n; });
  const removeStep = (i, si) => setDrafts(ds => { const n = [...ds]; n[i] = { ...n[i], testSteps: n[i].testSteps.filter((_, idx) => idx !== si) }; return n; });
  const changeStep = (i, si, patch) => setDrafts(ds => { const n = [...ds]; const steps = [...n[i].testSteps]; steps[si] = { ...steps[si], ...patch }; n[i] = { ...n[i], testSteps: steps }; return n; });

  const addValidation = (i, si) => setDrafts(ds => { const n = [...ds]; const v = n[i].testSteps[si].validations || []; n[i].testSteps[si] = { ...n[i].testSteps[si], validations: [...v, emptyValidation()] }; return n; });
  const removeValidation = (i, si, vi) => setDrafts(ds => { const n = [...ds]; const v = (n[i].testSteps[si].validations || []).filter((_, idx) => idx !== vi); n[i].testSteps[si] = { ...n[i].testSteps[si], validations: v }; return n; });
  const changeValidation = (i, si, vi, patch) => setDrafts(ds => { const n = [...ds]; const v = [...(n[i].testSteps[si].validations || [])]; v[vi] = { ...v[vi], ...patch }; n[i].testSteps[si] = { ...n[i].testSteps[si], validations: v }; return n; });

  function expectsData(type) { return type === 'toHaveText' || type === 'count' || type === 'text'; }
  const selectorRequiredFor = new Set(['toBeVisible','toBeHidden','toHaveText','toHaveValue','toHaveAttribute','toHaveCSS','toHaveClass']);

  function clientValidateAll(list) {
    const errs = [];
    // Block save if any JSON parse errors
    Object.values(jsonErr || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in step data before saving.'); });
    Object.values(actionErr || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in action options before saving.'); });
    Object.values(filesErr || {}).forEach((msg) => { if (msg) errs.push('Fix JSON errors in upload files before saving.'); });
    // duplicate orders within batch
    const counts = new Map();
    list.forEach(d => { if (Number.isInteger(d.testOrder)) counts.set(d.testOrder, (counts.get(d.testOrder) || 0) + 1); });
    const dups = [...counts.entries()].filter(([, c]) => c > 1).map(([val]) => val);
    if (dups.length) errs.push(`Duplicate testOrder in batch: ${dups.join(', ')}`);
    list.forEach((d, di) => {
      if (!d.description?.trim()) errs.push(`Case ${di + 1}: description is required.`);
      if (!Array.isArray(d.testSteps) || d.testSteps.length === 0) errs.push(`Case ${di + 1}: at least one step is required.`);
      d.testSteps.forEach((s, i) => {
        if (!s.action) errs.push(`Case ${di + 1} - Step ${i + 1}: action is required.`);
        if (s.action === 'goto' && !(s.path && s.path.toString().length)) errs.push(`Case ${di + 1} - Step ${i + 1}: path is required for goto.`);
        if ((['click','hover','fill','type','press']).includes(s.action) && !(s.selector && s.selector.toString().length)) errs.push(`Case ${di + 1} - Step ${i + 1}: selector is required for ${s.action}.`);
        if ((['fill','type','press']).includes(s.action) && (s.data === undefined || s.data === null || s.data === '')) errs.push(`Case ${di + 1} - Step ${i + 1}: data is required for ${s.action}.`);
        if (s.action === 'waitForTimeout' && (typeof s.waitTime !== 'number' || s.waitTime < 0)) errs.push(`Case ${di + 1} - Step ${i + 1}: waitTime must be >= 0.`);
  if (s.waitTime !== undefined && s.waitTime !== null && s.waitTime !== '' && Number(s.waitTime) < 0) errs.push(`Case ${di + 1} - Step ${i + 1}: waitTime must be >= 0.`);
  if (s.nth !== undefined && s.nth !== null && s.nth !== '' && (!Number.isInteger(Number(s.nth)) || Number(s.nth) < 0)) errs.push(`Case ${di + 1} - Step ${i + 1}: nth must be a non-negative integer.`);
        (s.validations || []).forEach((v, vi) => {
          if (!v.type) errs.push(`Case ${di + 1} - Step ${i + 1} - Validation ${vi + 1}: type is required.`);
          if (selectorRequiredFor.has(v.type) && !v.selector) errs.push(`Case ${di + 1} - Step ${i + 1} - Validation ${vi + 1}: selector is required for ${v.type}.`);
          if (expectsData(v.type) && (v.data === undefined || v.data === null || v.data === '')) {
            errs.push(`Case ${di + 1} - Step ${i + 1} - Validation ${vi + 1}: data is required for ${v.type}.`);
          }
          if (v.type === 'toHaveAttribute' && !v.attribute) errs.push(`Case ${di + 1} - Step ${i + 1} - Validation ${vi + 1}: attribute is required for toHaveAttribute.`);
          if (v.type === 'toHaveCSS' && !v.cssProperty) errs.push(`Case ${di + 1} - Step ${i + 1} - Validation ${vi + 1}: cssProperty is required for toHaveCSS.`);
        });
      });
    });
    return errs;
  }

  async function saveAll() {
    try {
      const localErrors = clientValidateAll(drafts);
      setErrors(localErrors);
      if (localErrors.length) return;
      // conflicts against existing orders
      const conflicts = drafts
        .filter(d => Number.isInteger(d.testOrder) && existingOrders.has(d.testOrder))
        .map(d => d.testOrder);
      if (conflicts.length) {
        const uniq = [...new Set(conflicts)];
        const msgs = [`Conflicts with existing testOrder: ${uniq.join(', ')}`];
        setErrors(prev => [...prev, ...msgs]);
        return;
      }
      await createTestcases(drafts);
  toast.success('Saved all test cases');
      logger.info('Batch saved', { count: drafts.length });
      onSaved && onSaved();
      setDrafts([emptyCase()]);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setErrors(prev => [...prev, msg]);
  toast.error('Save failed — ' + msg);
      logger.error('Batch save failed', { error: msg, count: drafts.length });
    }
  }

  // compute duplicates for inline highlighting
  const dupSet = useMemo(() => {
    const c = new Map();
    drafts.forEach(d => { if (Number.isInteger(d.testOrder)) c.set(d.testOrder, (c.get(d.testOrder) || 0) + 1); });
    return new Set([...c.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [drafts]);

  return (
    <div>
      {!!errors.length && (
        <div className="mb-3 p-2 border border-red-300 bg-red-50 text-red-700 rounded">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        </div>
      )}

      {drafts.map((d, di) => {
        const isOpen = openIndex === di;
        return (
          <div key={di} className="border rounded mb-3 bg-blue-50/30">
            <button
              type="button"
              className="w-full text-left px-3 py-2 cursor-pointer flex items-center gap-2"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? -1 : di)}
            >
              <span className="text-sm inline-block px-1.5 py-0.5 rounded bg-blue-100 border">Case {di + 1}</span>
              <span className="font-medium flex-1 truncate">{d.description || '(new test case)'}</span>
              <button type="button" title="Remove test case" aria-label="Remove test case" className="icon-btn icon-danger text-sm" onClick={(e) => { e.stopPropagation(); removeDraft(di); }}><span className="mi">delete</span></button>
              <span className="mi ml-2">{isOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Description <span className="text-red-600">*</span></label>
                <input required className="w-full px-3 py-2 border rounded" value={d.description} onChange={e => changeDraft(di, { description: e.target.value })} placeholder="Short description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium">Test Order</label>
                  <input className={`w-full px-3 py-2 border rounded ${Number.isInteger(d.testOrder) && (dupSet.has(d.testOrder) ? 'border-red-500' : (existingOrders.has(d.testOrder) ? 'border-red-500' : ''))}`} type="number" value={d.testOrder ?? ''} onChange={e => changeDraft(di, { testOrder: e.target.value === '' ? null : Number(e.target.value) })} />
                  {Number.isInteger(d.testOrder) && dupSet.has(d.testOrder) && (
                    <p className="text-xs text-red-600 mt-1">Duplicate order within batch.</p>
                  )}
                  {Number.isInteger(d.testOrder) && !dupSet.has(d.testOrder) && existingOrders.has(d.testOrder) && (
                    <p className="text-xs text-red-600 mt-1">Conflicts with existing test case.</p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-sm">Enabled</span>
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

            <div>
              <h4 className="font-medium">Steps</h4>
              {d.testSteps.map((s, si) => (
                <div key={si} className="p-2 border rounded my-2 grid grid-cols-1 md:grid-cols-6 gap-2 bg-blue-50/50">
                  <div className="md:col-span-2">
                    <label className="block text-sm">Step Name</label>
                    <input className="w-full px-2 py-1 border rounded" placeholder="stepName" value={s.stepName} onChange={e => changeStep(di, si, { stepName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm">Action <span className="text-red-600">*</span></label>
                    <select className="w-full px-2 py-1 border rounded" value={s.action} onChange={e => changeStep(di, si, { action: e.target.value })}>
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
                  </div>
                  <div>
                    <label className="block text-sm">Selector / Path {(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                    <input aria-required={(s.action === 'goto' || ['click','hover','fill','type','press'].includes(s.action)) ? 'true' : 'false'} className="w-full px-2 py-1 border rounded" placeholder="selector or path" value={s.selector || s.path} onChange={e => changeStep(di, si, { selector: e.target.value, path: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm">Selector Type</label>
                    <select className="w-full px-2 py-1 border rounded" value={s.selectorType || 'css'} onChange={e => changeStep(di, si, { selectorType: e.target.value })}>
                      <option value="css">css</option>
                      <option value="xpath">xpath</option>
                      <option value="id">id</option>
                      <option value="text">text</option>
                      <option value="testId">testId</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Nth (optional)</label>
                    <input className="w-full px-2 py-1 border rounded" type="number" min="0" placeholder="0" value={s.nth ?? ''} onChange={e => changeStep(di, si, { nth: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-sm">Wait Time (ms)</label>
                    <input className="w-full px-2 py-1 border rounded" type="number" min="0" placeholder="e.g., 500" value={s.waitTime || 0} onChange={e => changeStep(di, si, { waitTime: Number(e.target.value || 0) })} />
                  </div>
                  <div className="md:col-span-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm">Step Data</label>
                      <div className="flex items-center gap-2">
                        {(s.action === 'custom' || s.action === 'upload') && (
                          <div className="rounded border overflow-hidden text-xs">
                            <button
                              type="button"
                              className="px-2 py-1"
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
                              Template
                            </button>
                          </div>
                        )}
                        <div className="rounded border overflow-hidden text-xs">
                        {(() => { const key = `${di}:${si}`; const mode = dataMode[key] || (s && typeof s.data === 'object' && s.data !== null ? 'json' : 'text'); return (
                          <>
                            <button type="button" className={`px-2 py-1 ${mode === 'text' ? 'bg-gray-100' : ''}`} onClick={() => {
                              // switch to text
                              setDataMode(m => ({ ...m, [key]: 'text' }));
                              setJsonErr(e => ({ ...e, [key]: undefined }));
                              if (s && typeof s.data === 'object' && s.data !== null) {
                                changeStep(di, si, { data: JSON.stringify(s.data) });
                                setJsonText(t => ({ ...t, [key]: JSON.stringify(s.data, null, 2) }));
                              }
                            }}>Text</button>
                            <button type="button" className={`px-2 py-1 ${mode === 'json' ? 'bg-gray-100' : ''}`} onClick={() => {
                              // switch to json
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
                            className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[90px] ${jsonErr[key] ? 'border-red-500' : ''}`}
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
                          {jsonErr[key] && <p className="text-xs text-red-600 mt-1">{jsonErr[key]}</p>}
                        </>
                      ) : (
                        <input className="w-full px-2 py-1 border rounded" placeholder="step data (optional)" value={typeof s.data === 'object' && s.data !== null ? JSON.stringify(s.data) : (s.data || '')} onChange={e => changeStep(di, si, { data: e.target.value })} />
                      )
                    ); })()}
                  </div>
                  <div className="flex items-center gap-4">
                      <label className="text-sm">Iterate</label>
                      <input type="checkbox" checked={!!s.iterate} onChange={e => changeStep(di, si, { iterate: e.target.checked })} />
                      <label className="text-sm">Soft</label>
                      <input type="checkbox" checked={!!s.soft} onChange={e => changeStep(di, si, { soft: e.target.checked })} />
                    </div>
                  {s.action === 'custom' && (
                    <div>
                      <label className="block text-sm">Custom Name <span className="text-red-600">*</span></label>
                      <input aria-required="true" className="w-full px-2 py-1 border rounded" placeholder="custom logic key" value={s.customName || ''} onChange={e => changeStep(di, si, { customName: e.target.value })} />
                    </div>
                  )}
                  {s.action === 'upload' && (
                    <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-2">
                      <div className="flex items-end gap-2">
                        <label className="text-sm">Clear First</label>
                        <input type="checkbox" checked={!!s.clearFirst} onChange={e => changeStep(di, si, { clearFirst: e.target.checked })} />
                      </div>
                      <div>
                        <label className="block text-sm">Resolve From</label>
                        <select className="w-full px-2 py-1 border rounded" value={s.resolveFrom || 'cwd'} onChange={e => changeStep(di, si, { resolveFrom: e.target.value })}>
                          <option value="cwd">cwd</option>
                          <option value="absolute">absolute</option>
                        </select>
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-sm">Files (JSON, optional)</label>
                        <textarea
                          className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[72px] ${filesErr[`${di}:${si}`] ? 'border-red-500' : ''}`}
                          placeholder='e.g. [{"path":"relative/file.png"}] or [{"contentBase64":"...","name":"file.txt","mimeType":"text/plain"}]'
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
                        {filesErr[`${di}:${si}`] && <p className="text-xs text-red-600 mt-1">{filesErr[`${di}:${si}`]}</p>}
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Validations</span>
                      <button className="icon-btn icon-add" onClick={() => addValidation(di, si)} title="Add validation" aria-label="Add validation"><span className="mi">add</span> Validation</button>
                    </div>
                    {(s.validations || []).map((v, vi) => (
                      <div key={vi} className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2 bg-amber-50/60 p-2 rounded border">
                        <select className="w-full px-2 py-1 border rounded" value={v.type || ''} onChange={e => changeValidation(di, si, vi, { type: e.target.value })}>
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
                        <input className="w-full px-2 py-1 border rounded" placeholder="selector" value={v.selector || ''} onChange={e => changeValidation(di, si, vi, { selector: e.target.value })} />
                        <select className="w-full px-2 py-1 border rounded" value={v.selectorType || 'css'} onChange={e => changeValidation(di, si, vi, { selectorType: e.target.value })}>
                          <option value="css">css</option>
                          <option value="xpath">xpath</option>
                          <option value="id">id</option>
                          <option value="text">text</option>
                          <option value="testId">testId</option>
                        </select>
                        <input className="w-full px-2 py-1 border rounded" placeholder="path (optional)" value={v.path || ''} onChange={e => changeValidation(di, si, vi, { path: e.target.value })} />
                        {expectsData(v.type) && (
                          <input className="w-full px-2 py-1 border rounded" placeholder={v.type === 'toHaveText' ? 'expected text' : 'data'} value={v.data || ''} onChange={e => changeValidation(di, si, vi, { data: e.target.value })} />
                        )}
                        <input className="w-full px-2 py-1 border rounded" placeholder="attribute (optional)" value={v.attribute || ''} onChange={e => changeValidation(di, si, vi, { attribute: e.target.value })} />
                        <input className="w-full px-2 py-1 border rounded" placeholder="css property (optional)" value={v.cssProperty || ''} onChange={e => changeValidation(di, si, vi, { cssProperty: e.target.value })} />
                        <input className="w-full px-2 py-1 border rounded" placeholder="message" value={v.message || ''} onChange={e => changeValidation(di, si, vi, { message: e.target.value })} />
                        {v.type === 'custom' && (
                          <input className="w-full px-2 py-1 border rounded" placeholder="custom validation key" value={v.customName || ''} onChange={e => changeValidation(di, si, vi, { customName: e.target.value })} />
                        )}
                        <div className="flex items-center gap-2">
                          <label className="text-sm">Soft</label>
                          <input type="checkbox" checked={!!v.soft} onChange={e => changeValidation(di, si, vi, { soft: e.target.checked })} />
                          <button title="Remove validation" aria-label="Remove validation" className="icon-btn icon-danger ml-auto text-sm" onClick={() => removeValidation(di, si, vi)}><span className="mi">delete</span></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-6">
                    <label className="block text-sm">Action Options (JSON)</label>
                    <textarea
                      className={`w-full px-2 py-1 border rounded font-mono text-xs min-h-[72px] ${actionErr[`${di}:${si}`] ? 'border-red-500' : ''}`}
                      placeholder='e.g. {"timeout": 5000} or {"force": true}'
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
                    {actionErr[`${di}:${si}`] && <p className="text-xs text-red-600 mt-1">{actionErr[`${di}:${si}`]}</p>}
                  </div>

                  <button title="Remove step" aria-label="Remove step" className="icon-btn icon-danger text-sm md:col-span-6" onClick={() => removeStep(di, si)}><span className="mi">delete</span> Remove Step</button>
                </div>
              ))}
              <button className="icon-btn icon-add" onClick={() => addStep(di)} title="Add step" aria-label="Add step"><span className="mi">add</span> Step</button>
            </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2">
  <button className="icon-btn icon-add" onClick={addDraft} title="Add test case" aria-label="Add test case"><span className="mi">add</span> Test Case</button>
  <button className="icon-btn icon-success" onClick={saveAll} title="Save all" aria-label="Save all"><span className="mi">save</span> Save All</button>
      </div>
    </div>
  );
}
