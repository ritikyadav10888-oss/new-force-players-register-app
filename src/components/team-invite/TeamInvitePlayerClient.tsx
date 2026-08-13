'use client';

import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Phone,
  ScrollText,
  Users,
} from 'lucide-react';
import styles from '@/app/register/[slug]/register.module.css';
import { OrderedPlayerFields } from '@/app/register/[slug]/OrderedPlayerFields';
import { RegisterStepProgress } from '@/app/register/[slug]/RegisterStepProgress';
import {
  resolveSportsProfileForTournament,
  visibleFieldOrder,
} from '@/lib/form-config';
import { parseCustomFields } from '@/lib/custom-fields';
import {
  emptySportProfiles,
  profileKindsForRegistration,
  type SportProfilesMap,
} from '@/lib/sport-profiles';
import {
  withLegacySportRoleToggle,
  withSportProfileFieldChange,
  withSportProfileRoleToggle,
} from '@/components/team-invite/sport-role-state';
import { entryTypeLabel, parseSportsConfig, resolveSelectedSports } from '@/lib/multi-sport';
import {
  formatAgeCategoryRange,
  parseAgeCategories,
  validatePlayerDobAgainstCategory,
} from '@/lib/age-categories';

const PLAYER_STEPS = ['Details', 'Player'];

function emptyPlayer() {
  return {
    photo: '',
    name: '',
    email: '',
    phone: '',
    emergencyContact: '',
    dob: '',
    age: '',
    gender: '',
    aadhar: '',
    jerseyName: '',
    jerseyNumber: '',
    jerseySize: '',
    role: '',
    battingHand: '',
    bowlingType: '',
    allRounderType: '',
    sportProfiles: emptySportProfiles() as SportProfilesMap,
    customValues: {} as Record<string, string>,
  };
}

const formatPhoneNumber = (value: string) => {
  let cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  return cleaned.replace(/\D/g, '').slice(0, 10);
};

type Props = { slug: string; token: string };

