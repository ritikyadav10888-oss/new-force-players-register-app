export type SportsProfileFlags = { enabled: boolean; required: boolean };

/** Standard keys that can appear in `form_config.fieldOrder`. All are reorderable. */
export const STANDARD_FIELD_KEYS = [
  'photo',
  'name',
  'email',
  'phone',
  'emergencyContact',
  'dob',
  'age',
  'aadhar',
  'gender',
  'jerseyName',
  'jerseyNumber',
  'jerseySize',
  'cricketProfile',
] as const;

export type StandardFieldKey = (typeof STANDARD_FIELD_KEYS)[number];

/** Default display order matching the previous hardcoded register form. */
export const DEFAULT_FIELD_ORDER: string[] = [...STANDARD_FIELD_KEYS];

export const FIELD_ORDER_LABELS: Record<string, string> = {
  photo: 'Player Photo',
  name: 'Full Name',
  email: 'Email Address',
  phone: 'Phone Number',
  emergencyContact: 'Emergency Contact',
  dob: 'Date of Birth',
  age: 'Age',
  aadhar: 'Aadhaar Number',
  gender: 'Gender',
  jerseyName: 'Jersey Name',
  jerseyNumber: 'Jersey Number',
  jerseySize: 'Jersey Size',
  cricketProfile: 'Sports profile',
};

export function customFieldOrderKey(id: string): string {
  return `custom:${id}`;
}

export function isCustomFieldOrderKey(key: string): boolean {
  return key.startsWith('custom:');
}

export function parseCustomFieldId(key: string): string | null {
  if (!isCustomFieldOrderKey(key)) return null;
  return key.slice('custom:'.length) || null;
}

export function fieldOrderLabel(
  key: string,
  customFields?: { id: string; label?: string }[]
): string {
  if (isCustomFieldOrderKey(key)) {
    const id = parseCustomFieldId(key);
    const field = customFields?.find((f) => f.id === id);
    return field?.label?.trim() || 'Custom field';
  }
  return FIELD_ORDER_LABELS[key] || key;
}

/**
 * Merge saved order with known standard + custom keys.
 * Drops unknown/removed keys; appends any missing keys in default order.
 * When `customFields` is omitted, custom:* keys already in saved order are preserved.
 */
export function normalizeFieldOrder(
  savedOrder: unknown,
  customFields?: { id: string }[] | null
): string[] {
  const hasCustomList = Array.isArray(customFields);
  const customKeys = hasCustomList
    ? customFields
        .map((f) => (f?.id ? customFieldOrderKey(String(f.id)) : null))
        .filter((k): k is string => Boolean(k))
    : [];
  const standardSet = new Set<string>(STANDARD_FIELD_KEYS);

  const fromSaved = Array.isArray(savedOrder)
    ? savedOrder.filter((k): k is string => {
        if (typeof k !== 'string') return false;
        if (standardSet.has(k)) return true;
        if (!isCustomFieldOrderKey(k)) return false;
        if (!hasCustomList) return true;
        return customKeys.includes(k);
      })
    : [];

  const seen = new Set(fromSaved);
  const result = [...fromSaved];

  for (const key of DEFAULT_FIELD_ORDER) {
    if (seen.has(key)) continue;
    const defaultIdx = DEFAULT_FIELD_ORDER.indexOf(key);
    let insertAt = result.length;
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const prevPos = result.indexOf(DEFAULT_FIELD_ORDER[i]);
      if (prevPos !== -1) {
        insertAt = prevPos + 1;
        break;
      }
    }
    if (insertAt === result.length) {
      for (let i = defaultIdx + 1; i < DEFAULT_FIELD_ORDER.length; i++) {
        const nextPos = result.indexOf(DEFAULT_FIELD_ORDER[i]);
        if (nextPos !== -1) {
          insertAt = nextPos;
          break;
        }
      }
    }
    result.splice(insertAt, 0, key);
    seen.add(key);
  }

  if (hasCustomList) {
    for (const key of customKeys) {
      if (!seen.has(key)) {
        result.push(key);
        seen.add(key);
      }
    }
  }

  return result;
}

/** Swap a field one step up (-1) or down (+1). No-op at edges. */
export function moveFieldOrder(order: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}

/**
 * Swap two adjacent *visible* fields inside the full order list.
 * Preserves positions of hidden/disabled fields between them.
 */
