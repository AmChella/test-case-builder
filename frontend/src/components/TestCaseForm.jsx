import React, { useState, useEffect } from 'react';
import { createTestcases, updateTestcase } from '../api';
import { useToast } from './ToastProvider';

const emptyStep = () => ({ stepName: '', action: 'goto', path: '', selector: '', selectorType: 'css', data: '', waitTime: 0, iterate: false, customName: '', soft: false, validations: [] });
const emptyValidation = () => ({ type: 'toBeVisible', selector: '', selectorType: 'css', path: '', data: '', message: '', soft: false, attribute: '', cssProperty: '' });

export default function TestCaseForm({ existing, onSaved }) {
  const [data, setData] = useState({ description: '', enabled: true, testSteps: [], testOrder: null });
  const [errors, setErrors] = useState([]);
  const toast = useToast();

  const expectsData = (type) => type === 'toHaveText' || type === 'count' || type === 'text';

  useEffect(() => { if (existing) setData(existing); else setData({ description: '', enabled: true, testSteps: [], testOrder: null }); }, [existing]);

  function addStep() { setData(d => ({ ...d, testSteps: [...d.testSteps, emptyStep()] })); }
  function removeStep(i) { setData(d => ({ ...d, testSteps: d.testSteps.filter((_, idx) => idx !== i) })); }
  function changeStep(i, patch) { setData(d => { const s = [...d.testSteps]; s[i] = { ...s[i], ...patch }; return { ...d, testSteps: s }; }); }
  function addValidation(i) { setData(d => { const s = [...d.testSteps]; const v = s[i].validations || []; s[i] = { ...s[i], validations: [...v, emptyValidation()] }; return { ...d, testSteps: s }; }); }
  function changeValidation(i, vi, patch) { setData(d => { const s = [...d.testSteps]; const v = [...(s[i].validations || [])]; v[vi] = { ...v[vi], ...patch }; s[i] = { ...s[i], validations: v }; return { ...d, testSteps: s }; }); }
  function removeValidation(i, vi) { setData(d => { const s = [...d.testSteps]; const v = (s[i].validations || []).filter((_, idx) => idx !== vi); s[i] = { ...s[i], validations: v }; return { ...d, testSteps: s }; }); }

  function clientValidate(d) {
    const errs = [];
    if (!d.description?.trim()) errs.push('Description is required.');
    if (!Array.isArray(d.testSteps) || d.testSteps.length === 0) errs.push('At least one step is required.');
    d.testSteps.forEach((s, i) => {
      if (!s.action) errs.push(`Step ${i + 1}: action is required.`);
      if (s.action === 'goto' && !(s.path && s.path.toString().length)) errs.push(`Step ${i + 1}: path is required for goto.`);
      if ((['click','hover','fill','type','press']).includes(s.action) && !(s.selector && s.selector.toString().length)) errs.push(`Step ${i + 1}: selector is required for ${s.action}.`);
      if ((['fill','type','press']).includes(s.action) && (s.data === undefined || s.data === null || s.data === '')) errs.push(`Step ${i + 1}: data is required for ${s.action}.`);
      if (s.action === 'waitForTimeout' && (typeof s.waitTime !== 'number' || s.waitTime < 0)) errs.push(`Step ${i + 1}: waitTime must be >= 0.`);
      (s.validations || []).forEach((v, vi) => {
        if (!v.type) errs.push(`Step ${i + 1} - Validation ${vi + 1}: type is required.`);
        if (!v.selector) errs.push(`Step ${i + 1} - Validation ${vi + 1}: selector is required.`);
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
  if (existing && existing.filename) await updateTestcase(existing.filename, data); else await createTestcases(data);
      onSaved && onSaved();
  toast.success(existing && existing.filename ? 'Updated test case' : 'Created test case');
    } catch (err) {
      console.error(err);
      const serverErr = (err?.response?.data?.error || err.message);
      setErrors(prev => [...prev, serverErr]);
  toast.error('Save failed — ' + serverErr);
    }
  }

  return (
    <div className="p-4 border rounded bg-white">
      {!!errors.length && (
        <div className="mb-3 p-2 border border-red-300 bg-red-50 text-red-700 rounded">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (<li key={i}>{e}</li>))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Description <span className="text-red-600">*</span></label>
          <input aria-required="true" className="w-full px-3 py-2 border rounded" value={data.description} onChange={e => setData({ ...data, description: e.target.value })} placeholder="Short description of the test case" />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-sm">Step Data {(['fill','type','press'].includes(s.action)) && <span className="text-red-600">*</span>}</label>
                <input aria-required={['fill','type','press'].includes(s.action) ? 'true' : 'false'} className="w-full px-2 py-1 border rounded" placeholder="data (optional)" value={s.data || ''} onChange={e => changeStep(i, { data: e.target.value })} />
              </div>
              {s.action === 'waitForTimeout' && (
                <div>
                  <label className="block text-sm">Wait Time (ms) <span className="text-red-600">*</span></label>
                  <input aria-required="true" className="w-full px-2 py-1 border rounded" type="number" placeholder="waitTime (ms)" value={s.waitTime || 0} onChange={e => changeStep(i, { waitTime: Number(e.target.value || 0) })} />
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
    </div>
  );
}
