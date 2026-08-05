'use client';

import { formatFeeBreakdownNames, type PayableBreakdownLine } from '@/lib/fee-mode';
import styles from './FeeBreakdownSummary.module.css';

type Props = {
  breakdown: PayableBreakdownLine[];
  variant?: 'compact' | 'detailed';
  className?: string;
};

export function FeeBreakdownSummary({
  breakdown,
  variant = 'detailed',
  className,
}: Props) {
  const lines = breakdown.filter((line) => line.name);
  if (lines.length === 0) return null;

  if (variant === 'compact') {
    return (
      <p className={[styles.compact, className].filter(Boolean).join(' ')}>
        {formatFeeBreakdownNames(lines)}
      </p>
    );
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.sportId} className={styles.row}>
            <span className={styles.name}>{line.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
