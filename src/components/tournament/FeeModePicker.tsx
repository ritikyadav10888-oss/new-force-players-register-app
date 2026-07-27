'use client';

import { IndianRupee } from 'lucide-react';
import { feeModeLabel, type TournamentFeeMode } from '@/lib/fee-mode';
import styles from './FeeModePicker.module.css';

const MODE_HELP: Record<TournamentFeeMode, string> = {
  flat: 'One fixed fee for every registration (e.g. ₹300).',
  sport: 'Players pay the sum of the sports they select.',
  category: 'Players pay only the fee of their selected age category.',
};

type Props = {
  value: TournamentFeeMode;
  onChange: (mode: TournamentFeeMode) => void;
};

export function FeeModePicker({ value, onChange }: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.iconWrap} aria-hidden>
        <IndianRupee size={20} />
      </div>
      <div className={styles.body}>
        <p className={styles.label}>Payment fee mode</p>
        <p className={styles.lead}>
          Choose one pricing system. Only this mode is used at checkout.
        </p>
        <div className={styles.segment} role="radiogroup" aria-label="Payment fee mode">
          {(['flat', 'sport', 'category'] as TournamentFeeMode[]).map((mode) => {
            const active = value === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onClick={() => onChange(mode)}
              >
                <span className={styles.optionTitle}>{feeModeLabel(mode)}</span>
                <span className={styles.optionHint}>{MODE_HELP[mode]}</span>
              </button>
            );
          })}
        </div>
        <p className={styles.activeHint}>
          Active: <strong>{feeModeLabel(value)}</strong> — {MODE_HELP[value]}
        </p>
      </div>
    </div>
  );
}
