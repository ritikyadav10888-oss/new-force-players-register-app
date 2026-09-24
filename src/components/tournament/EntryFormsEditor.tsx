'use client';

import { Plus, Trash2 } from 'lucide-react';
import { createEmptyCustomField, type CustomFieldDef } from '@/lib/custom-fields';
import { createEmptyEntryForm, type EntryForm } from '@/lib/entry-forms';

type Props = {
  forms: EntryForm[];
  onChange: (forms: EntryForm[]) => void;
};

export function EntryFormsEditor({ forms, onChange }: Props) {
  const update = (id: string, patch: Partial<EntryForm>) => {
    onChange(forms.map((form) => (form.id === id ? { ...form, ...patch } : form)));
  };

  const updateFieldList = (
    formId: string,
    key: 'fields' | 'yesFields',
    fieldId: string,
    patch: Partial<CustomFieldDef>
  ) => {
    onChange(
      forms.map((form) =>
        form.id === formId
          ? {
              ...form,
              [key]: form[key].map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
            }
          : form
      )
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', color: 'var(--heading)' }}>
          Registration types
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.45 }}>
          The player picks a type on the details page. Set whether the full player form opens or
          only this type’s questions. A Yes/No question can open more fields and, if you turn it
          on, add an extra fee. Leave this empty to keep one form for everyone.
        </p>
      </div>

      {forms.map((form, index) => (
        <div
          key={form.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: '0.65rem',
            padding: '0.9rem 1rem',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Type name *
              <input
                value={form.name}
                placeholder={index === 0 ? 'Kids' : index === 1 ? 'Pro player' : 'Owner'}
                onChange={(e) => update(form.id, { name: e.target.value })}
                style={{ padding: '0.45rem 0.55rem' }}
              />
            </label>
            <label style={{ width: '8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Fee (₹)
              <input
                type="number"
                min={0}
                value={form.fee}
                onChange={(e) => update(form.id, { fee: Math.max(0, Number(e.target.value) || 0) })}
                style={{ padding: '0.45rem 0.55rem' }}
              />
            </label>
            <label style={{ width: '11rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              When selected
              <select
                value={form.openMode}
                onChange={(e) => update(form.id, { openMode: e.target.value === 'new' ? 'new' : 'full' })}
                style={{ padding: '0.45rem 0.55rem', color: 'var(--foreground)', background: 'var(--surface)' }}
              >
                <option value="full">Full player form</option>
                <option value="new">Only this form</option>
              </select>
            </label>
            <label style={{ width: '9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Team info
              <select
                value={form.showTeamInfo ? 'yes' : 'no'}
                onChange={(e) => update(form.id, { showTeamInfo: e.target.value === 'yes' })}
                style={{ padding: '0.45rem 0.55rem', color: 'var(--foreground)', background: 'var(--surface)' }}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label style={{ width: '9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Player form
              <select
                value={form.showPlayerForm ? 'yes' : 'no'}
                onChange={(e) => update(form.id, { showPlayerForm: e.target.value === 'yes' })}
                style={{ padding: '0.45rem 0.55rem', color: 'var(--foreground)', background: 'var(--surface)' }}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onChange(forms.filter((item) => item.id !== form.id))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Trash2 size={14} /> Remove
            </button>
          </div>

          {form.fields.map((field) => (
            <div key={field.id} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Question
                <input
                  value={field.label}
                  placeholder="School name"
                  onChange={(e) => updateFieldList(form.id, 'fields', field.id, { label: e.target.value })}
                  style={{ padding: '0.45rem 0.55rem' }}
                />
              </label>
              <label style={{ width: '9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Type
                <select
                  value={field.type}
                  onChange={(e) =>
                    updateFieldList(form.id, 'fields', field.id, {
                      type: e.target.value as CustomFieldDef['type'],
                    })
                  }
                  style={{ padding: '0.45rem 0.55rem', color: 'var(--foreground)', background: 'var(--surface)' }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Dropdown</option>
                  <option value="image">Photo</option>
                </select>
              </label>
              {field.type === 'select' ? (
                <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Options
                  <input
                    value={field.options}
                    placeholder="S, M, L"
                    onChange={(e) => updateFieldList(form.id, 'fields', field.id, { options: e.target.value })}
                    style={{ padding: '0.45rem 0.55rem' }}
                  />
                </label>
              ) : null}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--soft)', marginBottom: '0.45rem' }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateFieldList(form.id, 'fields', field.id, { required: e.target.checked })}
                  style={{ width: '1rem', height: '1rem' }}
                />
                Required
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  update(form.id, { fields: form.fields.filter((item) => item.id !== field.id) })
                }
                aria-label="Remove question"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => update(form.id, { fields: [...form.fields, createEmptyCustomField()] })}
            style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
          >
            <Plus size={14} /> Add question
          </button>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Yes/No question (optional)
            <input
              value={form.conditionQuestion}
              placeholder="Are you playing?"
              onChange={(e) => update(form.id, { conditionQuestion: e.target.value })}
              style={{ padding: '0.45rem 0.55rem' }}
            />
          </label>
          {form.conditionQuestion.trim() ? (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--soft)' }}>
                <input
                  type="checkbox"
                  checked={form.addFeeOnYes}
                  onChange={(e) => update(form.id, { addFeeOnYes: e.target.checked })}
                  style={{ width: '1rem', height: '1rem' }}
                />
                Add extra fee when the answer is Yes
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--soft)' }}>
                <input
                  type="checkbox"
                  checked={form.showPlayerFormOnYes}
                  onChange={(e) => update(form.id, { showPlayerFormOnYes: e.target.checked })}
                  style={{ width: '1rem', height: '1rem' }}
                />
                Show the player form when the answer is Yes
              </label>
              {form.addFeeOnYes ? (
                <label style={{ width: '8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Extra fee (₹)
                  <input
                    type="number"
                    min={0}
                    value={form.extraFee}
                    onChange={(e) => update(form.id, { extraFee: Math.max(0, Number(e.target.value) || 0) })}
                    style={{ padding: '0.45rem 0.55rem' }}
                  />
                </label>
              ) : null}
              {form.yesFields.map((field) => (
                <div key={field.id} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Yes question
                    <input
                      value={field.label}
                      placeholder="Player name"
                      onChange={(e) => updateFieldList(form.id, 'yesFields', field.id, { label: e.target.value })}
                      style={{ padding: '0.45rem 0.55rem' }}
                    />
                  </label>
                  <label style={{ width: '9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Type
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateFieldList(form.id, 'yesFields', field.id, {
                          type: e.target.value as CustomFieldDef['type'],
                        })
                      }
                      style={{ padding: '0.45rem 0.55rem', color: 'var(--foreground)', background: 'var(--surface)' }}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="select">Dropdown</option>
                      <option value="image">Photo</option>
                    </select>
                  </label>
                  {field.type === 'select' ? (
                    <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Options
                      <input
                        value={field.options}
                        placeholder="S, M, L"
                        onChange={(e) => updateFieldList(form.id, 'yesFields', field.id, { options: e.target.value })}
                        style={{ padding: '0.45rem 0.55rem' }}
                      />
                    </label>
                  ) : null}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--soft)', marginBottom: '0.45rem' }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateFieldList(form.id, 'yesFields', field.id, { required: e.target.checked })}
                      style={{ width: '1rem', height: '1rem' }}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => update(form.id, { yesFields: form.yesFields.filter((item) => item.id !== field.id) })}
                    aria-label="Remove yes question"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => update(form.id, { yesFields: [...form.yesFields, createEmptyCustomField()] })}
                style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
              >
                <Plus size={14} /> Add question shown on Yes
              </button>
            </>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        className="btn-secondary"
        onClick={() => onChange([...forms, createEmptyEntryForm()])}
        style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <Plus size={16} /> Add type
      </button>
    </div>
  );
}
