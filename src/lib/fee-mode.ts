import {
  ageCategoryEntryFee,
  findAgeCategoryById,
  type AgeCategoryDef,
  type FeeLine,
} from '@/lib/age-categories';
import {
  resolveRegistrationFee,
  type FeeBreakdownItem,
  type SportEntry,
} from '@/lib/multi-sport';

export type TournamentFeeMode = 'flat' | 'sport' | 'category';

export function normalizeTournamentFeeMode(raw: unknown): TournamentFeeMode | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'flat' || value === 'sport' || value === 'category') return value;
  return null;
}

export function resolveTournamentFeeMode(opts: {
  formConfig?: unknown;
  sportsConfig?: SportEntry[] | null | undefined;
  ageCategories?: AgeCategoryDef[] | null | undefined;
}): TournamentFeeMode {
  const explicit = normalizeTournamentFeeMode(
    opts.formConfig && typeof opts.formConfig === 'object'
      ? (opts.formConfig as Record<string, unknown>).feeMode
      : null
  );
  if (explicit) return explicit;

  const ageCategories = Array.isArray(opts.ageCategories) ? opts.ageCategories : [];
  if (ageCategories.some((cat) => Number(cat.fee) > 0)) return 'category';

  const sportsConfig = Array.isArray(opts.sportsConfig) ? opts.sportsConfig : [];
  if (sportsConfig.length > 0) return 'sport';

  return 'flat';
}

export function feeModeLabel(mode: TournamentFeeMode): string {
  if (mode === 'sport') return 'Sport-wise fee';
  if (mode === 'category') return 'Age-category fee';
  return 'Flat registration fee';
}

export function resolveTournamentPayable(opts: {
  feeMode: TournamentFeeMode;
  legacyFee: number;
  sportsConfig: SportEntry[];
  selectedSportIds?: unknown;
  ageCategories?: AgeCategoryDef[] | null | undefined;
  selectedAgeCategoryId?: string | null | undefined;
}): {
  fee: number;
  breakdown: FeeBreakdownItem[] | FeeLine[];
  selected: SportEntry[];
  multi: boolean;
  categoryFeeOnly: boolean;
} {
  const sportResolved = resolveRegistrationFee({
    legacyFee: Number(opts.legacyFee) || 0,
    sportsConfig: opts.sportsConfig,
    selectedSportIds: opts.selectedSportIds,
  });

  if (opts.feeMode === 'flat') {
    const fee = Math.max(0, Math.round(Number(opts.legacyFee) || 0));
    return {
      fee,
      breakdown: fee > 0 ? [{ sportId: 'flat', name: 'Registration fee', fee }] : [],
      selected: sportResolved.selected,
      multi: sportResolved.multi,
      categoryFeeOnly: false,
    };
  }

  if (opts.feeMode === 'category') {
    const cat = findAgeCategoryById(opts.ageCategories, opts.selectedAgeCategoryId);
    const fee = ageCategoryEntryFee(opts.ageCategories, opts.selectedAgeCategoryId);
    return {
      fee,
      breakdown: cat ? [{ sportId: `age:${cat.id}`, name: `${cat.name} entry fee`, fee }] : [],
      selected: sportResolved.selected,
      multi: sportResolved.multi,
      categoryFeeOnly: true,
    };
  }

  return {
    fee: sportResolved.fee,
    breakdown: sportResolved.breakdown,
    selected: sportResolved.selected,
    multi: sportResolved.multi,
    categoryFeeOnly: false,
  };
}
