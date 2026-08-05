'use client';

import { CheckCircle2, ChevronRight } from 'lucide-react';
import styles from './register.module.css';

type Props = {
  steps: string[];
  currentIndex: number;
  includeSuccess?: boolean;
};

export function RegisterStepProgress({ steps, currentIndex, includeSuccess = true }: Props) {
  const allSteps = includeSuccess ? [...steps, 'Success'] : steps;

  return (
    <div className={styles.progressWrap}>
      <p className={styles.progressScrollHint} aria-hidden>
        Swipe steps →
      </p>
      <div className={`glass-panel animate-scale-up ${styles.progressContainer}`} role="list" aria-label="Registration progress">
        {allSteps.map((stepName, idx) => {
          const stepNumber = idx + 1;
          const isDone = currentIndex > stepNumber;
          const isCurrent = currentIndex === stepNumber;
          return (
            <div key={stepName} className={styles.progressItem} role="listitem">
              <div
                className={[
                  styles.progressStep,
                  isDone ? styles.progressStepDone : '',
                  isCurrent ? styles.progressStepCurrent : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? (
                  <CheckCircle2 size={15} className={styles.progressStepIcon} aria-hidden />
                ) : (
                  <span className={styles.progressStepNum}>{stepNumber}</span>
                )}
                <span>{stepName}</span>
              </div>
              {idx < allSteps.length - 1 ? (
                <ChevronRight size={16} className={styles.progressSeparator} aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