export function moveVisibleFieldOrder(
  fullOrder: string[],
  visibleKeys: string[],
  visibleIndex: number,
  direction: -1 | 1
): string[] {
  const targetVisible = visibleIndex + direction;
  if (visibleIndex < 0 || targetVisible < 0 || targetVisible >= visibleKeys.length) {
    return fullOrder;
  }
  const keyA = visibleKeys[visibleIndex];
  const keyB = visibleKeys[targetVisible];
  const next = [...fullOrder];
  const iA = next.indexOf(keyA);
  const iB = next.indexOf(keyB);
  if (iA < 0 || iB < 0) return fullOrder;
  next[iA] = keyB;
  next[iB] = keyA;
  return next;
}

/**
 * Keys to render on the registration form: ordered, skipping disabled standard fields.
 * Custom fields and sports profile (when shown) are always included when present in order.
 */
export function visibleFieldOrder(
  formConfig: Record<string, unknown> | null | undefined,
  customFields: { id: string }[] = [],
  sportsProfileShown = false
): string[] {
  const order = normalizeFieldOrder(
    (formConfig as { fieldOrder?: unknown } | null | undefined)?.fieldOrder,
    customFields
  );

  return order.filter((key) => {
    if (isCustomFieldOrderKey(key)) {
      const id = parseCustomFieldId(key);
      return Boolean(id && customFields.some((f) => f.id === id));
    }
    if (key === 'name') {
      return true; // Full Name is always required on the form
    }
    if (key === 'cricketProfile') {
      return sportsProfileShown;
    }
    const flags = formConfig?.[key] as { enabled?: boolean; required?: boolean } | undefined;
    return Boolean(flags?.enabled || flags?.required);
  });
}

/**
 * Playing-role / sport-specific block in `tournaments.form_config`.
 * Historically stored as `cricketProfile`; `sportsProfile` is the preferred alias (same shape).
 */
export function resolveSportsProfile(
  fc: Record<string, unknown> | null | undefined
): SportsProfileFlags {
  if (!fc || typeof fc !== 'object') return { enabled: false, required: false };
  const sp = fc.sportsProfile as { enabled?: boolean; required?: boolean } | undefined;
  const cp = fc.cricketProfile as { enabled?: boolean; required?: boolean } | undefined;
  const enabled = Boolean(sp?.enabled || cp?.enabled);
  const required = Boolean((sp?.required || cp?.required) && enabled);
  return { enabled, required };
}

/** Show role / position UI when admin turned on Show or Required. */
export function isSportsProfileShown(flags: SportsProfileFlags | null | undefined): boolean {
  if (!flags) return false;
  return Boolean(flags.enabled || flags.required);
}

/**
 * Legacy tournaments: sport is Cricket/Football but form_config never had profile keys —
 * default to showing (optional) sports profile on registration.
 */
export function resolveSportsProfileForTournament(
  rawFormConfig: Record<string, unknown>,
  sport: string | null | undefined
): SportsProfileFlags {
  const resolved = resolveSportsProfile(rawFormConfig);
  const hasExplicit =
    Object.prototype.hasOwnProperty.call(rawFormConfig, 'cricketProfile') ||
    Object.prototype.hasOwnProperty.call(rawFormConfig, 'sportsProfile');
  if (hasExplicit) return resolved;
  const key = String(sport ?? 'Cricket').trim().toLowerCase();
  if (key === 'cricket' || key === 'football') {
    return { enabled: true, required: false };
  }
  return resolved;
}

/**
 * On save, mirror `sportsProfile` from the admin UI state (`cricketProfile` field key) so
 * both keys stay aligned for registration and exports. Preserves `fieldOrder` when present.
 */
export function withSyncedSportsProfilePayload<
  T extends {
    cricketProfile?: { enabled?: boolean; required?: boolean };
    fieldOrder?: string[];
  },
>(
  formConfig: T
): T & { cricketProfile: SportsProfileFlags; sportsProfile: SportsProfileFlags } {
  const cp = formConfig.cricketProfile ?? { enabled: false, required: false };
  const enabled = Boolean(cp.enabled);
  const required = Boolean(cp.required && enabled);
  const profile: SportsProfileFlags = { enabled, required };
  const fieldOrder = Array.isArray(formConfig.fieldOrder)
    ? normalizeFieldOrder(formConfig.fieldOrder)
    : undefined;
  return {
    ...formConfig,
    ...(fieldOrder ? { fieldOrder } : {}),
    cricketProfile: profile,
    sportsProfile: { ...profile },
  };
}
