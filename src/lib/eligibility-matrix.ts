/**
 * Admin-defined Category × Gender → allowed sports/events.
 * When enabled is false / missing, all sports are shown.
 */

import type { SportEntry } from '@/lib/multi-sport';

export const ELIGIBILITY_GENDERS = ['Male', 'Female'] as const;
export type EligibilityGender = (typeof ELIGIBILITY_GENDERS)[number];

export type EligibilityRule = {
  categoryId: string;
  gender: EligibilityGender;
  sportIds: string[];
};

export type EligibilityMatrix = {
  /** When true, filter sports by category × gender rules. */
  enabled?: boolean;
  rules: EligibilityRule[];
};

export type FormSectionCopy = {
  label?: string;
  description?: string;
};

export function normalizeEligibilityGender(raw: unknown): EligibilityGender | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'male' || s === 'm') return 'Male';
  if (s === 'female' || s === 'f') return 'Female';
  return null;
}

export function parseEligibilityMatrix(raw: unknown): EligibilityMatrix {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { enabled: false, rules: [] };
  }
  const obj = raw as { enabled?: unknown; rules?: unknown };
  const rulesRaw = obj.rules;
  const rules: EligibilityRule[] = [];
  if (Array.isArray(rulesRaw)) {
    for (const item of rulesRaw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const categoryId = typeof o.categoryId === 'string' ? o.categoryId.trim() : '';
      const gender = normalizeEligibilityGender(o.gender);
      if (!categoryId || !gender) continue;
      const idsRaw = o.sportIds ?? o.sport_ids;
      const sportIds = Array.isArray(idsRaw)
        ? [
            ...new Set(
              idsRaw
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                .map((id) => id.trim())
            ),
          ]
        : [];
      rules.push({ categoryId, gender, sportIds });
    }
  }
  const enabled =
    typeof obj.enabled === 'boolean' ? obj.enabled : rules.some((r) => r.sportIds.length > 0);
  return { enabled, rules };
}

export function cleanEligibilityMatrixForSave(
  matrix: EligibilityMatrix | null | undefined,
  categoryIds: string[],
  sportIds: string[]
): EligibilityMatrix | undefined {
  const parsed = parseEligibilityMatrix(matrix || { rules: [] });
  if (!parsed.enabled) return undefined;
  const catSet = new Set(categoryIds.filter(Boolean));
  const sportSet = new Set(sportIds.filter(Boolean));
  const rules = parsed.rules
    .filter((r) => catSet.has(r.categoryId))
    .map((r) => ({
      ...r,
      sportIds: r.sportIds.filter((id) => sportSet.has(id)),
    }));
  return { enabled: true, rules };
}

/** True when admin turned on category × gender filtering. */
export function isEligibilityMatrixActive(matrix: EligibilityMatrix | null | undefined): boolean {
  return Boolean(matrix?.enabled);
}

/**
 * null = matrix inactive (show all sports).
 * string[] = allowed sport ids for this category × gender (may be empty).
 */
export function allowedSportIdsFor(
  matrix: EligibilityMatrix | null | undefined,
  categoryId: string | null | undefined,
  gender: string | null | undefined
): string[] | null {
  if (!isEligibilityMatrixActive(matrix)) return null;
  const cat = String(categoryId || '').trim();
  const g = normalizeEligibilityGender(gender);
  if (!cat || !g) return [];
  const rule = matrix!.rules.find((r) => r.categoryId === cat && r.gender === g);
  return rule ? [...rule.sportIds] : [];
}

export function filterSportsByEligibility(
  sports: SportEntry[],
  matrix: EligibilityMatrix | null | undefined,
  categoryId: string | null | undefined,
  gender: string | null | undefined
): SportEntry[] {
  const allowed = allowedSportIdsFor(matrix, categoryId, gender);
  if (allowed == null) return sports;
  const set = new Set(allowed);
  return sports.filter((s) => set.has(s.id));
}

export function validateSelectedSportsAgainstMatrix(opts: {
  matrix: EligibilityMatrix | null | undefined;
  categoryId: string | null | undefined;
  gender: string | null | undefined;
  selectedSportIds: string[];
}): { ok: true } | { ok: false; error: string } {
  const allowed = allowedSportIdsFor(opts.matrix, opts.categoryId, opts.gender);
  if (allowed == null) return { ok: true };
  if (!opts.categoryId) {
    return { ok: false, error: 'Select an age category before choosing events.' };
  }
  if (!normalizeEligibilityGender(opts.gender)) {
    return { ok: false, error: 'Select gender before choosing events.' };
  }
  const set = new Set(allowed);
  const bad = opts.selectedSportIds.filter((id) => !set.has(id));
  if (bad.length > 0) {
    return {
      ok: false,
      error: 'One or more selected events are not allowed for this category and gender.',
    };
  }
  return { ok: true };
}

export function parseFormSectionCopy(raw: unknown): FormSectionCopy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  const description = typeof o.description === 'string' ? o.description.trim() : '';
  return {
    ...(label ? { label } : {}),
    ...(description ? { description } : {}),
  };
}

export function cleanFormSectionCopy(
  copy: FormSectionCopy | null | undefined
): FormSectionCopy | undefined {
  const parsed = parseFormSectionCopy(copy || {});
  if (!parsed.label && !parsed.description) return undefined;
  return parsed;
}

/** Toggle a sport id on a category×gender cell. */
export function toggleMatrixSport(
  matrix: EligibilityMatrix,
  categoryId: string,
  gender: EligibilityGender,
  sportId: string
): EligibilityMatrix {
  const rules = [...(matrix.rules || [])];
  const idx = rules.findIndex((r) => r.categoryId === categoryId && r.gender === gender);
  if (idx === -1) {
    rules.push({ categoryId, gender, sportIds: [sportId] });
    return { ...matrix, enabled: true, rules };
  }
  const existing = rules[idx];
  const has = existing.sportIds.includes(sportId);
  const sportIds = has
    ? existing.sportIds.filter((id) => id !== sportId)
    : [...existing.sportIds, sportId];
  rules[idx] = { ...existing, sportIds };
  return { ...matrix, enabled: true, rules };
}

export function isSportAllowedInMatrix(
  matrix: EligibilityMatrix,
  categoryId: string,
  gender: EligibilityGender,
  sportId: string
): boolean {
  const rule = matrix.rules.find((r) => r.categoryId === categoryId && r.gender === gender);
  return Boolean(rule?.sportIds.includes(sportId));
}

/** Ensure every category×gender has a rule row (for editor display); empty sportIds ok. */
export function ensureMatrixRows(
  matrix: EligibilityMatrix,
  categoryIds: string[]
): EligibilityMatrix {
  const rules = [...(matrix.rules || [])];
  for (const categoryId of categoryIds) {
    for (const gender of ELIGIBILITY_GENDERS) {
      if (!rules.some((r) => r.categoryId === categoryId && r.gender === gender)) {
        rules.push({ categoryId, gender, sportIds: [] });
      }
    }
  }
  return { ...matrix, enabled: true, rules };
}
