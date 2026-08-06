/**
 * Admin-defined age categories for a tournament.
 * Matching uses optional age bands (years from DOB as of "today") and/or
 * inclusive birth-date bounds (YYYY-MM-DD).
 */

export type AgeCategoryDef = {
  id: string;
  name: string;
  /** Inclusive minimum age in years; null = no lower bound */
  minAge: number | null;
  /** Inclusive maximum age in years; null = no upper bound */
  maxAge: number | null;
  /** Inclusive earliest birth date (YYYY-MM-DD); null = no lower bound */
  minDob: string | null;
  /** Inclusive latest birth date (YYYY-MM-DD); null = no upper bound */
  maxDob: string | null;
  /** Extra entry fee for this age category (₹); added to sport / tournament fees */
  fee: number;
};

/** Legacy hardcoded bands used when tournament has no custom categories. */
export const LEGACY_AGE_CATEGORIES: AgeCategoryDef[] = [
  { id: 'kids', name: 'Kids', minAge: 0, maxAge: 10, minDob: null, maxDob: null, fee: 0 },
  { id: 'teens', name: 'Teens', minAge: 11, maxAge: 15, minDob: null, maxDob: null, fee: 0 },
  { id: 'men', name: 'Men', minAge: 16, maxAge: null, minDob: null, maxDob: null, fee: 0 },
];

/** Quick-start preset an admin can insert into a tournament's custom age categories. */
export const AGE_CATEGORY_PRESET: Omit<AgeCategoryDef, 'id'>[] = [
  { name: 'Kids', minAge: 0, maxAge: 12, minDob: null, maxDob: null, fee: 0 },
  { name: 'Women', minAge: null, maxAge: null, minDob: null, maxDob: null, fee: 0 },
  { name: 'Mens', minAge: 13, maxAge: 39, minDob: null, maxDob: null, fee: 0 },
  { name: 'Legend 40 above', minAge: 40, maxAge: null, minDob: null, maxDob: null, fee: 0 },
];

export function newAgeCategoryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ac_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseDobBound(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

function parseAgeBound(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Math.max(0, Math.round(Number(raw)));
  return Number.isNaN(n) ? null : n;
}

export function parseAgeCategories(raw: unknown): AgeCategoryDef[] {
  if (!Array.isArray(raw)) return [];
  const out: AgeCategoryDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) continue;
    let minAge = parseAgeBound(o.minAge ?? o.min_age);
    let maxAge = parseAgeBound(o.maxAge ?? o.max_age);
    if (minAge != null && maxAge != null && minAge > maxAge) {
      const t = minAge;
      minAge = maxAge;
      maxAge = t;
    }
    let minDob = parseDobBound(o.minDob ?? o.min_dob);
    let maxDob = parseDobBound(o.maxDob ?? o.max_dob);
    if (minDob && maxDob && minDob > maxDob) {
      const t = minDob;
      minDob = maxDob;
      maxDob = t;
    }
    out.push({
      id,
      name,
      minAge,
      maxAge,
      minDob,
      maxDob,
      fee: Math.max(0, Math.round(Number(o.fee) || 0)),
    });
  }
  return out;
}

export function cleanAgeCategoriesForSave(cats: AgeCategoryDef[]): AgeCategoryDef[] {
  return parseAgeCategories(cats);
}

export function ageFromDob(dob: string, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = asOf.getFullYear() - birth.getFullYear();
  const m = asOf.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < birth.getDate())) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