export default function TeamInvitePlayerClient({ slug, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [links, setLinks] = useState<{ player: string; pay: string; live: string } | null>(null);
  const [player, setPlayer] = useState(emptyPlayer());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [photoLabel, setPhotoLabel] = useState('No file chosen');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team link');
      setInvite(data.invite);
      setTournament(data.tournament);
      setLinks(data.links);
      setSeatsLeft(Math.max(0, data.invite.maxPlayers - data.invite.playerCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const formConfigRaw = tournament?.form_config;
  const customFieldsRaw = tournament?.custom_fields;
  const sportsConfigRaw = tournament?.sports_config;

  const customFields = useMemo(() => parseCustomFields(customFieldsRaw), [customFieldsRaw]);

  const config = useMemo(() => {
    const fc = formConfigRaw || {};
    return {
      ...(typeof fc === 'object' && fc ? fc : {}),
      cricketProfile: resolveSportsProfileForTournament(fc, tournament?.sport),
    };
  }, [formConfigRaw, tournament?.sport]);

  const sportsConfig = useMemo(
    () => parseSportsConfig(sportsConfigRaw),
    [sportsConfigRaw]
  );

  const selectedSports = useMemo(() => {
    const ids = Array.isArray(invite?.selectedSports) ? invite.selectedSports : [];
    return resolveSelectedSports(sportsConfig, ids);
  }, [invite?.selectedSports, sportsConfig]);

  const multiSport = selectedSports.length > 1;
  const profileKinds = profileKindsForRegistration({
    multiSport,
    selected: selectedSports,
    tournamentSport: tournament?.sport,
  });

  const orderedFieldKeys = useMemo(() => {
    const sportsProfileShown = Boolean(config.cricketProfile?.enabled || config.cricketProfile?.required);
    return visibleFieldOrder(config, customFields, sportsProfileShown);
  }, [config, customFields]);

  const theme = tournament?.theme || '#0d472c';
  const paid = String(invite?.paymentStatus || '').toLowerCase() === 'paid';
  const full = seatsLeft !== null && seatsLeft <= 0;
  const banner = tournament?.banner_url || tournament?.banner || '';
  const venue = tournament?.venue || '';
  const description = String(tournament?.description || '').trim();
  const rules = String(tournament?.rules || '').trim();
  const terms = String(tournament?.terms || '').trim();
  const deadlineLabel = tournament?.registrationDeadline
    ? new Date(tournament.registrationDeadline).toLocaleDateString()
    : tournament?.registration_deadline
      ? new Date(tournament.registration_deadline).toLocaleDateString()
      : '';

  const progressIndex = done ? PLAYER_STEPS.length + 1 : step;

  const ageCategories = useMemo(
    () => parseAgeCategories(tournament?.age_categories || tournament?.ageCategories),
    [tournament?.age_categories, tournament?.ageCategories]
  );
  const enrolledCategory = useMemo(() => {
    const id = invite?.selectedAgeCategoryId;
    if (!id) return null;
    return ageCategories.find((c) => c.id === id) || null;
  }, [ageCategories, invite?.selectedAgeCategoryId]);

  const enrolledSportLabels = useMemo(() => {
    if (!selectedSports.length) return [];
    return selectedSports.map((s) => {
      const type = entryTypeLabel(s.entryType);
      return `${s.name} (${type})`;
    });
  }, [selectedSports]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB.');
      e.target.value = '';
      setPhotoLabel('No file chosen');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        const maxSide = 1024;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.82);
        setPlayer((p) => ({ ...p, photo: base64 }));
        setPhotoLabel(file.name);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (key: string, value: string) => {
    setPlayer((p) => ({ ...p, [key]: value }));
  };

  const handleCustomChange = (label: string, value: string) => {
    setPlayer((p) => ({
      ...p,
      customValues: { ...p.customValues, [label]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player.name.trim()) {
      toast.error('Enter your full name');
      return;
    }
    const catCheck = validatePlayerDobAgainstCategory(
      player.dob,
      ageCategories,
      invite?.selectedAgeCategoryId
    );
    if (!catCheck.ok) {
      toast.error(catCheck.error);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.duplicate) {
          toast.error(data.error || 'You are already registered');
        } else {
          throw new Error(data.error || 'Failed to register');
        }
        return;
      }
      setDone(true);
      setSeatsLeft(data.seatsLeft ?? null);
      toast.success('You are on the team roster!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className={styles.registerContainer}
        style={{ ['--theme-color' as string]: theme }}
      >
        <div className="container py-24 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin opacity-60" />
          <p className="text-sm opacity-70">Loading team registration…</p>
        </div>
      </div>
    );
  }

  if (error || !invite || !tournament) {
    return (
      <div className={styles.registerContainer}>
        <div className="container py-16 text-center">
          <p className="text-red-600 font-medium">{error || 'Team link not found'}</p>
          <Link href="/" className="inline-block mt-4 text-sm underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.registerContainer}
      style={{ ['--theme-color' as string]: theme }}
    >
      <div
        className={styles.bannerArea}
        style={{
          ['--banner-image' as string]: banner ? `url(${banner})` : 'none',
        }}
      >
        <div className={styles.overlay} />
        <div className={`container ${styles.bannerContent}`}>
          <h1 className={styles.title}>{tournament.name}</h1>
          <div className={styles.metaRow}>
            {deadlineLabel ? (
              <span className={styles.meta}>
                <Calendar size={18} aria-hidden /> Reg Closes: {deadlineLabel}
              </span>
            ) : null}
            {venue ? (
              <span className={styles.meta}>
                <MapPin size={18} aria-hidden /> {venue}
              </span>
            ) : null}
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> Team: {invite.teamName}
            </span>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {invite.playerCount}/{invite.maxPlayers} Players
            </span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
        {paid && !done && !full ? (
          <RegisterStepProgress steps={PLAYER_STEPS} currentIndex={progressIndex} />
        ) : null}

        {!paid ? (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <h2 className={styles.cardTitle}>Waiting for team payment</h2>
            <p className={styles.overviewLead}>
              {invite.representative} must fill their own details and pay for{' '}
              <strong>{invite.teamName}</strong> first. After payment, this player register link will
              open.
            </p>
            <div className={styles.infoSection}>
              <h3 className={styles.infoSectionTitle}>Team enrolled</h3>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Team:</strong> {invite.teamName}
              </p>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Representative:</strong> {invite.representative}
              </p>
            </div>
            {links ? (
              <div className={styles.formActions}>
                <Link href={links.pay} className="btn-primary">
                  Representative — pay for team
                </Link>
                <Link href={links.live} className="btn-secondary">
                  View live roster
                </Link>
              </div>
            ) : null}
          </div>
        ) : done ? (
          <div className={`glass-panel animate-scale-up ${styles.card}`}>
            <div className={styles.successCard} style={{ boxShadow: 'none', border: 'none' }}>
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
              <p className="font-semibold text-center text-lg">You&apos;re on the team!</p>
              <p className="text-sm opacity-70 text-center mt-2">
                Enrolled with <strong>{invite.teamName}</strong>. Check the live roster anytime.
              </p>
            </div>
            <div className={styles.infoSection}>
              <h3 className={styles.infoSectionTitle}>Team details</h3>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Team:</strong> {invite.teamName}
              </p>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Tournament:</strong> {tournament.name}
              </p>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Representative:</strong> {invite.representative}
              </p>
            </div>
            {links ? (
              <div className={styles.formActions}>
                <Link href={links.live} className="btn-primary">
                  Live roster <ExternalLink className="w-4 h-4 ml-1 inline" />
                </Link>
              </div>
            ) : null}
          </div>
        ) : full ? (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <h2 className={styles.cardTitle}>Team roster is full</h2>
            <p className={styles.overviewLead}>
              <strong>{invite.teamName}</strong> has reached the maximum of {invite.maxPlayers}{' '}
              players. New registrations are closed for this team.
            </p>
            {links ? (
              <div className={styles.formActions}>
                <Link href={links.live} className="btn-primary">
                  View live roster
                </Link>
              </div>
            ) : null}
          </div>
        ) : step === 1 ? (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <div className={styles.overviewIntro}>
              <h2 className={styles.cardTitle}>Tournament Overview</h2>
              <p className={styles.overviewLead}>
                Review your team, tournament details, and terms. Then continue to enter your player
                details for <strong>{invite.teamName}</strong>.
              </p>
            </div>

            <div className={styles.closedMeta} style={{ marginBottom: '1rem' }}>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Enrolled team</p>
                <p className={styles.closedMetaValue}>{invite.teamName}</p>
              </div>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Representative</p>
                <p className={styles.closedMetaValue}>{invite.representative}</p>
              </div>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Roster</p>
                <p className={styles.closedMetaValue}>
                  {invite.playerCount}/{invite.maxPlayers}
                  {seatsLeft !== null
                    ? ` · ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`
                    : ''}
                </p>
              </div>
              {enrolledCategory ? (
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Age category</p>
                  <p className={styles.closedMetaValue}>
                    {enrolledCategory.name}
                    {formatAgeCategoryRange(enrolledCategory)
                      ? ` · ${formatAgeCategoryRange(enrolledCategory)}`
                      : ''}
                  </p>
                </div>
              ) : null}
            </div>

            {enrolledSportLabels.length > 0 ? (
              <div className={styles.infoSection}>
                <div className={styles.infoSectionHeader}>
                  <Users size={18} className={styles.infoSectionIcon} aria-hidden />
                  <h3 className={styles.infoSectionTitle}>Events enrolled</h3>
                </div>
                <p className={styles.infoSectionBody}>{enrolledSportLabels.join(' · ')}</p>
              </div>
            ) : null}

            <div className={styles.infoSection}>
              <div className={styles.infoSectionHeader}>
                <FileText size={18} className={styles.infoSectionIcon} aria-hidden />
                <h3 className={styles.infoSectionTitle}>Description</h3>
              </div>
              <p className={styles.infoSectionBody}>
                {description || (
                  <span className={styles.infoSectionEmpty}>
                    No description provided for this tournament.
                  </span>
                )}
              </p>
            </div>

            <div className={styles.infoSection}>
              <div className={styles.infoSectionHeader}>
                <ClipboardList size={18} className={styles.infoSectionIcon} aria-hidden />
                <h3 className={styles.infoSectionTitle}>Game Rules</h3>
              </div>
              <p className={styles.infoSectionBody}>
                {rules || (
                  <span className={styles.infoSectionEmpty}>No game rules provided.</span>
                )}
              </p>
            </div>

            {venue ? (
              <p className={styles.venueFooter}>
                <MapPin size={16} className={styles.venueFooterIcon} aria-hidden />
                <span>
                  <strong className={styles.infoStrong}>Venue:</strong> {venue}
                </span>
              </p>
            ) : null}

            {(tournament.organizerName || tournament.organizerPhone) && (
              <div className={styles.infoSection}>
                <div className={styles.infoSectionHeader}>
                  <Phone size={18} className={styles.infoSectionIcon} aria-hidden />
                  <h3 className={styles.infoSectionTitle}>Organizer Contact</h3>
                </div>
                {tournament.organizerName ? (
                  <p className={styles.infoSectionBody}>
                    <strong>{tournament.organizerName}</strong>
                  </p>
                ) : null}
                {tournament.organizerPhone ? (
                  <a href={`tel:${tournament.organizerPhone}`} className={styles.orgContactRow}>
                    <Phone size={15} aria-hidden /> {tournament.organizerPhone}
                  </a>
                ) : null}
              </div>
            )}

            <div id="terms-section" className={styles.infoSection}>
              <div className={styles.infoSectionHeader}>
                <ScrollText size={18} className={styles.infoSectionIcon} aria-hidden />
                <h3 className={styles.infoSectionTitle}>Terms &amp; Conditions</h3>
              </div>
              <div className={styles.termsBox}>
                <p className={styles.infoSectionBody}>
                  {terms || (
                    <span className={styles.infoSectionEmpty}>No terms & conditions provided.</span>
                  )}
                </p>
              </div>
            </div>

            <div className={styles.termsRow}>
              <input
                type="checkbox"
                id="acceptPlayerTerms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="acceptPlayerTerms" className={styles.termsLabel}>
                I have read and agree to the{' '}
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document
                      .getElementById('terms-section')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className={styles.termsLink}
                  role="button"
                  tabIndex={0}
                >
                  Terms & Conditions
                </span>
              </label>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (!termsAccepted) {
                    toast.error('Accept Terms & Conditions to continue');
                    return;
                  }
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Continue to player details · {invite.teamName}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`glass-panel animate-fade-in delay-100 ${styles.card}`}
          >
            <div className={styles.overviewIntro} style={{ marginBottom: '1.25rem' }}>
              <h2 className={styles.cardTitle} style={{ marginBottom: '0.45rem' }}>
                Add Player Details
              </h2>
              <p className={styles.overviewLead} style={{ marginBottom: 0 }}>
                Fill only your own details for <strong>{invite.teamName}</strong>. No payment on this
                step.
              </p>
            </div>

            <div className={styles.infoSection} style={{ marginBottom: '0.35rem' }}>
              <h3 className={styles.infoSectionTitle}>Team name &amp; details</h3>
            </div>
            <div className={styles.closedMeta} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Team name</p>
                <p className={styles.closedMetaValue}>{invite.teamName}</p>
              </div>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Tournament</p>
                <p className={styles.closedMetaValue}>{tournament.name}</p>
              </div>
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Representative</p>
                <p className={styles.closedMetaValue}>{invite.representative}</p>
              </div>
              {invite.contact ? (
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Contact</p>
                  <p className={styles.closedMetaValue}>{invite.contact}</p>
                </div>
              ) : null}
              {enrolledCategory ? (
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Age category</p>
                  <p className={styles.closedMetaValue}>
                    {enrolledCategory.name}
                    {formatAgeCategoryRange(enrolledCategory)
                      ? ` · ${formatAgeCategoryRange(enrolledCategory)}`
                      : ''}
                  </p>
                </div>
              ) : null}
              {venue ? (
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Venue</p>
                  <p className={styles.closedMetaValue}>{venue}</p>
                </div>
              ) : null}
              <div className={styles.closedMetaItem}>
                <p className={styles.closedMetaLabel}>Roster</p>
                <p className={styles.closedMetaValue} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {invite.playerCount}/{invite.maxPlayers}
                  {seatsLeft !== null
                    ? ` · ${seatsLeft} left`
                    : ''}
                </p>
              </div>
              {enrolledSportLabels.length > 0 ? (
                <div className={styles.closedMetaItem} style={{ gridColumn: '1 / -1' }}>
                  <p className={styles.closedMetaLabel}>Events</p>
                  <p className={styles.closedMetaValue}>{enrolledSportLabels.join(' · ')}</p>
                </div>
              ) : null}
            </div>

            <div className={styles.playersList}>
              <div className={`glass-panel ${styles.playerCard}`}>
                <div className={styles.playerHeader}>
                  <div className={styles.playerAvatar}>
                    <Users size={20} aria-hidden />
                  </div>
                  <div className={styles.playerHeaderCopy}>
                    <h3>Your profile</h3>
                    <p className={styles.playerHeaderHint}>
                      Details appear on <strong>{invite.teamName}</strong>&apos;s live roster.
                    </p>
                  </div>
                </div>
                <OrderedPlayerFields
                  fieldKeys={orderedFieldKeys}
                  player={player}
                  config={config}
                  tournament={{
                    sport: tournament?.sport,
                    customFields,
                    ageCategories,
                  }}
                  selectedAgeCategoryId={invite.selectedAgeCategoryId || ''}
                  variant="individual"
                  formatPhoneNumber={formatPhoneNumber}
                  profileKinds={profileKinds}
                  preferSelectedSportProfiles={multiSport}
                  onChange={handleChange}
                  onCustomChange={handleCustomChange}
                  onSportRoleToggle={(role) =>
                    setPlayer((p) => withLegacySportRoleToggle(p, tournament?.sport, role))
                  }
                  onSportProfileRoleToggle={(kind, role) =>
                    setPlayer((p) => withSportProfileRoleToggle(p, profileKinds, kind, role))
                  }
                  onSportProfileFieldChange={(kind, field, value) =>
                    setPlayer((p) => withSportProfileFieldChange(p, profileKinds, kind, field, value))
                  }
                  onPhotoUpload={handlePhotoUpload}
                  photoFileLabel={photoLabel}
                  photoInputRef={photoInputRef}
                  onPhotoChooseClick={() => photoInputRef.current?.click()}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Back
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Submitting…' : `Join ${invite.teamName}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
