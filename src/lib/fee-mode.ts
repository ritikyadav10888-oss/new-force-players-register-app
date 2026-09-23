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

export type TournamentFeeMode = 'flat' | 'sport' | 'category' | 'step';

export function normalizeTournamentFeeMode(raw: unknown): TournamentFeeMode | null {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'flat' || value === 'sport' || value === 'category' || value === 'step') return value;
  return null;
}

function moneyAmount(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** First-event fee and the fee added for each event after the first. */
export function parseStepFees(raw: unknown): { firstEventFee: number; extraEventFee: number } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    firstEventFee: moneyAmount(o.firstEventFee),
    extraEventFee: moneyAmount(o.extraEventFee),
  };
}

/** Fee for one selected event. Index 0 is the first pick; later picks use the extra fee. */
export function stepFeeAt(
  selectedIds: readonly string[],
  sportId: string,
  fees: { firstEventFee: number; extraEventFee: number }
): number | null {
  const index = selectedIds.indexOf(sportId);
  if (index < 0) return null;
  return index === 0 ? fees.firstEventFee : fees.extraEventFee;
}

/** n events → first fee + (n − 1) × extra fee. Zero events is ₹0. */
export function stepEventTotal(count: number, firstEventFee: number, extraEventFee: number): number {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return 0;
  return moneyAmount(firstEventFee) + (n - 1) * moneyAmount(extraEventFee);
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

  const sportsConfig = Array.isArray(opts.sportsConfig) ? opts.sportsConfig : [];
  const hasPerSportFees = sportsConfig.some((s) => Number(s.fee) > 0);
  if (sportsConfig.length > 0 && hasPerSportFees) return 'sport';

  const ageCategories = Array.isArray(opts.ageCategories) ? opts.ageCategories : [];
  if (ageCategories.some((cat) => Number(cat.fee) > 0)) return 'category';

  if (sportsConfig.length > 0) return 'sport';

  return 'flat';
}

export function feeModeLabel(mode: TournamentFeeMode): string {
  if (mode === 'sport') return 'Sport-wise fee';
  if (mode === 'category') return 'Age-category fee';
  if (mode === 'step') return 'First event + extras';
  return 'Flat registration fee';
}

export function resolveTournamentPayable(opts: {
  feeMode: TournamentFeeMode;
  legacyFee: number;
  sportsConfig: SportEntry[];
  selectedSportIds?: unknown;
  ageCategories?: AgeCategoryDef[] | null | undefined;
  selectedAgeCategoryId?: string | null | undefined;
  /** Read firstEventFee / extraEventFee when feeMode is step. */
  formConfig?: unknown;
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

  if (opts.feeMode === 'step') {
    const fees = parseStepFees(opts.formConfig);
    const byId = new Map(sportResolved.selected.map((s) => [s.id, s]));
    const pickedIds = Array.isArray(opts.selectedSportIds) ? opts.selectedSportIds : [];
    const selected: SportEntry[] = [];
    for (const id of pickedIds) {
      if (typeof id !== 'string') continue;
      const sport = byId.get(id);
      if (sport && !selected.some((s) => s.id === sport.id)) selected.push(sport);
    }
    const ordered = selected.length > 0 ? selected : sportResolved.selected;
    const fee = stepEventTotal(ordered.length, fees.firstEventFee, fees.extraEventFee);
    return {
      fee,
      breakdown: ordered.map((s, i) => ({
        sportId: s.id,
        name: s.name,
        fee: i === 0 ? fees.firstEventFee : fees.extraEventFee,
      })),
      selected: ordered,
      multi: sportResolved.multi,
      categoryFeeOnly: false,
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

export type PayableBreakdownLine = { sportId: string; name: string; fee: number };

/** Selected events only — amount is shown once in the parent total. */
export function formatFeeBreakdownNames(breakdown: PayableBreakdownLine[]): string {
  const lines = breakdown.filter((line) => line.name);
  if (lines.length === 0) return '';
  return lines.map((line) => line.name).join(' · ');
}
