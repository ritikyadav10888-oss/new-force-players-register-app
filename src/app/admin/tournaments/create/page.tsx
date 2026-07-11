'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft, Image as ImageIcon, Plus, Trash2, Globe, Lock, ChevronUp, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  customFieldOrderKey,
  DEFAULT_FIELD_ORDER,
  fieldOrderLabel,
  isSportsProfileShown,
  moveVisibleFieldOrder,
  normalizeFieldOrder,
  visibleFieldOrder,
  withSyncedSportsProfilePayload,
} from '@/lib/form-config';
import { normalizeSponsorsForSave, type SponsorEntry } from '@/lib/sponsors';
import { SponsorFields } from '@/components/tournament/SponsorFields';
import styles from './create.module.css';

interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options: string; // Comma separated if select
  required: boolean;
}


export default function CreateTournament() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    venue: '',
    type: 'Team', // 'Team' or 'Individual'
    sport: 'Cricket',
    fee: '',
    minPlayers: '1',
    maxPlayers: '10',
    theme: '#6366f1',
    description: '',
    registrationDeadline: '',
    rules: '',
    organizerName: '',
    organizerPhone: '',
    terms: '',
    isPublic: true,
  });
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  // Custom Fields state
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  // Banner state
  const [banner, setBanner] = useState('');

  // Standard Fields Configurator State
  const [formConfig, setFormConfig] = useState({
    email: { enabled: true, required: true },
    phone: { enabled: true, required: true },
    emergencyContact: { enabled: true, required: false },
    dob: { enabled: true, required: false },
    age: { enabled: true, required: false },
    gender: { enabled: true, required: false },
    jerseyName: { enabled: false, required: false },
    jerseyNumber: { enabled: false, required: false },
    jerseySize: { enabled: false, required: false },
    photo: { enabled: false, required: false },
    cricketProfile: { enabled: false, required: false }
  });
  const [fieldOrder, setFieldOrder] = useState<string[]>(() => [...DEFAULT_FIELD_ORDER]);

  const handleFormConfigChange = (field: string, key: 'enabled' | 'required', value: boolean) => {
    setFormConfig(prev => {
      const updatedField = { ...prev[field as keyof typeof prev], [key]: value };
      if (key === 'enabled' && !value) {
        updatedField.required = false;
      }
      return {
        ...prev,
        [field]: updatedField
      };
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'name' ? { slug: value.toLowerCase().replace(/\s+/g, '-') } : {})
    }));
    if (name === 'sport' && (value === 'Cricket' || value === 'Football')) {
      setFormConfig((prev) => ({
        ...prev,
        cricketProfile: { enabled: true, required: prev.cricketProfile?.required ?? false },
      }));
    }
  };

  const handleAddCustomField = () => {
    const id = 'field_' + Date.now();
    setCustomFields(prev => [
      ...prev,
      {
        id,
        label: '',
        type: 'text',
        options: '',
        required: false
      }
    ]);
    setFieldOrder(prev => normalizeFieldOrder([...prev, customFieldOrderKey(id)], [...customFields, { id }]));
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
    setFieldOrder(prev => prev.filter(k => k !== customFieldOrderKey(id)));
  };

  const handleCustomFieldChange = (id: string, key: keyof CustomField, value: any) => {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const compressImage = (file: File, callback: (base64: string) => void) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 675; // 16:9 aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        callback(dataUrl);
      };
    };
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB. Please upload a smaller image.');
        return;
      }
      compressImage(file, (base64String) => {
        setBanner(base64String);
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const slug =
      formData.slug ||
      formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    if (Number(formData.fee) < 0) {
      alert('Registration fee cannot be negative.');
      return;
    }

    if (formData.type === 'Team') {
      const minP = Number(formData.minPlayers) || 1;
      const maxP = Number(formData.maxPlayers) || 1;
      if (minP < 1) {
        alert('Minimum players per team must be at least 1.');
        return;
      }
      if (minP > maxP) {
        alert('Minimum players per team cannot be greater than maximum players.');
        return;
      }
    }

    const payloadJson = JSON.stringify({
      banner,
      sponsors: normalizeSponsorsForSave(sponsors),
    });
    if (payloadJson.length > 3_500_000) {
      alert(
        'Banner or sponsor images are too large for the database. Use a smaller banner (under ~2MB) or remove large sponsor logos.'
      );
      return;
    }

    const row = {
      slug,
      name: formData.name,
      type: formData.type,
      venue: formData.venue,
      fee: Number(formData.fee) || 0,
      min_players: formData.type === 'Team' ? Number(formData.minPlayers) || 1 : 1,
      max_players: Number(formData.maxPlayers) || 1,
      theme: formData.theme,
      description: formData.description,
      registration_deadline: formData.registrationDeadline,
      rules: formData.rules,
      organizer_name: formData.organizerName,
      organizer_phone: formData.organizerPhone.trim() || null,
      terms: formData.terms,
      status: 'Active',
      is_public: formData.isPublic,
      sport: formData.sport || 'Cricket',
      custom_fields: customFields.filter((f) => f.label.trim() !== ''),
      form_config: withSyncedSportsProfilePayload({
        ...formConfig,
        fieldOrder: normalizeFieldOrder(fieldOrder, customFields),
      }),
      banner_url: banner || null,
      sponsors: normalizeSponsorsForSave(sponsors),
    };

    try {
      const { data, error } = await supabase
        .from('tournaments')
        .insert([row])
        .select('slug')
        .single();

      if (error) {
        if (error.code === '42501' || error.message?.toLowerCase().includes('policy')) {
          throw new Error(
            'Not authorized as admin. Log out, then confirm admin_users has your UUID (Admin → Settings).'
          );
        }
        if (error.code === '23505') {
          throw new Error('This tournament slug already exists. Change the name or slug.');
        }
        const detail = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
        throw new Error(detail || 'Database rejected the save');
      }

      alert('Tournament created successfully! Public Link: /register/' + data.slug);
      router.push('/admin');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create tournament';
      alert('Error creating tournament: ' + message);
    }
  };

  const sportsProfileCardHint =
    formData.sport === 'Cricket'
      ? 'Cricket: multi-select roles, batting hand & bowling style on the registration form.'
      : formData.sport === 'Football'
        ? 'Football: multi-select positions (goalkeeper through winger) on the registration form.'
        : 'Other sports: playing role dropdown; add positions or notes with custom fields below.';

  const fullFieldOrder = normalizeFieldOrder(fieldOrder, customFields);
  const registerFieldOrder = visibleFieldOrder(
    { ...formConfig, fieldOrder: fullFieldOrder },
    customFields,
    isSportsProfileShown(formConfig.cricketProfile)
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/admin" className={styles.backLink}>
          <ArrowLeft size={20} />
          Back to Dashboard
        </Link>
      </div>

      <header style={{ marginBottom: '2rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700 }}>Create Tournament</h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Set up a new tournament with custom registration form fields.</p>
      </header>

      <form onSubmit={handleSubmit} className={`glass-panel ${styles.formContainer}`}>
        
        {/* Banner Upload */}
        <div 
          className={styles.bannerUpload}
          style={{
            backgroundImage: banner ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${banner})` : 'none',
            backgroundSize: banner ? 'cover, contain' : 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat, no-repeat',
            position: 'relative',
            cursor: 'pointer',
            overflow: 'hidden'
          }}
          onClick={() => document.getElementById('banner-file-input')?.click()}
        >
          <input 
            type="file" 
            id="banner-file-input" 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={handleBannerUpload} 
          />
          {banner ? (
            <div style={{ zIndex: 2, textAlign: 'center' }}>
              <ImageIcon size={32} style={{ color: 'white', marginBottom: '1rem' }} />
              <p style={{ color: 'white', fontWeight: 600 }}>Change tournament banner</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <ImageIcon size={32} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
              <p style={{ color: '#94a3b8', fontWeight: 500 }}>Click to upload tournament banner</p>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>679 width X 303 Height content size (LinkedIn size banner) recommended</p>
            </div>
          )}
        </div>

        <SponsorFields sponsors={sponsors} onChange={setSponsors} />

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Tournament Name</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              required 
              placeholder="e.g. Summer Cup 2026"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="slug">Public Link Slug</label>
            <input 
              type="text" 
              id="slug" 
              name="slug" 
              required 
              value={formData.slug}
              onChange={handleChange}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="type">Tournament Type</label>
            <select 
              id="type" 
              name="type" 
              required 
              value={formData.type} 
              onChange={handleChange}
              style={{
                padding: '0.75rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="Team">Team Tournament</option>
              <option value="Individual">Individual/Solo Tournament</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="sport">Sport</label>
            <select
              id="sport"
              name="sport"
              value={formData.sport}
              onChange={handleChange}
              style={{
                padding: '0.75rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="Cricket">Cricket (roles, batting &amp; bowling)</option>
              <option value="Football">Football (multi-select positions)</option>
              <option value="Other">Other / generic (simple role dropdown)</option>
            </select>
            <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.4rem' }}>
              This drives which role UI players see. Turn on <strong>Sports profile</strong> below to collect roles or
              positions. Cricket and Football use chip pickers; Other uses a simple dropdown (extend with custom
              fields).
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="registrationDeadline">Registration End Deadline</label>
            <input 
              type="date" 
              id="registrationDeadline" 
              name="registrationDeadline" 
              required 
              value={formData.registrationDeadline}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="venue">Venue</label>
            <input 
              type="text" 
              id="venue" 
              name="venue" 
              required 
              placeholder="e.g. Force Sports Arena, Borivali"
              value={formData.venue}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="fee">Registration Fee (₹)</label>
            <input 
              type="number" 
              id="fee" 
              name="fee" 
              required
              min={0}
              placeholder="e.g. 1500"
              value={formData.fee}
              onChange={handleChange}
            />
          </div>

          {formData.type === 'Team' && (
            <div className={styles.formGroup}>
              <label htmlFor="minPlayers">Min Players Per Team</label>
              <input 
                type="number" 
                id="minPlayers" 
                name="minPlayers" 
                required 
                min={1}
                placeholder="e.g. 7"
                value={formData.minPlayers}
                onChange={handleChange}
              />
            </div>
          )}

          {formData.type === 'Team' && (
            <div className={styles.formGroup}>
              <label htmlFor="maxPlayers">Max Players Per Team</label>
              <input 
                type="number" 
                id="maxPlayers" 
                name="maxPlayers" 
                required 
                min={1}
                placeholder="e.g. 10"
                value={formData.maxPlayers}
                onChange={handleChange}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="theme">Custom Theme Color</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <input 
                type="color" 
                id="theme" 
                name="theme" 
                value={formData.theme}
                onChange={handleChange}
                style={{ width: '60px', padding: '0.25rem', height: '45px', cursor: 'pointer' }}
              />
              <input 
                type="text" 
                value={formData.theme}
                readOnly
                style={{ flex: 1, fontFamily: 'monospace' }}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="organizerName">Organizer Name</label>
            <input 
              type="text" 
              id="organizerName" 
              name="organizerName" 
              required 
              placeholder="e.g. John Doe"
              value={formData.organizerName}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="organizerPhone">Organizer Phone <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
            <input 
              type="tel" 
              id="organizerPhone" 
              name="organizerPhone" 
              placeholder="e.g. 9876543210"
              value={formData.organizerPhone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="description">Tournament Description</label>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            Shown to players on the registration page — venue highlights, format, prizes, etc.
          </p>
          <textarea
            id="description"
            name="description"
            rows={6}
            placeholder="e.g. Welcome to the All Stars League 2026! A fast-paced 7-a-side football tournament held at Samajonnati Turf, Borivali West on 11th & 12th July..."
            value={formData.description}
            onChange={handleChange}
            style={{ resize: 'vertical', minHeight: '120px' }}
          />
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="rules">Game Rules</label>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            List each rule on a new line. Players will see this when they click "View Tournament Details".
          </p>
          <textarea
            id="rules"
            name="rules"
            rows={10}
            placeholder={`e.g.\n1. Teams must field exactly 7 players.\n2. Rolling substitutions allowed.\n3. Match duration: 2 × 20 min halves.\n4. No offside rule.\n5. Yellow / red cards enforced by referee.\n6. Players must carry valid ID proof on match day.\n7. Organizer's decision is final in all disputes.`}
            value={formData.rules}
            onChange={handleChange}
            style={{ resize: 'vertical', minHeight: '220px', fontFamily: 'inherit', lineHeight: '1.7' }}
          />
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="terms">Terms and Conditions</label>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            Players must accept these before proceeding to payment. Be specific about refunds, conduct, and liability.
          </p>
          <textarea
            id="terms"
            name="terms"
            rows={10}
            placeholder={`e.g.\n1. Registration fees are non-refundable once payment is confirmed.\n2. All registered players must carry a valid government-issued photo ID on match day.\n3. The organizer reserves the right to disqualify any team for misconduct.\n4. Force Playing Field India Pvt. Ltd. is not responsible for injuries or losses during the event.\n5. Schedule changes will be communicated via the registered contact number.\n6. By registering, players agree to abide by all tournament rules and decisions of the organizer.`}
            value={formData.terms}
            onChange={handleChange}
            style={{ resize: 'vertical', minHeight: '220px', fontFamily: 'inherit', lineHeight: '1.7' }}
          />
        </div>

        {/* ================= STANDARD FIELDS CONFIGURATOR ================= */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>Standard Player Form Fields</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Select which common fields to enable on the player registration form and specify if they are required.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            {/* Core Full Name Field - Always On */}
            <div className="glass-panel" style={{ padding: '1rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div>
                <p style={{ fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  Full Name
                  <span className="badge" style={{ padding: '0.1rem 0.5rem', fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', border: 'none', margin: 0 }}>Core</span>
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', margin: 0 }}>Player's identity representation</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', border: 'none', margin: 0 }}>Show</span>
                <span className="badge" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: 'none', margin: 0 }}>Required</span>
              </div>
            </div>

            {/* Configurable Standard Fields */}
            {Object.entries(formConfig)
              .filter(([fieldKey]) => fieldKey !== 'sportsProfile' && fieldKey !== 'fieldOrder')
              .map(([fieldKey, config]) => {
              const labelMap: Record<string, string> = {
                email: 'Email Address',
                phone: 'Phone Number',
                emergencyContact: 'Emergency Contact',
                dob: 'Date of Birth',
                age: 'Age',
                gender: 'Gender',
                jerseyName: 'Jersey Name',
                jerseyNumber: 'Jersey Number',
                jerseySize: 'Jersey Size',
                photo: 'Player Photo',
                cricketProfile: 'Sports profile',
              };

              const descMap: Record<string, string> = {
                email: 'For invoice and ticket details',
                phone: 'For direct communication',
                emergencyContact: 'For in-game health safety',
                dob: 'Verifies category eligibility',
                age: 'Calculated or input age',
                gender: 'For grouping and divisions',
                jerseyName: 'Custom printed back name',
                jerseyNumber: 'Jersey print digits',
                jerseySize: 'S, M, L, XL – 6XL sizing',
                photo: 'Creds photo credentials',
              };

              return (
                <div 
                  key={fieldKey} 
                  className="glass-panel" 
                  style={{ 
                    padding: '1rem', 
                    border: config.enabled ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(255,255,255,0.05)', 
                    borderRadius: 'var(--radius-md)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    background: config.enabled ? 'rgba(99, 102, 241, 0.02)' : 'rgba(255,255,255,0.01)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontWeight: 600, color: config.enabled ? 'white' : '#94a3b8', margin: 0 }}>{labelMap[fieldKey] || fieldKey}</p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', margin: 0 }}>
                      {fieldKey === 'cricketProfile' ? sportsProfileCardHint : descMap[fieldKey] || ''}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: '#cbd5e1', margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={config.enabled}
                        onChange={(e) => handleFormConfigChange(fieldKey, 'enabled', e.target.checked)}
                        style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      Show
                    </label>

                    <label 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        cursor: config.enabled ? 'pointer' : 'not-allowed', 
                        fontSize: '0.8rem', 
                        color: config.enabled ? '#cbd5e1' : '#64748b',
                        opacity: config.enabled ? 1 : 0.5,
                        margin: 0
                      }}
                    >
                      <input 
                        type="checkbox" 
                        disabled={!config.enabled}
                        checked={config.required}
                        onChange={(e) => handleFormConfigChange(fieldKey, 'required', e.target.checked)}
                        style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: config.enabled ? 'pointer' : 'not-allowed' }}
                      />
                      Required
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= FIELD ORDER ================= */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>Field order</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              This is the exact order players will see on the registration page. Only enabled fields are listed.
            </p>
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {registerFieldOrder.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                Enable at least one field above to set order.
              </div>
            ) : null}
            {registerFieldOrder.map((key, idx) => (
              <div
                key={key}
                className="glass-panel"
                style={{
                  padding: '0.65rem 1rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: 'rgba(255,255,255,0.015)',
                }}
              >
                <span style={{ fontWeight: 500, color: '#e2e8f0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '1.25rem' }}>{idx + 1}.</span>
                  {fieldOrderLabel(key, customFields)}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    aria-label={`Move ${fieldOrderLabel(key, customFields)} up`}
                    disabled={idx === 0}
                    onClick={() =>
                      setFieldOrder((prev) =>
                        moveVisibleFieldOrder(
                          normalizeFieldOrder(prev, customFields),
                          registerFieldOrder,
                          idx,
                          -1
                        )
                      )
                    }
                    style={{
                      padding: '0.35rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.4rem',
                      color: idx === 0 ? '#475569' : '#cbd5e1',
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                    }}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${fieldOrderLabel(key, customFields)} down`}
                    disabled={idx === registerFieldOrder.length - 1}
                    onClick={() =>
                      setFieldOrder((prev) =>
                        moveVisibleFieldOrder(
                          normalizeFieldOrder(prev, customFields),
                          registerFieldOrder,
                          idx,
                          1
                        )
                      )
                    }
                    style={{
                      padding: '0.35rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.4rem',
                      color: idx === registerFieldOrder.length - 1 ? '#475569' : '#cbd5e1',
                      cursor: idx === registerFieldOrder.length - 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                    }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ================= DYNAMIC PLAYER FORM BUILDER ================= */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>Custom Player Form Builder</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Add custom input questions players must answer during registration (e.g. Jersey Size, Playing Position).
              </p>
            </div>
            <button 
              type="button" 
              onClick={handleAddCustomField}
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
            >
              <Plus size={16} /> Add Field
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {customFields.map((field, idx) => (
              <div 
                key={field.id} 
                className="animate-slide-in-right" 
                style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap',
                  gap: '1rem', 
                  alignItems: 'center', 
                  background: 'rgba(255,255,255,0.02)', 
                  padding: '1rem', 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--border)' 
                }}
              >
                {/* Field Label */}
                <div style={{ flex: 2, minWidth: '200px' }} className={styles.formGroup}>
                  <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Field Label/Question</label>
                  <input 
                    type="text" 
                    placeholder="e.g. T-Shirt Size or Experience Level" 
                    value={field.label}
                    required
                    onChange={e => handleCustomFieldChange(field.id, 'label', e.target.value)}
                    style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                  />
                </div>

                {/* Field Type */}
                <div style={{ flex: 1, minWidth: '130px' }} className={styles.formGroup}>
                  <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Input Type</label>
                  <select 
                    value={field.type}
                    onChange={e => handleCustomFieldChange(field.id, 'type', e.target.value as any)}
                    style={{ 
                      padding: '0.5rem', 
                      fontSize: '0.9rem',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'white',
                      height: '40px'
                    }}
                  >
                    <option value="text">Text Input</option>
                    <option value="number">Number Input</option>
                    <option value="select">Dropdown Choice</option>
                  </select>
                </div>

                {/* Dropdown Options (Conditional) */}
                {field.type === 'select' && (
                  <div style={{ flex: 2, minWidth: '200px' }} className={styles.formGroup}>
                    <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Dropdown Options (Comma Separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. S, M, L, XL" 
                      value={field.options}
                      required
                      onChange={e => handleCustomFieldChange(field.id, 'options', e.target.value)}
                      style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                    />
                  </div>
                )}

                {/* Required Flag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.2rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    id={`req_${field.id}`}
                    checked={field.required}
                    onChange={e => handleCustomFieldChange(field.id, 'required', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor={`req_${field.id}`} style={{ fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                    Required
                  </label>
                </div>

                {/* Remove Button */}
                <button 
                  type="button" 
                  onClick={() => handleRemoveCustomField(field.id)}
                  style={{ 
                    marginTop: '1.2rem', 
                    padding: '0.5rem', 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#ef4444', 
                    cursor: 'pointer' 
                  }}
                  title="Remove Field"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {customFields.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                No custom questions configured. Players will only fill standard personal information.
              </div>
            )}
          </div>
        </div>

        <div className={styles.visibilityPanel}>
          <div className={styles.visibilityIconWrap} aria-hidden>
            {formData.isPublic ? <Globe size={22} strokeWidth={1.75} /> : <Lock size={22} strokeWidth={1.75} />}
          </div>
          <div className={styles.visibilityBody}>
            <div className={styles.visibilityLabel}>Discovery &amp; homepage</div>
            <div className={styles.visibilitySegment} role="group" aria-label="Tournament visibility">
              <button
                type="button"
                className={`${styles.visibilityOption} ${formData.isPublic ? styles.visibilityOptionActive : ''}`}
                onClick={() => setFormData((p) => ({ ...p, isPublic: true }))}
              >
                <Globe size={16} />
                Public listing
              </button>
              <button
                type="button"
                className={`${styles.visibilityOption} ${!formData.isPublic ? styles.visibilityOptionActive : ''}`}
                onClick={() => setFormData((p) => ({ ...p, isPublic: false }))}
              >
                <Lock size={16} />
                Private link only
              </button>
            </div>
            <p className={styles.visibilityHint}>
              {formData.isPublic
                ? 'This tournament appears on the public homepage. Anyone can browse and open registration.'
                : 'Hidden from the homepage. Only people with the direct registration URL can sign up.'}
            </p>
          </div>
        </div>

        <div className={styles.formActions} style={{ marginTop: '3rem' }}>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            <Save size={20} />
            Create & Generate Link
          </button>
        </div>
      </form>
    </div>
  );
}
