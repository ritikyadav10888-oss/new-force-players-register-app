'use client';

import { Circle, CircleCheck } from 'lucide-react';
import styles from './register.module.css';

type Item = {
  id: string;
  label: string;
  done: boolean;
};

type Props = {
  title?: string;
  items: Item[];
};

export function RegisterStepChecklist({ title = 'Before you continue', items }: Props) {
  const pending = items.filter((i) => !i.done);
  if (pending.length === 0) return null;

  return (
    <div className={styles.stepChecklist} role="status" aria-live="polite">
      <p className={styles.stepChecklistTitle}>{title}</p>
      <ul className={styles.stepChecklistList}>
        {items.map((item) => (
          <li key={item.id} className={item.done ? styles.stepChecklistItemDone : styles.stepChecklistItemPending}>
            {item.done ? (
              <CircleCheck size={16} className={styles.stepChecklistIconDone} aria-hidden />
            ) : (
              <Circle size={16} className={styles.stepChecklistIconPending} aria-hidden />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
