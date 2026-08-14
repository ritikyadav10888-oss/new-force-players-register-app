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

export const CUSTOM_FIELD_VALIDATIONS = [
  { value: 'auto', label: 'Auto from label' },
  { value: 'none', label: 'No extra rules' },
  { value: 'aadhaar', label: 'Aadhaar — 12 digits' },
  { value: 'phone', label: 'Phone — 10 digits' },
  { value: 'email', label: 'Email address' },
  { value: 'pincode', label: 'PIN code — 6 digits' },
  { value: 'digits', label: 'Digits only' },
  { value: 'url', label: 'Website / URL' },
  { value: 'min2', label: 'Text — at least 2 characters' },
] as const;

export type CustomFieldValidation = (typeof CUSTOM_FIELD_VALIDATIONS)[number]['value'];

export type CustomFieldDef = {
  id: string;
  label: string;
  type: CustomFieldType;
  /** Comma-separated options for select / radio / checkbox */
  options: string;
  required: boolean;
  /** Optional help text under the question */
  description?: string;
  /** Extra answer rules. `auto` infers from the field label (Aadhaar, phone, …). */
  validation?: CustomFieldValidation;
  minLength?: number;
  maxLength?: number;
};

export type ResolvedCustomFieldRule = {
  kind: CustomFieldValidation;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  inputMode?: 'numeric' | 'email' | 'tel' | 'url' | 'text';
  htmlType?: string;
  message: string;
  hint?: string;
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
    validation: partial?.validation ?? 'auto',
    minLength: partial?.minLength,
    maxLength: partial?.maxLength,
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
      const validationRaw = String(row.validation || 'auto');
      const validation = (CUSTOM_FIELD_VALIDATIONS.some((v) => v.value === validationRaw)
        ? validationRaw
        : 'auto') as CustomFieldValidation;
      const minLength = Number(row.minLength);
      const maxLength = Number(row.maxLength);
      return {
        id,
        label: String(row.label || '').trim(),
        type,
        options: String(row.options ?? ''),
        required: Boolean(row.required),
        description: String(row.description || ''),
        validation,
        minLength: Number.isFinite(minLength) && minLength > 0 ? minLength : undefined,
        maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : undefined,
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

export function inferValidationFromLabel(label: string): Exclude<CustomFieldValidation, 'auto'> {
  const t = String(label || '').toLowerCase();
  if (/aadha?ar|uidai|\buid\b/.test(t)) return 'aadhaar';
  if (/\b(phone|mobile|whatsapp)\b/.test(t)) return 'phone';
  if (/\b(e-?mail)\b/.test(t)) return 'email';
  if (/\b(pin\s*code|pincode|postal)\b/.test(t)) return 'pincode';
  if (/\b(url|website|https?)\b/.test(t)) return 'url';
  if (/\b(society|socity|apartment|building)\b/.test(t)) return 'min2';
  return 'none';
}

export function resolveCustomFieldValidation(field: CustomFieldDef): ResolvedCustomFieldRule {
  const label = field.label?.trim() || 'This field';
  const kind: Exclude<CustomFieldValidation, 'auto'> =
    field.validation && field.validation !== 'auto'
      ? field.validation
      : inferValidationFromLabel(field.label);

  switch (kind) {
    case 'aadhaar':
      return {
        kind,
        pattern: '[0-9]{12}',
        minLength: 12,
        maxLength: 12,
        inputMode: 'numeric',
        htmlType: 'text',
        message: `${label} must be a 12-digit Aadhaar number`,
        hint: '12 digits, no spaces',
      };
    case 'phone':
      return {
        kind,
        pattern: '[0-9]{10}',
        minLength: 10,
        maxLength: 10,
        inputMode: 'tel',
        htmlType: 'tel',
        message: `${label} must be a 10-digit mobile number`,
        hint: '10-digit mobile, no +91 or 0',
      };
    case 'email':
      return {
        kind,
        htmlType: 'email',
        inputMode: 'email',
        message: `Enter a valid email for ${label}`,
        hint: 'name@domain.com',
      };
    case 'pincode':
      return {
        kind,
        pattern: '[0-9]{6}',
        minLength: 6,
        maxLength: 6,
        inputMode: 'numeric',
        htmlType: 'text',
        message: `${label} must be a 6-digit PIN code`,
        hint: '6 digits',
      };
    case 'digits':
      return {
        kind,
        pattern: '[0-9]+',
        minLength: field.minLength,
        maxLength: field.maxLength,
        inputMode: 'numeric',
        htmlType: 'text',
        message: `${label} must be digits only`,
        hint: 'Numbers only',
      };
    case 'url':
      return {
        kind,
        htmlType: 'url',
        inputMode: 'url',
        message: `Enter a valid URL for ${label}`,
        hint: 'https://…',
      };
    case 'min2':
      return {
        kind,
        minLength: Math.max(2, field.minLength || 0),
        maxLength: field.maxLength || 80,
        htmlType: 'text',
        message: `${label} must be at least 2 characters`,
      };
    default:
      return {
        kind: 'none',
        minLength: field.minLength,
        maxLength: field.maxLength,
        htmlType: field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text',
        message: `${label} is invalid`,
      };
  }
}

export function sanitizeCustomFieldInput(field: CustomFieldDef, raw: string): string {
  const rule = resolveCustomFieldValidation(field);
  if (rule.kind === 'aadhaar' || rule.kind === 'phone' || rule.kind === 'pincode' || rule.kind === 'digits') {
    const digits = String(raw || '').replace(/\D/g, '');
    return rule.maxLength ? digits.slice(0, rule.maxLength) : digits;
  }
  return raw;
}

export function validateCustomFieldValue(
  field: CustomFieldDef,
  values: Record<string, string> | undefined
): string | null {
  const value = getCustomValue(values, field).trim();
  if (!value) {
    if (field.required) return `${field.label || 'This field'} is required`;
    return null;
  }

  const rule = resolveCustomFieldValidation(field);
  if (rule.minLength && value.length < rule.minLength) return rule.message;
  if (rule.maxLength && value.length > rule.maxLength) return rule.message;
  if (rule.pattern) {
    try {
      if (!new RegExp(`^${rule.pattern}$`).test(value)) return rule.message;
    } catch {
      /* ignore invalid stored pattern */
    }
  }
  if (rule.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return rule.message;
  if (rule.kind === 'url') {
    try {
      const parsed = new URL(value);
      if (!parsed.protocol.startsWith('http')) return rule.message;
    } catch {
      return rule.message;
    }
  }
  if (field.type === 'number' && Number.isNaN(Number(value))) {
    return `${field.label || 'This field'} must be a number`;
  }
  return null;
}

export function validateCustomFieldAnswers(
  fields: CustomFieldDef[] | undefined,
  values: Record<string, string> | undefined
): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  for (const field of fields) {
    const err = validateCustomFieldValue(field, values);
    if (err) return err;
  }
  return null;
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
