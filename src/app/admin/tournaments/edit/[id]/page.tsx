'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft, Image as ImageIcon, Plus, Trash2, Globe, Lock } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { resolveSportsProfileForTournament, withSyncedSportsProfilePayload } from '@/lib/form-config';
import { normalizeSponsorsForSave, parseSponsorsFromApi, type SponsorEntry } from '@/lib/sponsors';
import { SponsorFields } from '@/components/tournament/SponsorFields';
import styles from './edit.module.css';

interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options: string; // Comma separated if select
  required: boolean;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_FORM_CONFIG = {
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
};

export default function EditTournament({ params }: PageProps) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const tournamentId = unwrappedParams.id;

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    slug: '',
    venue: '',
    type: 'Team',
    sport: 'Cricket',
    fee: '',
    maxPlayers: '10',
    theme: '#6366f1',
    description: '',
    registrationDeadline: '',
    rules: '',
    organizerName: '',
    organizerPhone: '',
    terms: '',
    status: 'Active',
    isPublic: true,
    registrations: 0,
    collections: 0
  });

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  const [formConfig, setFormConfig] = useState(DEFAULT_FORM_CONFIG);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');

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

  // Load tournament details
  useEffect(() => {
    const fetchTournament = async () => {
      setLoading(true);
      try {
        const { data: item, error } = await supabase
          .from('tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (error) throw error;

        if (item) {
          setFormData({
            id: item.id || '',
            name: item.name || '',
            slug: item.slug || '',
            venue: item.venue || '',
            type: item.type || 'Team',
            sport: item.sport || 'Cricket',
            fee: item.fee?.toString() || '',
            maxPlayers: item.max_players?.toString() || '10',
            theme: item.theme || '#6366f1',
            description: item.description || '',
            registrationDeadline: item.registration_deadline || '',
            rules: item.rules || '',
            organizerName: item.organizer_name || '',
            organizerPhone: item.organizer_phone || '',
            terms: item.terms || '',
            status: item.status || 'Active',
            isPublic: item.is_public !== false,
            registrations: 0,
            collections: 0
          });
          setSponsors(parseSponsorsFromApi(item.sponsors));
          setCustomFields(item.custom_fields || []);
          setFormConfig({
            ...DEFAULT_FORM_CONFIG,
            ...(item.form_config || {}),
            cricketProfile: resolveSportsProfileForTournament(
              (item.form_config || {}) as Record<string, unknown>,
              item.sport || 'Cricket'
            ),
          });
          setBanner(item.banner_url || '');
        } else {
          alert('Tournament not found.');
          router.push('/admin');
        }
      } catch (err: any) {
        console.error('Error fetching tournament details:', err.message);
        alert('Tournament not found or error loading.');
        router.push('/admin');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [tournamentId, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'name' ? { slug: value.toLowerCase().replace(/\s+/g, '-') } : {})
    }));
  };

  const handleAddCustomField = () => {
    setCustomFields(prev => [
      ...prev,
      {
        id: 'field_' + Date.now(),
        label: '',
        type: 'text',
        options: '',
        required: false
      }
    ]);
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
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

    const updatedTournament = {
      name: formData.name,
      slug: formData.slug,
      venue: formData.venue,
      type: formData.type,
      sport: formData.sport || 'Cricket',
      fee: Number(formData.fee) || 0,
      max_players: Number(formData.maxPlayers) || 1,
      theme: formData.theme,
      description: formData.description,
      registration_deadline: formData.registrationDeadline,
      rules: formData.rules,
      organizer_name: formData.organizerName,
      organizer_phone: formData.organizerPhone,
      terms: formData.terms,
      status: formData.status,
      is_public: formData.isPublic,
      custom_fields: customFields.filter(f => f.label.trim() !== ''),
      form_config: withSyncedSportsProfilePayload(formConfig),
      banner_url: banner,
      sponsors: normalizeSponsorsForSave(sponsors),
    };

    try {
      const { error } = await supabase
        .from('tournaments')
        .update(updatedTournament)
        .eq('id', tournamentId);

      if (error) throw error;

      alert('Tournament updated successfully!');
      router.push('/admin');
    } catch (err: any) {
      alert('Error updating tournament: ' + err.message);
    }
  };

  const sportsProfileCardHint =
    formData.sport === 'Cricket'
      ? 'Cricket: multi-select roles, batting hand & bowling style on the registration form.'
      : formData.sport === 'Football'
        ? 'Football: multi-select positions (goalkeeper through winger) on the registration form.'
        : 'Other sports: playing role dropdown; add positions or notes with custom fields below.';

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>Loading tournament settings...</div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/admin" className={styles.backLink}>
          <ArrowLeft size={20} />
          Back to Dashboard
        </Link>
      </div>

      <header style={{ marginBottom: '2rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700 }}>Edit Tournament Settings</h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Update tournament details and refine custom form registration fields.</p>
      </header>

      <form onSubmit={handleSubmit} className={`glass-panel ${styles.formContainer}`}>
        
        {/* Banner Upload */}
        <div 
          className={styles.bannerUpload}
          style={{
            backgroundImage: banner ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${banner})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
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
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>1920x1080 recommended</p>
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
              This drives which role UI players see. Enable <strong>Sports profile</strong> in standard fields for
              roles or positions. Cricket and Football use chip pickers; Other uses a simple dropdown (extend with custom
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
              value={formData.fee}
              onChange={handleChange}
            />
          </div>

          {formData.type === 'Team' && (
            <div className={styles.formGroup}>
              <label htmlFor="maxPlayers">Max Players Per Team</label>
              <input 
                type="number" 
                id="maxPlayers" 
                name="maxPlayers" 
                required 
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
              value={formData.organizerName}
              onChange={handleChange}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="organizerPhone">Organizer Phone</label>
            <input 
              type="tel" 
              id="organizerPhone" 
              name="organizerPhone" 
              required 
              value={formData.organizerPhone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="description">Tournament Description</label>
          <textarea 
            id="description" 
            name="description" 
            rows={3}
            value={formData.description}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="rules">Game Rules</label>
          <textarea 
            id="rules" 
            name="rules" 
            rows={3}
            value={formData.rules}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="terms">Terms and Conditions</label>
          <textarea 
            id="terms" 
            name="terms" 
            rows={3}
            value={formData.terms}
            onChange={handleChange}
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
              .filter(([fieldKey]) => fieldKey !== 'sportsProfile')
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
                jerseySize: 'S, M, L, XL, XXL sizing',
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

        {/* ================= DYNAMIC PLAYER FORM BUILDER ================= */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>Custom Player Form Builder</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                Refine dynamic registration inputs players must answer (e.g. Jersey Size, Playing Position).
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
            {customFields.map((field) => (
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

                {/* Dropdown Options */}
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
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
