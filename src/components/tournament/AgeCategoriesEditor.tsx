'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  formatAgeCategoryRange,
  newAgeCategoryId,
  type AgeCategoryDef,
} from '@/lib/age-categories';
import { FeeInput } from './FeeInput';
import styles from './AgeCategoriesEditor.module.css';

type Props = {
  categories: AgeCategoryDef[];
  onChange: (next: AgeCategoryDef[]) => void;
  feeEnabled?: boolean;
};

export function AgeCategoriesEditor({
  categories,
  onChange,
  feeEnabled = true,
}: Props) {
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
        maxAge: null,
        minDob: null,
        maxDob: null,
        fee: 0,
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
          Players must pick a category before enrolling. Leave empty for default Kids / Teens /
          Men.
        </p>
        {feeEnabled ? (
          <p className={styles.modeBadge}>
            Category fee mode is active — set a fee on each category below.
          </p>
        ) : (
          <p className={styles.modeBadgeMuted}>
            Fee inputs are hidden because another payment fee mode is selected.
          </p>
        )}
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

                {feeEnabled ? (
                  <div className={`${styles.section} ${styles.feeSection}`}>
                    <p className={styles.sectionLabel}>Entry fee (₹)</p>
                    <label className={styles.field}>
                      <span>Category entry fee</span>
                      <FeeInput
                        value={Number(c.fee) || 0}
                        onCommit={(fee) => update(c.id, { fee })}
                        ariaLabel="Category entry fee"
                      />
                    </label>
                    <p className={styles.sectionHint}>
                      Players in this category pay only this fee.
                    </p>
                  </div>
                ) : null}
              </div>

              <p className={styles.range}>
                Range: {formatAgeCategoryRange(c)}
                {feeEnabled && Number(c.fee) > 0
                  ? ` · Fee ₹${Number(c.fee).toLocaleString('en-IN')}`
                  : ''}
              </p>
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
