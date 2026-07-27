'use client';

import { useState, type CSSProperties } from 'react';

type Props = {
  value: number;
  onCommit: (fee: number) => void;
  ariaLabel?: string;
  placeholder?: string;
  style?: CSSProperties;
};

/** Fee field that allows clearing while typing (empty → 0 on commit). */
export function FeeInput({
  value,
  onCommit,
  ariaLabel = 'Fee',
  placeholder = '0',
  style,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : value > 0 ? String(value) : '';

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={display}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={style}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        onCommit(raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0));
      }}
      onBlur={() => setDraft(null)}
      onFocus={() => setDraft(value > 0 ? String(value) : '')}
    />
  );
}
