'use client';

import { IndianRupee } from 'lucide-react';
import { feeModeLabel, type TournamentFeeMode } from '@/lib/fee-mode';
import styles from './FeeModePicker.module.css';

const MODE_HELP: Record<TournamentFeeMode, string> = {
  flat: 'One fixed fee for every registration (e.g. ₹300).',
  sport:
    'Per event selected — e.g. Women\'s ₹300 + Mixed Doubles ₹300 = ₹600. Age category is eligibility only.',
  category: 'Players pay only the fee of their selected age category.',
  step: 'First event uses one fee. Each extra event adds another fee (e.g. ₹350 + ₹50).',
};

type Props = {
  value: TournamentFeeMode;
  onChange: (mode: TournamentFeeMode) => void;
  firstEventFee: string;
  extraEventFee: string;
  onFirstEventFee: (value: string) => void;
  onExtraEventFee: (value: string) => void;
};

export function FeeModePicker({
  value,
  onChange,
  firstEventFee,
  extraEventFee,
  onFirstEventFee,
  onExtraEventFee,
}: Props) {
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
          {(['flat', 'sport', 'category', 'step'] as TournamentFeeMode[]).map((mode) => {
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
        {value === 'step' ? (
          <div className={styles.stepFields}>
            <label>
              First event fee (₹)
              <input
                type="number"
                min={0}
                value={firstEventFee}
                placeholder="e.g. 350"
                onChange={(e) => onFirstEventFee(e.target.value)}
              />
            </label>
            <label>
              Each extra event (₹)
              <input
                type="number"
                min={0}
                value={extraEventFee}
                placeholder="e.g. 50"
                onChange={(e) => onExtraEventFee(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
