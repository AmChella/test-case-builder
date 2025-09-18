import React from 'react';
import CustomDropdown from './CustomDropdown';

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
      <CustomDropdown
        id={selectId}
        name={name}
        value={value}
        disabled={disabled}
        onChange={onChange}
        required={required}
        options={options}
        placeholder={placeholder}
        className={`w-full ${selectClassName}`}
        aria-required={required ? 'true' : 'false'}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {helper && !error && (
        <p id={helperId} className="text-xs text-gray-500">{helper}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