function normalizePlayerDob(dob: string): string | null {
  if (!dob) return null;
  const s = dob.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export function formatAgeCategoryRange(cat: AgeCategoryDef): string {
  const hasDobBounds = Boolean(cat.minDob || cat.maxDob);
  const isWideOpenAgeRange =
    !hasDobBounds &&
    cat.minAge != null &&
    cat.maxAge != null &&
    cat.minAge <= 0 &&
    cat.maxAge >= 60;
  if (isWideOpenAgeRange) return 'Open age';

  const parts: string[] = [];
  if (cat.minAge != null && cat.maxAge != null) {
    parts.push(cat.minAge === cat.maxAge ? `${cat.minAge} yrs` : `${cat.minAge}–${cat.maxAge} yrs`);
  } else if (cat.minAge != null) {
    parts.push(`${cat.minAge}+ yrs`);
  } else if (cat.maxAge != null) {
    parts.push(`Under ${cat.maxAge + 1} (≤${cat.maxAge})`);
  }
  if (cat.minDob && cat.maxDob) {
    parts.push(`born ${cat.minDob} → ${cat.maxDob}`);
  } else if (cat.minDob) {
    parts.push(`born on/after ${cat.minDob}`);
  } else if (cat.maxDob) {
    parts.push(`born on/before ${cat.maxDob}`);
  }
  return parts.length ? parts.join(' · ') : 'All ages';
}

export function categoryMatchesAge(cat: AgeCategoryDef, age: number): boolean {
  if (cat.minAge != null && age < cat.minAge) return false;
  if (cat.maxAge != null && age > cat.maxAge) return false;
  return true;
}

export function categoryMatchesPlayer(
  cat: AgeCategoryDef,
  dob: string,
  asOf: Date = new Date()
): boolean {
  const dobNorm = normalizePlayerDob(dob);
  if (!dobNorm) return false;

  if (cat.minDob && dobNorm < cat.minDob) return false;
  if (cat.maxDob && dobNorm > cat.maxDob) return false;

  const hasAgeBound = cat.minAge != null || cat.maxAge != null;
  if (hasAgeBound) {
    const age = ageFromDob(dob, asOf);
    if (age == null) return false;
    if (!categoryMatchesAge(cat, age)) return false;
  }

  return true;
}

/**
 * First matching category by list order. Prefer admin list; fall back to legacy.
 */
export function resolveAgeCategoryName(
  dob: string,
  categories: AgeCategoryDef[] | null | undefined,
  asOf: Date = new Date()
): string | null {
  if (!normalizePlayerDob(dob)) return null;
  const list =
    Array.isArray(categories) && categories.length > 0 ? categories : LEGACY_AGE_CATEGORIES;
  for (const cat of list) {
    if (categoryMatchesPlayer(cat, dob, asOf)) return cat.name;
  }
  return null;
}

export function categoriesForDisplay(
  categories: AgeCategoryDef[] | null | undefined
): AgeCategoryDef[] {
  if (Array.isArray(categories) && categories.length > 0) return categories;
  return LEGACY_AGE_CATEGORIES;
}

/** Entry fee for a selected age category id (0 if missing). */
export function ageCategoryEntryFee(
  categories: AgeCategoryDef[] | null | undefined,
  categoryId: string | null | undefined
): number {
  if (!categoryId || !Array.isArray(categories) || categories.length === 0) return 0;
  const cat = categories.find((c) => c.id === categoryId);
  return Math.max(0, Math.round(Number(cat?.fee) || 0));
}

export type FeeLine = { sportId: string; name: string; fee: number };

/**
 * When category fee > 0, that amount is the total (sport fees are not added).
 * When category fee is 0 / unset, sport / legacy fees apply.
 */
export function mergeAgeCategoryIntoFee(opts: {
  sportFee: number;
  sportBreakdown: FeeLine[];
  categories: AgeCategoryDef[] | null | undefined;
  categoryId: string | null | undefined;
}): { fee: number; breakdown: FeeLine[]; categoryFeeOnly: boolean } {
  const cat = findAgeCategoryById(opts.categories, opts.categoryId);
  const ageFee = ageCategoryEntryFee(opts.categories, opts.categoryId);
  if (ageFee > 0 && cat) {
    return {
      fee: ageFee,
      breakdown: [{ sportId: `age:${cat.id}`, name: `${cat.name} entry fee`, fee: ageFee }],
      categoryFeeOnly: true,
    };
  }
  return {
    fee: Math.max(0, opts.sportFee),
    breakdown: opts.sportBreakdown,
    categoryFeeOnly: false,
  };
}

/**
 * Block a player whose DOB doesn't fit the team's enrolled category (e.g. a
 * teenager's DOB submitted on a link locked to "Kids"). Skips silently when
 * DOB is blank or no categories are configured — mirrors the classic
 * registration form's validatePlayersAgeCategories.
 */
export function validatePlayerDobAgainstCategory(
  dob: string | null | undefined,
  categories: AgeCategoryDef[] | null | undefined,
  selectedCategoryId: string | null | undefined
): { ok: true } | { ok: false; error: string } {
  const cats = Array.isArray(categories) ? categories : [];
  const dobTrim = String(dob || '').trim();
  if (!dobTrim || cats.length === 0) return { ok: true };

  const selectedCat = selectedCategoryId
    ? cats.find((c) => c.id === selectedCategoryId) || null
    : null;

  if (selectedCat) {
    if (!categoryMatchesPlayer(selectedCat, dobTrim)) {
      return {
        ok: false,
        error: `Date of birth does not match the enrolled age category "${selectedCat.name}".`,
      };
    }
    return { ok: true };
  }

  if (!resolveAgeCategoryName(dobTrim, cats)) {
    return {
      ok: false,
      error: 'Date of birth does not match any age category for this tournament.',
    };
  }
  return { ok: true };
}

export function findAgeCategoryById(
  categories: AgeCategoryDef[] | null | undefined,
  categoryId: string | null | undefined
): AgeCategoryDef | null {
  if (!categoryId || !Array.isArray(categories)) return null;
  return categories.find((c) => c.id === categoryId) || null;
}
