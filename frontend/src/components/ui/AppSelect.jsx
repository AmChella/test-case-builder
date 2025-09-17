import React from 'react';

/**
 * Reusable select component with consistent styling and accessible labeling.
 * Props:
 *  - label?: string (if provided, wraps select with a label element)
 *  - required?: boolean (adds asterisk)
 *  - error?: string (renders error text & aria-describedby)
 *  - helper?: string (renders helper text)
 *  - className?: additional classes
 *  - selectClassName?: extra classes for the <select>
 *  - options: Array<{ value: string|number, label: string } | string>
 */
export default function AppSelect({
  id,
  label,
  required,
  error,
  helper,
  className = '',
  selectClassName = '',
  options = [],
  value,
  onChange,
  disabled,
  name,
  placeholder,
  ...rest
}) {
  const selectId = id || name || undefined;
  const helperId = helper ? `${selectId || 'select'}-helper` : undefined;
  const errorId = error ? `${selectId || 'select'}-error` : undefined;
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        value={value}
        disabled={disabled}
        onChange={onChange}
        aria-required={required ? 'true' : 'false'}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined}
        className={`w-full px-2 py-1 border rounded app-select bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${error ? 'border-red-500' : 'border-gray-300'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${selectClassName}`}
        {...rest}
      >
        {placeholder && <option value="" disabled={required}>{placeholder}</option>}
        {options.map((opt, idx) => {
          if (typeof opt === 'string') return <option key={idx} value={opt}>{opt}</option>;
          return <option key={idx} value={opt.value}>{opt.label}</option>;
        })}
      </select>
      {helper && !error && (
        <p id={helperId} className="text-xs text-gray-500">{helper}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
