'use client';

import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { MAX_SPONSORS, type SponsorEntry } from '@/lib/sponsors';

function compressSponsorLogo(file: File, callback: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target?.result as string;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 240;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) {
          height *= MAX / width;
          width = MAX;
        }
      } else if (height > MAX) {
        width *= MAX / height;
        height = MAX;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.72));
    };
  };
}

type Props = {
  sponsors: SponsorEntry[];
  onChange: (next: SponsorEntry[]) => void;
};

export function SponsorFields({ sponsors, onChange }: Props) {
  const updateAt = (idx: number, patch: Partial<SponsorEntry>) => {
    onChange(sponsors.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const onLogoPick = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2MB.');
      return;
    }
    compressSponsorLogo(file, (dataUrl) => updateAt(idx, { logo: dataUrl }));
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label>Sponsors (optional)</label>
      <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.75rem', lineHeight: 1.45 }}>
        Add a <strong style={{ color: '#94a3b8' }}>logo</strong> and <strong style={{ color: '#94a3b8' }}>name</strong> for each
        sponsor. They appear on the registration banner and above the signup form.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {sponsors.map((row, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '0.65rem',
              alignItems: 'center',
              padding: '0.65rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <label
              style={{
                width: 52,
                height: 52,
                flexShrink: 0,
                borderRadius: 10,
                border: '1px dashed rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.25)',
              }}
              title="Upload sponsor logo"
            >
              {row.logo ? (
                <img src={row.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <ImageIcon size={20} color="#64748b" />
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onLogoPick(idx, e)}
              />
            </label>
            <input
              type="text"
              value={row.name}
              onChange={(e) => updateAt(idx, { name: e.target.value })}
              placeholder="Sponsor name"
              maxLength={80}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.5rem', flexShrink: 0 }}
              onClick={() => onChange(sponsors.filter((_, i) => i !== idx))}
              title="Remove sponsor"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-secondary"
        style={{ marginTop: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        onClick={() => {
          if (sponsors.length >= MAX_SPONSORS) return;
          onChange([...sponsors, { name: '', logo: '' }]);
        }}
        disabled={sponsors.length >= MAX_SPONSORS}
      >
        <Plus size={16} /> Add sponsor
      </button>
    </div>
  );
}
