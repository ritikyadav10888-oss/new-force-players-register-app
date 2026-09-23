'use client';

import {
  ELIGIBILITY_GENDERS,
  ensureMatrixRows,
  isEligibilityMatrixActive,
  isSportAllowedInMatrix,
  toggleMatrixSport,
  type EligibilityMatrix,
} from '@/lib/eligibility-matrix';
import type { AgeCategoryDef } from '@/lib/age-categories';
import type { SportEntry } from '@/lib/multi-sport';
import styles from './EligibilityMatrixEditor.module.css';

type Props = {
  categories: AgeCategoryDef[];
  sports: SportEntry[];
  value: EligibilityMatrix;
  onChange: (next: EligibilityMatrix) => void;
};

export function EligibilityMatrixEditor({ categories, sports, value, onChange }: Props) {
  const active = isEligibilityMatrixActive(value);
  const canEdit = categories.length > 0 && sports.length > 0;

  const enableMatrix = () => {
    onChange({
      enabled: true,
      rules: ensureMatrixRows({ enabled: true, rules: [] }, categories.map((c) => c.id)).rules,
    });
  };

  const clearMatrix = () => {
    onChange({ enabled: false, rules: [] });
  };

  const matrix = ensureMatrixRows(
    { ...value, enabled: true },
    categories.map((c) => c.id)
  );

  return (
    <div className={styles.wrap}>
      <div>
        <h3 className={styles.title}>Event eligibility matrix (optional)</h3>
        <p className={styles.hint}>
          Control which events a player can choose by <strong>age category × gender</strong>. Leave
          empty to show all events to everyone. Labels and descriptions come from categories and
          sports above.
        </p>
      </div>

      {!canEdit ? (
        <p className={styles.empty}>
          Add at least one age category and one sport/event above to configure eligibility.
        </p>
      ) : !active ? (
        <div className={styles.actions}>
          <button type="button" className={`btn-secondary ${styles.actionBtn}`} onClick={enableMatrix}>
            Enable category × gender matrix
          </button>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Gender</th>
                  {sports.map((s) => (
                    <th key={s.id} scope="col" title={s.description || s.name}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) =>
                  ELIGIBILITY_GENDERS.map((gender, gIdx) => (
                    <tr key={`${cat.id}-${gender}`}>
                      {gIdx === 0 ? (
                        <th scope="row" rowSpan={ELIGIBILITY_GENDERS.length} className={styles.catCell}>
                          <span className={styles.catName}>{cat.name || 'Untitled'}</span>
                          {cat.description ? (
                            <span className={styles.catDesc}>{cat.description}</span>
                          ) : null}
                        </th>
                      ) : null}
                      <td className={styles.genderCell}>{gender}</td>
                      {sports.map((s) => {
                        const checked = isSportAllowedInMatrix(matrix, cat.id, gender, s.id);
                        return (
                          <td key={s.id} className={styles.checkCell}>
                            <label className={styles.checkLabel}>
                              <input
                                type="checkbox"
                                checked={checked}
                                aria-label={`${cat.name} ${gender} — ${s.name}`}
                                onChange={() =>
                                  onChange(toggleMatrixSport(matrix, cat.id, gender, s.id))
                                }
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <button type="button" className={`btn-secondary ${styles.actionBtn}`} onClick={clearMatrix}>
              Disable matrix (show all events)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
