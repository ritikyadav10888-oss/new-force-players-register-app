'use client';

import { toast } from 'sonner';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft, Image as ImageIcon, Plus, Trash2, Globe, Lock, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import Link from 'next/link';
import {
  customFieldOrderKey,
  DEFAULT_FIELD_ORDER,
  fieldOrderLabel,
  FIELD_ORDER_LABELS,
  isSportsProfileShown,
  moveVisibleFieldOrder,
  normalizeFieldOrder,
  reorderVisibleFieldOrder,
  resolveSportsProfileForTournament,
  visibleFieldOrder,
  withSyncedSportsProfilePayload,
  type StandardFieldFlags,
} from '@/lib/form-config';
import { normalizeSponsorsForSave, parseSponsorsFromApi, type SponsorEntry } from '@/lib/sponsors';
import { SponsorFields } from '@/components/tournament/SponsorFields';
import { SportsConfigEditor } from '@/components/tournament/SportsConfigEditor';
import { AgeCategoriesEditor } from '@/components/tournament/AgeCategoriesEditor';
import { EligibilityMatrixEditor } from '@/components/tournament/EligibilityMatrixEditor';
import { FeeModePicker } from '@/components/tournament/FeeModePicker';
import { ThemeColorPicker } from '@/components/tournament/ThemeColorPicker';
import { adminFetch } from '@/lib/auth/admin-client';
import { CUSTOM_FIELD_VALIDATIONS } from '@/lib/custom-fields';
import {
  attachLegacyTeamsToSports,
  cleanSportsConfigForSave,
  flattenTeamsFromSports,
  isTeamLikeTournamentType,
  parsePrecreatedTeams,
  parseSportsConfig,
  type SportEntry,
} from '@/lib/multi-sport';
import {
  cleanAgeCategoriesForSave,
  parseAgeCategories,
  type AgeCategoryDef,
} from '@/lib/age-categories';
import {
  cleanEligibilityMatrixForSave,
  cleanFormSectionCopy,
  parseEligibilityMatrix,
  parseFormSectionCopy,
  type EligibilityMatrix,
  type FormSectionCopy,
} from '@/lib/eligibility-matrix';
import {
  parseStepFees,
  resolveTournamentFeeMode,
  type TournamentFeeMode,
} from '@/lib/fee-mode';
import { listSportDisciplines } from '@/lib/sport-presets';
import styles from './edit.module.css';

type CustomerOption = { user_id: string; email: string | null };

interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'category';
  options: string; // Comma separated if select
  required: boolean;
  validation?: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_FORM_CONFIG: Record<string, StandardFieldFlags> = {
  name: { enabled: true, required: true },
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
    minPlayers: '1',
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
  const [teamCustomFields, setTeamCustomFields] = useState<CustomField[]>([]);
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  const [sportsConfig, setSportsConfig] = useState<SportEntry[]>([]);
  const [ageCategories, setAgeCategories] = useState<AgeCategoryDef[]>([]);
  const [feeMode, setFeeMode] = useState<TournamentFeeMode>('flat');
  const [firstEventFee, setFirstEventFee] = useState('0');
  const [extraEventFee, setExtraEventFee] = useState('0');
  const [eligibilityMatrix, setEligibilityMatrix] = useState<EligibilityMatrix>({
    enabled: false,
    rules: [],
  });
  const [ageCategorySection, setAgeCategorySection] = useState<FormSectionCopy>({});
  const [sportsSection, setSportsSection] = useState<FormSectionCopy>({});
  const [disciplineSection, setDisciplineSection] = useState<FormSectionCopy>({});
  const [formConfig, setFormConfig] = useState(DEFAULT_FORM_CONFIG);
  const [fieldOrder, setFieldOrder] = useState<string[]>(() => [...DEFAULT_FIELD_ORDER]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [ownerId, setOwnerId] = useState<string>('');
  const [viewerRole, setViewerRole] = useState<'superadmin' | 'customer'>('superadmin');
  const isCustomerViewer = viewerRole === 'customer';

  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await adminFetch('/api/admin/me');
        if (!res.ok) return;
        const me = await res.json();
        setViewerRole(me.role === 'customer' ? 'customer' : 'superadmin');
      } catch {
        /* ignore */
      }
    };
    loadRole();
  }, []);

  useEffect(() => {
    if (isCustomerViewer) return;
    const loadCustomers = async () => {
      try {
        const res = await adminFetch('/api/admin/customers');
        if (!res.ok) return;
        const json = (await res.json()) as { customers?: CustomerOption[] };
        setCustomers(json.customers || []);
      } catch {
        /* non-blocking */
      }
    };
    loadCustomers();
  }, [isCustomerViewer]);

  const handleFieldReorder = (
    visibleKeys: string[],
    fromIndex: number,
    toIndex: number
  ) => {
    setFieldOrder((prev) =>
      reorderVisibleFieldOrder(
        normalizeFieldOrder(prev, customFields),
        visibleKeys,
        fromIndex,
        toIndex
      )
    );
  };

  const handleFormConfigChange = (
    field: string,
    key: 'enabled' | 'required' | 'label' | 'description',
    value: boolean | string
  ) => {
    setFormConfig((prev) => {
      const current = { ...(prev[field as keyof typeof prev] || { enabled: false, required: false }) } as {
        enabled: boolean;
        required: boolean;
        label?: string;
        description?: string;
      };
      if (key === 'label' || key === 'description') {
        const trimmed = String(value).trim();
        if (trimmed) current[key] = trimmed;
        else delete current[key];
      } else {
        current[key] = Boolean(value);
        if (key === 'enabled' && !value) current.required = false;
      }
      if (field === 'name') {
        current.enabled = true;
        current.required = true;
      }
      return { ...prev, [field]: current };
    });
  };

  // Load tournament details
  useEffect(() => {
    const fetchTournament = async () => {
      setLoading(true);
      try {
        const res = await adminFetch(`/api/admin/tournaments/${tournamentId}`);
        const item = await res.json();
        if (!res.ok) {
          if (res.status === 403) {
            toast.error('You can only edit tournaments assigned to you.');
            router.replace('/customer');
            return;
          }
          throw new Error(item.error || 'Failed to load tournament');
        }

        if (item) {
          setFormData({
            id: item.id || '',
            name: item.name || '',
            slug: item.slug || '',
            venue: item.venue || '',
            type: item.type || 'Team',
            sport: item.sport || 'Cricket',
            fee: item.fee?.toString() || '',
            minPlayers: item.min_players?.toString() || '1',
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
          const parsedSports = attachLegacyTeamsToSports(
            parseSportsConfig(item.sports_config),
            parsePrecreatedTeams(item.precreated_teams)
          );
          const parsedAgeCategories = parseAgeCategories(item.age_categories);
          setSportsConfig(parsedSports);
          setAgeCategories(parsedAgeCategories);
          setFeeMode(
            resolveTournamentFeeMode({
              formConfig: item.form_config,
              sportsConfig: parsedSports,
              ageCategories: parsedAgeCategories,
            })
          );
          const stepFees = parseStepFees(item.form_config);
          setFirstEventFee(String(stepFees.firstEventFee));
          setExtraEventFee(String(stepFees.extraEventFee));
          setCustomFields(item.custom_fields || []);
          setTeamCustomFields(item.team_custom_fields || []);
          const rawFc = (item.form_config || {}) as Record<string, unknown>;
          const {
            fieldOrder: savedOrder,
            sportsProfile: _sp,
            eligibilityMatrix: rawMatrix,
            ageCategorySection: rawAgeSection,
            sportsSection: rawSportsSection,
            disciplineSection: rawDisciplineSection,
            ...restFc
          } = rawFc;
          setEligibilityMatrix(parseEligibilityMatrix(rawMatrix));
          setAgeCategorySection(parseFormSectionCopy(rawAgeSection));
          setSportsSection(parseFormSectionCopy(rawSportsSection));
          setDisciplineSection(parseFormSectionCopy(rawDisciplineSection));
          setFormConfig({
            ...DEFAULT_FORM_CONFIG,
            ...(restFc as typeof DEFAULT_FORM_CONFIG),
            cricketProfile: resolveSportsProfileForTournament(
              rawFc,
              item.sport || 'Cricket'
            ),
          });
          setFieldOrder(normalizeFieldOrder(savedOrder, item.custom_fields || []));
          setBanner(item.banner_url || '');
          setOwnerId(item.owner_id || '');
        } else {
          toast.error('Tournament not found.');
          router.push(isCustomerViewer ? '/customer' : '/admin');
        }
      } catch (err: any) {
        console.error('Error fetching tournament details:', err.message);
        toast.error('Tournament not found or error loading.');
        router.push(isCustomerViewer ? '/customer' : '/admin');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [tournamentId, router, isCustomerViewer]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'name' ? { slug: value.toLowerCase().replace(/\s+/g, '-') } : {})
    }));
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
        required: false,
        validation: 'auto',
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

  const handleAddTeamCustomField = () => {
    setTeamCustomFields(prev => [
      ...prev,
      {
        id: 'team_field_' + Date.now(),
        label: '',
        type: 'text',
        options: '',
        required: false
      }
    ]);
  };

  const handleRemoveTeamCustomField = (id: string) => {
    setTeamCustomFields(prev => prev.filter(f => f.id !== id));
  };

  const handleTeamCustomFieldChange = (id: string, key: keyof CustomField, value: any) => {
    setTeamCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
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
        toast.error('File size exceeds 5MB. Please upload a smaller image.');
        return;
      }
      compressImage(file, (base64String) => {
        setBanner(base64String);
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (Number(formData.fee) < 0) {
      toast.error('Registration fee cannot be negative.');
      return;
    }

    const cleanedSportsRaw = cleanSportsConfigForSave(sportsConfig);
    const teamMin = Math.max(1, Number(formData.minPlayers) || 1);
    const teamMax = Math.max(teamMin, Number(formData.maxPlayers) || teamMin);
    const cleanedSports = cleanedSportsRaw.map((s) =>
      s.entryType === 'team' ? { ...s, minPlayers: teamMin, maxPlayers: teamMax } : s
    );
    const cleanedTeams = flattenTeamsFromSports(cleanedSports);
    const cleanedAgeCategories = cleanAgeCategoriesForSave(ageCategories);

    if (cleanedSports.length > 0) {
      if (cleanedSports.some((s) => s.fee < 0)) {
        toast.error('Sport fees cannot be negative.');
        return;
      }
    }

    if ((feeMode === 'sport' || feeMode === 'step') && cleanedSports.length === 0) {
      toast.error(
        feeMode === 'step'
          ? 'Add at least one sport when First event + extras is selected.'
          : 'Add at least one sport when Sport-wise fee mode is selected.'
      );
      return;
    }
    if (feeMode === 'step' && (Number(firstEventFee) < 0 || Number(extraEventFee) < 0)) {
      toast.error('Event fees cannot be negative.');
      return;
    }

    if (feeMode === 'category' && cleanedAgeCategories.length === 0) {
      toast.error('Add at least one age category when Age-category fee mode is selected.');
      return;
    }

    if (
      isTeamLikeTournamentType(formData.type) ||
      cleanedSports.some((s) => s.entryType === 'team')
    ) {
      if (teamMin < 1) {
        toast.error('Minimum players per team must be at least 1.');
        return;
      }
      if (teamMin > teamMax) {
        toast.error('Minimum players per team cannot be greater than maximum players.');
        return;
      }
    }

    const cleanedMatrix = cleanEligibilityMatrixForSave(
      eligibilityMatrix,
      cleanedAgeCategories.map((c) => c.id),
      cleanedSports.map((s) => s.id)
    );
    const cleanedAgeSection = cleanFormSectionCopy(ageCategorySection);
    const cleanedSportsSection = cleanFormSectionCopy(sportsSection);
    const cleanedDisciplineSection = cleanFormSectionCopy(disciplineSection);

    const updatedTournament = {
      name: formData.name,
      slug: formData.slug,
      venue: formData.venue,
      type: formData.type,
      sport: formData.sport || 'Cricket',
      fee: Number(formData.fee) || 0,
      min_players: isTeamLikeTournamentType(formData.type) ? Number(formData.minPlayers) || 1 : 1,
      max_players: Number(formData.maxPlayers) || 1,
      theme: formData.theme,
      description: formData.description,
      registration_deadline: formData.registrationDeadline,
      rules: formData.rules,
      organizer_name: formData.organizerName,
      organizer_phone: formData.organizerPhone.trim() || null,
      terms: formData.terms,
      status: formData.status,
      is_public: formData.isPublic,
      custom_fields: customFields.filter(f => f.label.trim() !== ''),
      team_custom_fields: teamCustomFields.filter(f => f.label.trim() !== ''),
      form_config: withSyncedSportsProfilePayload({
        ...formConfig,
        fieldOrder: normalizeFieldOrder(fieldOrder, customFields),
        feeMode,
        firstEventFee: Math.max(0, Math.round(Number(firstEventFee) || 0)),
        extraEventFee: Math.max(0, Math.round(Number(extraEventFee) || 0)),
        eligibilityMatrix: cleanedMatrix,
        ageCategorySection: cleanedAgeSection,
        sportsSection: cleanedSportsSection,
        disciplineSection: cleanedDisciplineSection,
      }),
      banner_url: banner,
      sponsors: normalizeSponsorsForSave(sponsors),
      sports_config: cleanedSports,
      precreated_teams: cleanedTeams,
      age_categories: cleanedAgeCategories,
      owner_id: isCustomerViewer ? undefined : ownerId || null,
    };

    try {
      const res = await adminFetch(`/api/admin/tournaments/${tournamentId}`, {
        method: 'PATCH',
        body: JSON.stringify(updatedTournament),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Update failed');

      toast.success('Tournament updated successfully!');
      router.push(isCustomerViewer ? '/customer' : '/admin');
    } catch (err: any) {
      toast.error('Error updating tournament: ' + err.message);
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

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>Loading tournament settings...</div>;
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href={isCustomerViewer ? '/customer' : '/admin'} className={styles.backLink}>
          <ArrowLeft size={20} />
          {isCustomerViewer ? 'Back to Your Tournaments' : 'Back to Dashboard'}
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
              <option value="TeamLink">Team Link (rep pays, players self-join)</option>
            </select>
            {formData.type === 'Individual' && (
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Solo mode: singles = one player; doubles/mixed = player + partner details. No team
                name or representative.
              </p>
            )}
            {formData.type === 'TeamLink' && (
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Representative fills only their own details and pays first. A shareable link then
                lets teammates join themselves, up to Max Players Per Team.
              </p>
            )}
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

          <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
            <FeeModePicker
              value={feeMode}
              onChange={setFeeMode}
              firstEventFee={firstEventFee}
              extraEventFee={extraEventFee}
              onFirstEventFee={setFirstEventFee}
              onExtraEventFee={setExtraEventFee}
            />
          </div>

          {feeMode === 'flat' && (
            <div className={`${styles.formGroup} ${styles.feeFlatField}`}>
              <label htmlFor="fee">Registration Fee (₹)</label>
              <input
                type="number"
                id="fee"
                name="fee"
                required
                min={0}
                placeholder="e.g. 300"
                value={formData.fee}
                onChange={handleChange}
              />
            </div>
          )}

          {isTeamLikeTournamentType(formData.type) && (
            <div className={styles.formGroup}>
              <label htmlFor="minPlayers">Min Players Per Team</label>
              <input 
                type="number" 
                id="minPlayers" 
                name="minPlayers" 
                required 
                min={1}
                value={formData.minPlayers}
                onChange={handleChange}
              />
            </div>
          )}

          {isTeamLikeTournamentType(formData.type) && (
            <div className={styles.formGroup}>
              <label htmlFor="maxPlayers">Max Players Per Team</label>
              <input 
                type="number" 
                id="maxPlayers" 
                name="maxPlayers" 
                required 
                min={1}
                value={formData.maxPlayers}
                onChange={handleChange}
              />
            </div>
          )}

          <div
            id="age-categories-editor"
            className={`${styles.formGroup} ${styles.configPanel} ${styles.configPanelAge}`}
          >
            <AgeCategoriesEditor
              categories={ageCategories}
              onChange={setAgeCategories}
              feeEnabled={feeMode === 'category'}
            />
            {ageCategories.length > 0 ? (
              <div className={styles.sectionCopyFields}>
                <label className={styles.sectionCopyField}>
                  <span>Category section label (registration form)</span>
                  <input
                    value={ageCategorySection.label || ''}
                    onChange={(e) =>
                      setAgeCategorySection((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="Select a category *"
                  />
                </label>
                <label className={styles.sectionCopyField}>
                  <span>Category section description</span>
                  <textarea
                    value={ageCategorySection.description || ''}
                    onChange={(e) =>
                      setAgeCategorySection((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Please choose one option below to continue."
                    rows={2}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className={`${styles.formGroup} ${styles.configPanel} ${styles.configPanelSports}`}>
            <SportsConfigEditor
              sports={sportsConfig}
              onSportsChange={setSportsConfig}
              teamMinPlayers={Number(formData.minPlayers) || 1}
              teamMaxPlayers={Number(formData.maxPlayers) || 11}
              feeEnabled={feeMode === 'sport'}
            />
            {sportsConfig.length > 0 ? (
              <div className={styles.sectionCopyFields}>
                <label className={styles.sectionCopyField}>
                  <span>Sports section label (registration form)</span>
                  <input
                    value={sportsSection.label || ''}
                    onChange={(e) =>
                      setSportsSection((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="Select sports *"
                  />
                </label>
                <label className={styles.sectionCopyField}>
                  <span>Sports section description</span>
                  <textarea
                    value={sportsSection.description || ''}
                    onChange={(e) =>
                      setSportsSection((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Select the events you want to join."
                    rows={2}
                  />
                </label>
              </div>
            ) : null}
            {sportsConfig.length > 1 && listSportDisciplines(sportsConfig).length > 1 ? (
              <div className={styles.sectionCopyFields}>
                <label className={styles.sectionCopyField}>
                  <span>Discipline section label (registration form)</span>
                  <input
                    value={disciplineSection.label || ''}
                    onChange={(e) =>
                      setDisciplineSection((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="Select discipline *"
                  />
                </label>
                <label className={styles.sectionCopyField}>
                  <span>Discipline section description</span>
                  <textarea
                    value={disciplineSection.description || ''}
                    onChange={(e) =>
                      setDisciplineSection((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Choose Track, Field, Relay, and/or Fun Games."
                    rows={2}
                  />
                </label>
              </div>
            ) : null}
            {sportsConfig.length > 0 && (
              <p className={styles.configPanelNote}>
                Multi-sport entries are enabled for enrollment.
                {feeMode === 'sport'
                  ? ' Players pay per event selected (e.g. Women\'s ₹300 + Mixed Doubles ₹300 = ₹600). Age category is eligibility only.'
                  : feeMode === 'step'
                    ? ' The first selected event uses the first-event fee. Each event after that adds the extra-event fee.'
                    : feeMode === 'flat'
                      ? ' Players still choose sports, but checkout uses the flat registration fee.'
                      : ' Players still choose sports, but checkout uses the selected age-category fee only (not per event). Switch to Sport-wise for ₹300 × events.'}
                {formData.type === 'Individual'
                  ? ' Tournament type is Solo: singles = 1 player; doubles = you + partner (no team representative).'
                  : ''}
                {listSportDisciplines(sportsConfig).length > 1
                  ? ` Disciplines on the form: ${listSportDisciplines(sportsConfig).join(', ')}.`
                  : ''}
              </p>
            )}
          </div>

          <div className={`${styles.formGroup} ${styles.configPanel}`}>
            <EligibilityMatrixEditor
              categories={ageCategories}
              sports={sportsConfig}
              value={eligibilityMatrix}
              onChange={setEligibilityMatrix}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="theme">Custom Theme Color</label>
            <ThemeColorPicker
              value={formData.theme}
              inputId="theme"
              onChange={(theme) => setFormData((prev) => ({ ...prev, theme }))}
            />
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
            <label htmlFor="organizerPhone">Organizer Phone <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
            <input 
              type="tel" 
              id="organizerPhone" 
              name="organizerPhone" 
              value={formData.organizerPhone}
              onChange={handleChange}
            />
          </div>
        </div>

        {!isCustomerViewer ? (
        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="ownerId">Assign to Customer <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            The assigned customer can log in, view registrations, and edit this tournament.
          </p>
          <select id="ownerId" name="ownerId" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">— No customer (only you) —</option>
            {customers.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.email || c.user_id}
              </option>
            ))}
          </select>
          {customers.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem' }}>
              No customer accounts yet. Create one in{' '}
              <Link href="/admin/customers" style={{ color: '#818cf8' }}>Customers</Link>.
            </p>
          )}
        </div>
        ) : null}

        <div className={styles.formGroup} style={{ marginTop: '1.5rem' }}>
          <label htmlFor="description">Tournament Description</label>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
            Shown to players on the registration page — venue highlights, format, prizes, etc.
          </p>
          <textarea
            id="description"
            name="description"
            rows={6}
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
            <div className="glass-panel" style={{ padding: '1rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="std-label-name" style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>
                    Field label
                  </label>
                  <input
                    id="std-label-name"
                    type="text"
                    value={formConfig.name?.label ?? ''}
                    placeholder={FIELD_ORDER_LABELS.name}
                    onChange={(e) => handleFormConfigChange('name', 'label', e.target.value)}
                    style={{ width: '100%', fontWeight: 600 }}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>Player&apos;s identity representation</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, paddingTop: '1.4rem' }}>
                  <span className="badge" style={{ padding: '0.1rem 0.5rem', fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', border: 'none', margin: 0 }}>Core</span>
                  <span className="badge" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', border: 'none', margin: 0 }}>Show</span>
                  <span className="badge" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: 'none', margin: 0 }}>Required</span>
                </div>
              </div>
            </div>

            {/* Configurable Standard Fields */}
            {Object.entries(formConfig)
              .filter(
                ([fieldKey]) =>
                  ![
                    'sportsProfile',
                    'fieldOrder',
                    'feeMode',
                    'name',
                    'eligibilityMatrix',
                    'ageCategorySection',
                    'sportsSection',
                    'disciplineSection',
                  ].includes(fieldKey)
              )
              .map(([fieldKey, config]) => {
              const defaultLabel = FIELD_ORDER_LABELS[fieldKey] || fieldKey;

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
                    <label htmlFor={`std-label-${fieldKey}`} style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '0.35rem' }}>
                      Field label
                    </label>
                    <input
                      id={`std-label-${fieldKey}`}
                      type="text"
                      value={config.label ?? ''}
                      placeholder={defaultLabel}
                      onChange={(e) => handleFormConfigChange(fieldKey, 'label', e.target.value)}
                      style={{ width: '100%', fontWeight: 600, color: config.enabled ? 'white' : '#94a3b8' }}
                    />
                    <label
                      htmlFor={`std-desc-${fieldKey}`}
                      style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', margin: '0.55rem 0 0.35rem' }}
                    >
                      Description (shown on form)
                    </label>
                    <textarea
                      id={`std-desc-${fieldKey}`}
                      value={config.description ?? ''}
                      placeholder={
                        fieldKey === 'cricketProfile'
                          ? sportsProfileCardHint
                          : descMap[fieldKey] || 'Optional help text under this field'
                      }
                      onChange={(e) => handleFormConfigChange(fieldKey, 'description', e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        fontSize: '0.8rem',
                        color: config.enabled ? '#cbd5e1' : '#64748b',
                        resize: 'vertical',
                      }}
                    />
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
              Drag the handle to reorder, or use the arrows. This is the exact order players will see on the registration page. Only enabled fields are listed.
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
                draggable
                onDragStart={(e) => {
                  setDragIndex(idx);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIndex !== idx) setDragOverIndex(idx);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== idx) {
                    handleFieldReorder(registerFieldOrder, dragIndex, idx);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                style={{
                  padding: '0.65rem 1rem',
                  border: dragOverIndex === idx && dragIndex !== null && dragIndex !== idx
                    ? '1px solid var(--primary)'
                    : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: 'rgba(255,255,255,0.015)',
                  opacity: dragIndex === idx ? 0.5 : 1,
                  transition: 'border-color 0.15s ease, opacity 0.15s ease',
                }}
              >
                <span style={{ fontWeight: 500, color: '#e2e8f0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <GripVertical size={16} style={{ color: '#64748b', cursor: 'grab', flexShrink: 0 }} aria-hidden />
                  <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '1.25rem' }}>{idx + 1}.</span>
                  {fieldOrderLabel(key, customFields, formConfig)}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    aria-label={`Move ${fieldOrderLabel(key, customFields, formConfig)} up`}
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
                    aria-label={`Move ${fieldOrderLabel(key, customFields, formConfig)} down`}
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

                {field.type !== 'select' && field.type !== 'category' && (
                  <div style={{ flex: 1, minWidth: '160px' }} className={styles.formGroup}>
                    <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Validation</label>
                    <select
                      value={field.validation || 'auto'}
                      onChange={(e) => handleCustomFieldChange(field.id, 'validation', e.target.value)}
                      style={{
                        padding: '0.5rem',
                        fontSize: '0.9rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'white',
                        height: '40px',
                      }}
                    >
                      {CUSTOM_FIELD_VALIDATIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
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

        {/* ================= TEAM INFO FORM BUILDER ================= */}
        {isTeamLikeTournamentType(formData.type) && (
          <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>Team Info Field Builder</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  Extra questions about the team itself (e.g. City, Kit Color) — asked once per team, not per player.
                  Shown on the team invite start form and answered by the representative.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddTeamCustomField}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
              >
                <Plus size={16} /> Add Field
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {teamCustomFields.map((field) => (
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
                  <div style={{ flex: 2, minWidth: '200px' }} className={styles.formGroup}>
                    <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Field Label/Question</label>
                    <input
                      type="text"
                      placeholder="e.g. Team City or Kit Color"
                      value={field.label}
                      required
                      onChange={e => handleTeamCustomFieldChange(field.id, 'label', e.target.value)}
                      style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: '130px' }} className={styles.formGroup}>
                    <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Input Type</label>
                    <select
                      value={field.type}
                      onChange={e => handleTeamCustomFieldChange(field.id, 'type', e.target.value as any)}
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
                      <option value="category">Age Category</option>
                    </select>
                  </div>

                  {field.type === 'select' && (
                    <div style={{ flex: 2, minWidth: '200px' }} className={styles.formGroup}>
                      <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>Dropdown Options (Comma Separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. S, M, L, XL"
                        value={field.options}
                        required
                        onChange={e => handleTeamCustomFieldChange(field.id, 'options', e.target.value)}
                        style={{ padding: '0.5rem', fontSize: '0.9rem' }}
                      />
                    </div>
                  )}

                  {field.type === 'category' && (
                    <div style={{ flex: 2, minWidth: '200px', alignSelf: 'center' }}>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                        {ageCategories.length > 0
                          ? `Options auto-filled from this tournament's Age Categories: ${ageCategories.map((c) => c.name).join(', ')}.`
                          : (
                            <>
                              No Age Categories defined yet — this field has nothing to list.{' '}
                              <a href="#age-categories-editor" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                Add Age Categories (with birth-date rules) ↑
                              </a>
                            </>
                          )}
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.2rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      id={`team_req_${field.id}`}
                      checked={field.required}
                      onChange={e => handleTeamCustomFieldChange(field.id, 'required', e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <label htmlFor={`team_req_${field.id}`} style={{ fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                      Required
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveTeamCustomField(field.id)}
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

              {teamCustomFields.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', background: 'rgba(0,0,0,0.1)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                  No team-level questions configured. Only the standard team name / representative / contact will be asked.
                </div>
              )}
            </div>
          </div>
        )}

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
