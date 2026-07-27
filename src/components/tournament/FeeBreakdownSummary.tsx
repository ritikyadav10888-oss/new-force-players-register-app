'use client';

import { formatFeeBreakdownSummary, type PayableBreakdownLine } from '@/lib/fee-mode';
import styles from './FeeBreakdownSummary.module.css';

type Props = {
  breakdown: PayableBreakdownLine[];
  totalFee: number;
  variant?: 'compact' | 'detailed';
  className?: string;
};

export function FeeBreakdownSummary({
  breakdown,
  totalFee,
  variant = 'detailed',
  className,
}: Props) {
  const lines = breakdown.filter((line) => line.name);
  if (lines.length === 0) return null;

  if (variant === 'compact') {
    return (
      <p className={[styles.compact, className].filter(Boolean).join(' ')}>
        {formatFeeBreakdownSummary(lines, totalFee)}
      </p>
    );
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.sportId} className={styles.row}>
            <span className={styles.name}>{line.name}</span>
            <span className={styles.fee}>₹{Number(line.fee).toLocaleString('en-IN')}</span>
          </li>
        ))}
      </ul>
      {lines.length > 1 ? (
        <div className={styles.totalRow}>
          <span>Total</span>
          <span>₹{Math.max(0, totalFee).toLocaleString('en-IN')}</span>
        </div>
      ) : null}
    </div>
  );
}
