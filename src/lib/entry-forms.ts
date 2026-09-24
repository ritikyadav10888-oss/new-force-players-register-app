import { parseCustomFields, type CustomFieldDef } from '@/lib/custom-fields';

export type EntryOpenMode = 'full' | 'new';

export type EntryForm = {
  id: string;
  name: string;
  fee: number;
  /** full = standard player fields plus this type. new = only this type's questions. */
  openMode: EntryOpenMode;
  fields: CustomFieldDef[];
  conditionQuestion: string;
  yesFields: CustomFieldDef[];
  addFeeOnYes: boolean;
  extraFee: number;
  /** Yes answer also opens the standard player form, plus any Yes questions. */
  showPlayerFormOnYes: boolean;
  /** Yes = ask team name and representative. No = skip team info. */
  showTeamInfo: boolean;
  /** Yes = add the player roster. No = only this type's form. */
  showPlayerForm: boolean;
};

export function createEmptyEntryForm(): EntryForm {
  return {
    id: `type_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    fee: 0,
    openMode: 'full',
    fields: [],
    conditionQuestion: '',
    yesFields: [],
    addFeeOnYes: false,
    extraFee: 0,
    showPlayerFormOnYes: false,
    showTeamInfo: true,
    showPlayerForm: true,
  };
}

export function parseEntryForms(raw: unknown): EntryForm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id || '').trim();
      const name = String(row.name || '').trim();
      if (!id || !name) return null;
      const fee = Math.max(0, Math.round(Number(row.fee) || 0));
      const openMode: EntryOpenMode = row.openMode === 'new' ? 'new' : 'full';
      return {
        id,
        name,
        fee,
        openMode,
        fields: parseCustomFields(row.fields),
        conditionQuestion: String(row.conditionQuestion || '').trim(),
        yesFields: parseCustomFields(row.yesFields),
        addFeeOnYes: row.addFeeOnYes === true,
        extraFee: Math.max(0, Math.round(Number(row.extraFee) || 0)),
        showPlayerFormOnYes: row.showPlayerFormOnYes === true,
        showTeamInfo: row.showTeamInfo !== false,
        showPlayerForm: row.showPlayerForm !== false,
      };
    })
    .filter((f): f is EntryForm => f != null);
}

export function entryFormsFromConfig(formConfig: unknown): EntryForm[] {
  if (!formConfig || typeof formConfig !== 'object') return [];
  return parseEntryForms((formConfig as Record<string, unknown>).entryForms);
}

export function cleanEntryFormsForSave(forms: EntryForm[]): EntryForm[] {
  return forms
    .map((form): EntryForm => ({
      id: form.id,
      name: form.name.trim(),
      fee: Math.max(0, Math.round(Number(form.fee) || 0)),
      openMode: form.openMode === 'new' ? 'new' : 'full',
      fields: form.fields.filter((field) => field.label.trim()),
      conditionQuestion: form.conditionQuestion.trim(),
      yesFields: form.conditionQuestion.trim()
        ? form.yesFields.filter((field) => field.label.trim())
        : [],
      addFeeOnYes: Boolean(form.conditionQuestion.trim() && form.addFeeOnYes),
      extraFee: Math.max(0, Math.round(Number(form.extraFee) || 0)),
      showPlayerFormOnYes: Boolean(form.conditionQuestion.trim() && form.showPlayerFormOnYes),
      showTeamInfo: form.showTeamInfo !== false,
      showPlayerForm: form.showPlayerForm !== false,
    }))
    .filter((form) => form.name);
}

export function findEntryForm(forms: EntryForm[], id: string | null | undefined): EntryForm | null {
  if (!id) return null;
  return forms.find((form) => form.id === id) || null;
}

type Payable = {
  fee: number;
  breakdown: { sportId: string; name: string; fee: number }[];
  categoryFeeOnly?: boolean;
};

/** When registration types exist, the chosen type's fee is what the player pays. */
export function applyEntryFormCharge<T extends Payable>(
  resolved: T,
  forms: EntryForm[],
  entryFormId: string | null | undefined,
  entryCondition?: string | null
): T {
  if (forms.length === 0) return resolved;
  const chosen = findEntryForm(forms, entryFormId);
  if (!chosen) {
    return { ...resolved, fee: 0, breakdown: [], categoryFeeOnly: false };
  }
  const breakdown = [{ sportId: `entry:${chosen.id}`, name: chosen.name, fee: chosen.fee }];
  let fee = chosen.fee;
  if (chosen.conditionQuestion && entryCondition === 'yes' && chosen.addFeeOnYes && chosen.extraFee > 0) {
    fee += chosen.extraFee;
    breakdown.push({
      sportId: `entry:${chosen.id}:extra`,
      name: `${chosen.name} extra`,
      fee: chosen.extraFee,
    });
  }
  return { ...resolved, fee, breakdown, categoryFeeOnly: false };
}
