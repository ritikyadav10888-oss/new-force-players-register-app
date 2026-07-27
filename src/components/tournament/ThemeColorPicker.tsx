'use client';

import styles from './ThemeColorPicker.module.css';

const QUICK_PICK_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#111827', label: 'Dark' },
] as const;

type Props = {
  value: string;
  onChange: (color: string) => void;
  inputId?: string;
};

export function ThemeColorPicker({ value, onChange, inputId = 'theme' }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <input
          type="color"
          id={inputId}
          name={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.nativePicker}
        />
        <input
          type="text"
          value={value}
          readOnly
          className={styles.hexInput}
          aria-label="Selected theme hex color"
        />
      </div>

      <div className={styles.quickSection}>
        <p className={styles.quickLabel}>Quick pick colors</p>
        <div className={styles.swatches}>
          {QUICK_PICK_COLORS.map((color) => {
            const active = value.toLowerCase() === color.hex.toLowerCase();
            return (
              <button
                key={color.hex}
                type="button"
                className={`${styles.swatch} ${active ? styles.swatchActive : ''}`}
                style={{ background: color.hex }}
                onClick={() => onChange(color.hex)}
                aria-label={`Use ${color.label} theme`}
                title={`${color.label} (${color.hex})`}
              >
                <span className={styles.swatchLabel}>{color.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
