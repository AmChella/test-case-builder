import React, { useState, useRef, useEffect } from 'react';

/**
 * Custom dropdown component that renders the menu in a portal to avoid parent transform issues.
 * Props:
 *  - options: Array<{ value: string|number, label: string } | string>
 *  - value: selected value
 *  - onChange: function(value)
 *  - placeholder?: string
 *  - disabled?: boolean
 *  - required?: boolean
 *  - className?: string
 *  - dropdownClassName?: string
 */
export default function CustomDropdown({
  options = [],
  value,
  onChange,
  placeholder,
  disabled,
  required,
  className = '',
  dropdownClassName = '',
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Flatten options for rendering
  const opts = options.map(opt => typeof opt === 'string' ? { value: opt, label: opt } : opt);
  const selected = opts.find(opt => opt.value === value);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        setHighlighted(h => Math.min(h + 1, opts.length - 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setHighlighted(h => Math.max(h - 1, 0));
        e.preventDefault();
      } else if (e.key === 'Enter' && highlighted >= 0) {
        onChange({ target: { value: opts[highlighted].value } });
        setOpen(false);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setOpen(false);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, highlighted, opts, onChange]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Open menu and set highlight
  const handleButtonClick = () => {
    if (disabled) return;
    setOpen(o => !o);
    setHighlighted(opts.findIndex(opt => opt.value === value));
  };

  // Select option
  const handleSelect = (opt, idx) => {
    if (disabled) return;
    onChange({ target: { value: opt.value } });
    setOpen(false);
    setHighlighted(idx);
  };

  return (
    <div className={`relative ${className}`} {...rest}>
      <button
        type="button"
        ref={buttonRef}
        className={`w-full px-2 py-1 border rounded app-select bg-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required ? 'true' : 'false'}
        disabled={disabled}
        onClick={handleButtonClick}
      >
        {selected ? selected.label : (placeholder || 'Select...')}
        <span className="float-right ml-2">▼</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`absolute left-0 mt-1 w-full z-50 bg-white border rounded shadow-lg ${dropdownClassName}`}
          role="listbox"
        >
          {opts.map((opt, idx) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`px-2 py-1 cursor-pointer ${highlighted === idx ? 'bg-indigo-100' : ''} ${value === opt.value ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlighted(idx)}
              onMouseDown={() => handleSelect(opt, idx)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
