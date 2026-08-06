/** Google Forms–style custom player field types & helpers. */

export const CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'Link / URL' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'category', label: 'Age Category' },
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]['value'];

export type CustomFieldDef = {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Comma-separated options for select / radio / checkbox */
  options: string;
  required: boolean;
  /** Optional help text under the question */
  description?: string;
};

export function createEmptyCustomField(
  partial?: Partial<CustomFieldDef>
): CustomFieldDef {
  return {
    id: partial?.id || `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: partial?.label ?? '',
    type: partial?.type ?? 'text',
    options: partial?.options ?? '',
    required: partial?.required ?? false,
    description: partial?.description ?? '',
  };
}

export function parseCustomFields(raw: unknown): CustomFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id || '').trim();
      if (!id) return null;
      const typeRaw = String(row.type || 'text');
      const type = (CUSTOM_FIELD_TYPES.some((t) => t.value === typeRaw)
        ? typeRaw
        : 'text') as CustomFieldType;
      return {
        id,
        label: String(row.label || '').trim(),
        type,
        options: String(row.options ?? ''),
        required: Boolean(row.required),
        description: String(row.description || ''),
      } satisfies CustomFieldDef;
    })
    .filter((f) => f != null) as CustomFieldDef[];
}

export function splitFieldOptions(options: string | undefined): string[] {
  if (!options) return [];
  return options
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function fieldNeedsOptions(type: CustomFieldType): boolean {
  return type === 'select' || type === 'radio' || type === 'checkbox';
}

export function getCustomValue(
  values: Record<string, string> | undefined,
  field: { id: string; label: string }
): string {
  if (!values) return '';
  const byId = values[field.id];
  if (byId != null && String(byId) !== '') return String(byId);
  if (field.label && values[field.label] != null) return String(values[field.label]);
  return '';
}

/** Store by stable id; also mirror label for older Excel exports. */
export function setCustomValue(
  values: Record<string, string> | undefined,
  field: { id: string; label: string },
  value: string
): Record<string, string> {
  const next: Record<string, string> = { ...(values || {}), [field.id]: value };
  if (field.label?.trim()) next[field.label.trim()] = value;
  return next;
}

export function getCheckboxValues(
  values: Record<string, string> | undefined,
  field: { id: string; label: string }
): string[] {
  const raw = getCustomValue(values, field);
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function toggleCheckboxValue(
  values: Record<string, string> | undefined,
  field: { id: string; label: string },
  option: string,
  checked: boolean
): Record<string, string> {
  const current = new Set(getCheckboxValues(values, field));
  if (checked) current.add(option);
  else current.delete(option);
  return setCustomValue(values, field, [...current].join(', '));
}

export function isCustomFieldAnswered(
  values: Record<string, string> | undefined,
  field: CustomFieldDef
): boolean {
  if (field.type === 'checkbox') return getCheckboxValues(values, field).length > 0;
  return getCustomValue(values, field).trim() !== '';
}

/** Flatten custom answers for Sheets / export using question labels. */
export function flattenCustomAnswersForExport(
  values: Record<string, string> | undefined,
  fields: CustomFieldDef[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const label = field.label?.trim() || field.id;
    out[label] = getCustomValue(values, field);
  }
  return out;
}
