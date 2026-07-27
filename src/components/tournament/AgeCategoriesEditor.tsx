'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  formatAgeCategoryRange,
  newAgeCategoryId,
  type AgeCategoryDef,
} from '@/lib/age-categories';
import styles from './AgeCategoriesEditor.module.css';

type Props = {
  categories: AgeCategoryDef[];
  onChange: (next: AgeCategoryDef[]) => void;
};

export function AgeCategoriesEditor({ categories, onChange }: Props) {
  const update = (id: string, patch: Partial<AgeCategoryDef>) => {
    onChange(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const add = () => {
    onChange([
      ...categories,
      {
        id: newAgeCategoryId(),
        name: '',
        minAge: 0,
        maxAge: 12,
        minDob: null,
        maxDob: null,
      },
    ]);
  };

  const remove = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  return (
    <div className={styles.wrap}>
      <div>
        <h3 className={styles.title}>Age categories (optional)</h3>
        <p className={styles.hint}>
          Applies to the whole team / tournament registration — not per sport. Set age years and/or
          birth-date limits; each player&apos;s DOB assigns a category on save. Leave empty for default
          Kids / Teens / Men.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className={styles.empty}>No custom categories — default Kids / Teens / Men will be shown.</p>
      ) : (
        <div className={styles.list}>
          {categories.map((c, idx) => (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <label className={styles.field}>
                  <span>Category {idx + 1} name *</span>
                  <input
                    value={c.name}
                    onChange={(e) => update(c.id, { name: e.target.value })}
                    placeholder="e.g. U-12"
                  />
                </label>
                <button
                  type="button"
                  className={`btn-secondary ${styles.removeBtn}`}
                  onClick={() => remove(c.id)}
                  aria-label={`Remove ${c.name || 'category'}`}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>

              <div className={styles.sections}>
                <div className={styles.section}>
                  <p className={styles.sectionLabel}>Age in years</p>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>
                      <span>Min age</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={c.minAge ?? ''}
                        placeholder="—"
                        onChange={(e) =>
                          update(c.id, {
                            minAge: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Max age</span>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={c.maxAge ?? ''}
                        placeholder="—"
                        onChange={(e) =>
                          update(c.id, {
                            maxAge: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.section}>
                  <p className={styles.sectionLabel}>Date of birth window</p>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>
                      <span>Born from</span>
                      <input
                        type="date"
                        value={c.minDob ?? ''}
                        onChange={(e) =>
                          update(c.id, { minDob: e.target.value ? e.target.value : null })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Born to</span>
                      <input
                        type="date"
                        value={c.maxDob ?? ''}
                        onChange={(e) =>
                          update(c.id, { maxDob: e.target.value ? e.target.value : null })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              <p className={styles.range}>Range: {formatAgeCategoryRange(c)}</p>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`btn-secondary ${styles.addBtn}`}
        onClick={add}
      >
        <Plus size={16} /> Add age category
      </button>
    </div>
  );
}
