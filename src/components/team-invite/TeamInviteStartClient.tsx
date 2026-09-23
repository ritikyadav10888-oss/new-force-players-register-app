'use client';

import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Phone,
  ScrollText,
  Users,
} from 'lucide-react';
import styles from '@/app/register/[slug]/register.module.css';
import flowStyles from './teamInviteFlow.module.css';
import { OrderedPlayerFields } from '@/app/register/[slug]/OrderedPlayerFields';
import { RegisterStepProgress } from '@/app/register/[slug]/RegisterStepProgress';
import { RegistrationSponsors } from '@/components/tournament/RegistrationSponsors';
import {
  resolveSportsProfileForTournament,
  visibleFieldOrder,
} from '@/lib/form-config';
import {
  parseCustomFields,
  resolveCustomFieldValidation,
  sanitizeCustomFieldInput,
  validateCustomFieldAnswers,
} from '@/lib/custom-fields';
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
import {
  buildWhatsAppShareUrl,
  teamInviteWhatsAppMessage,
  toWhatsAppE164,
} from '@/lib/whatsapp-share';
import {
  isMultiSportMode,
  parseSportsConfig,
} from '@/lib/multi-sport';
import {
  filterSportsByDisciplines,
  groupSportsForDisplay,
  listSportDisciplines,
} from '@/lib/sport-presets';
import { sponsorHasDisplay, type SponsorEntry } from '@/lib/sponsors';
import {
  parseStepFees,
  resolveTournamentFeeMode,
  resolveTournamentPayable,
  stepFeeAt,
} from '@/lib/fee-mode';
import {
  findAgeCategoryForDob,
  formatAgeCategoryRange,
  parseAgeCategories,
  validatePlayerDobAgainstCategory,
} from '@/lib/age-categories';
import {
  ELIGIBILITY_GENDERS,
  filterSportsByEligibility,
  isEligibilityMatrixActive,
  parseEligibilityMatrix,
  parseFormSectionCopy,
} from '@/lib/eligibility-matrix';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (resp: unknown) => void) => void;
    };
  }
}

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

const STEPS = ['Details', 'Team Info', 'Player', 'Payment'];

type Props = {
  slug: string;
  tournament: {
    name: string;
    theme?: string;
    sport?: string;
    minPlayers: number;
    maxPlayers: number;
    fee?: number;
    venue?: string;
    banner?: string;
    description?: string;
    rules?: string;
    terms?: string;
    registrationDeadline?: string;
    organizerName?: string;
    organizerPhone?: string;
    sponsors?: SponsorEntry[];
    form_config?: Record<string, unknown>;
    formConfig?: Record<string, unknown>;
    custom_fields?: unknown;
    customFields?: unknown;
    sports_config?: unknown;
    sportsConfig?: unknown;
    ageCategories?: unknown;
    teamCustomFields?: unknown;
  };
};

type Links = { player: string; pay: string; live: string };

export default function TeamInviteStartClient({ slug, tournament }: Props) {
  const [step, setStep] = useState(1);
  const [teamName, setTeamName] = useState('');
  const [teamLogo, setTeamLogo] = useState('');
  const [representative, setRepresentative] = useState('');
  const [contact, setContact] = useState('');
  const [player, setPlayer] = useState(emptyPlayer());
  const [photoLabel, setPhotoLabel] = useState('No file chosen');
  const [paying, setPaying] = useState(false);
  const [token, setToken] = useState('');
  const [links, setLinks] = useState<Links | null>(null);
  const [copied, setCopied] = useState('');
  const [done, setDone] = useState(false);
  const [selectedAgeCategoryId, setSelectedAgeCategoryId] = useState('');
  const [enrollmentGender, setEnrollmentGender] = useState('');
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [teamFieldValues, setTeamFieldValues] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lockRef = useRef(false);
  const whatsappAutoSentRef = useRef(false);

  const formConfigRaw = tournament.formConfig || tournament.form_config || {};
  const customFieldsRaw = tournament.customFields ?? tournament.custom_fields;
  const sportsConfigRaw = tournament.sportsConfig ?? tournament.sports_config;

  const customFields = useMemo(() => parseCustomFields(customFieldsRaw), [customFieldsRaw]);
  const teamCustomFields = useMemo(
    () => parseCustomFields(tournament.teamCustomFields),
    [tournament.teamCustomFields]
  );

  const config = useMemo(() => {
    const fc = formConfigRaw && typeof formConfigRaw === 'object' ? formConfigRaw : {};
    return {
      ...fc,
      cricketProfile: resolveSportsProfileForTournament(fc, tournament.sport),
    };
  }, [formConfigRaw, tournament.sport]);

  const sportsConfig = useMemo(() => parseSportsConfig(sportsConfigRaw), [sportsConfigRaw]);
  const ageCategories = useMemo(
    () => parseAgeCategories(tournament.ageCategories),
    [tournament.ageCategories]
  );
  const categoryField = useMemo(
    () => teamCustomFields.find((f) => f.type === 'category') || null,
    [teamCustomFields]
  );
  // When the admin has added an "Age Category" Team Info field, that field
  // (answered in the Team Info step) is the single source of truth for
  // category — the standalone Details-step picker is hidden to avoid asking twice.
  const effectiveSelectedAgeCategoryId = categoryField
    ? teamFieldValues[categoryField.label] || ''
    : selectedAgeCategoryId;
  const requireAgeCategoryPick = ageCategories.length > 0 && !categoryField;
  const formCfgObj =
    formConfigRaw && typeof formConfigRaw === 'object'
      ? (formConfigRaw as Record<string, unknown>)
      : {};
  const eligibilityMatrix = parseEligibilityMatrix(formCfgObj.eligibilityMatrix);
  const matrixActive = isEligibilityMatrixActive(eligibilityMatrix);
  const requireEnrollmentGender = matrixActive && isMultiSportMode(sportsConfig);
  const sportsSectionCopy = parseFormSectionCopy(formCfgObj.sportsSection);
  const disciplineSectionCopy = parseFormSectionCopy(formCfgObj.disciplineSection);
  const disciplineOptions = listSportDisciplines(sportsConfig);
  const requireDisciplinePick = isMultiSportMode(sportsConfig) && disciplineOptions.length > 1;
  const afterEligibility = filterSportsByEligibility(
    sportsConfig,
    eligibilityMatrix,
    effectiveSelectedAgeCategoryId,
    enrollmentGender
  );
  const eligibleSportsConfig = requireDisciplinePick
    ? filterSportsByDisciplines(afterEligibility, selectedDisciplines)
    : afterEligibility;
  const multiSport = isMultiSportMode(sportsConfig);
  const feeMode = resolveTournamentFeeMode({
    formConfig: formConfigRaw,
    sportsConfig,
    ageCategories,
  });
  const stepFees = parseStepFees(formConfigRaw);
  const payable = resolveTournamentPayable({
    feeMode,
    legacyFee: Number(tournament.fee) || 0,
    sportsConfig: eligibleSportsConfig,
    selectedSportIds: multiSport
      ? selectedSportIds
      : eligibleSportsConfig.map((s) => s.id),
    ageCategories,
    selectedAgeCategoryId: effectiveSelectedAgeCategoryId,
    formConfig: formConfigRaw,
  });
  const feeAmount = payable.fee;

  const profileKinds = profileKindsForRegistration({
    multiSport,
    selected: payable.selected.length ? payable.selected : sportsConfig,
    tournamentSport: tournament.sport,
  });

  const orderedFieldKeys = useMemo(() => {
    const sportsProfileShown = Boolean(
      config.cricketProfile?.enabled || config.cricketProfile?.required
    );
    return visibleFieldOrder(config, customFields, sportsProfileShown);
  }, [config, customFields]);

  const theme = tournament.theme || '#0d472c';
  const rosterLabel =
    tournament.minPlayers === tournament.maxPlayers
      ? `${tournament.maxPlayers} Players/Team`
      : `${tournament.minPlayers}–${tournament.maxPlayers} Players/Team`;
  const deadlineLabel = tournament.registrationDeadline
    ? new Date(tournament.registrationDeadline).toLocaleDateString()
    : null;
  const description = String(tournament.description || '').trim();
  const rules = String(tournament.rules || '').trim();
  const terms = String(tournament.terms || '').trim();
  const visibleSponsors = (tournament.sponsors ?? []).filter(sponsorHasDisplay);
  const hasSponsors = visibleSponsors.length > 0;

  const eligibilityDriverRef = useRef<string | null>(null);
  const genderFieldOn = Boolean(
    (config as { gender?: { enabled?: boolean } }).gender?.enabled
  );

  useEffect(() => {
    if (categoryField) return;
    const cat = findAgeCategoryForDob(player.dob, ageCategories);
    const nextId = cat?.id || '';
    const gender =
      player.gender === 'Male' || player.gender === 'Female' ? player.gender : '';
    const key = `${nextId}|${gender}`;
    const prevKey = eligibilityDriverRef.current;
    if (prevKey && prevKey !== '|' && prevKey !== key) {
      setSelectedSportIds([]);
    }
    eligibilityDriverRef.current = key;
    setSelectedAgeCategoryId((prev) => (prev === nextId ? prev : nextId));
    setEnrollmentGender((prev) => (prev === gender ? prev : gender));
  }, [categoryField, player.dob, player.gender, ageCategories]);

  const progressIndex = done ? STEPS.length + 1 : step;

  const publicUrl = (path: string) =>
    typeof window === 'undefined' ? path : `${window.location.origin}${path}`;

  const copyUrl = async (path: string, key: string) => {
    const url = publicUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
      toast.success('Link copied');
    } catch {
      window.prompt('Copy link:', url);
    }
  };

  const shareLinksOnWhatsApp = (opts?: { silent?: boolean }) => {
    if (!links) return false;
    const phone = toWhatsAppE164(contact);
    if (!phone) {
      if (!opts?.silent) {
        toast.error('Add a valid representative WhatsApp number to share.');
      }
      return false;
    }
    const text = teamInviteWhatsAppMessage({
      teamName: teamName || 'your team',
      tournamentName: tournament.name,
      playerUrl: publicUrl(links.player),
      liveUrl: publicUrl(links.live),
      maxPlayers: tournament.maxPlayers,
    });
    const url = buildWhatsAppShareUrl({ phone: contact, text });
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!opts?.silent) toast.success('Opening WhatsApp…');
    return true;
  };

  useEffect(() => {
    if (!done || !links || whatsappAutoSentRef.current) return;
    // Server Cloud API already sent — don't also open wa.me.
    // Only fall back to opening WhatsApp chat if auto-send didn't mark as sent.
    whatsappAutoSentRef.current = true;
    const timer = window.setTimeout(() => {
      const opened = shareLinksOnWhatsApp({ silent: true });
      if (opened) {
        toast.message('WhatsApp opened — tap Send if the message is not delivered yet.');
      }
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once after payment success
  }, [done, links]);

  const loadRazorpay = () =>
    new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load payment gateway'));
      document.body.appendChild(script);
    });

  const ensureInvite = async () => {
    if (token && links) return { token, links };
    const res = await fetch('/api/team-invites/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        teamName: teamName.trim(),
        teamLogoUrl: teamLogo || null,
        representative: representative.trim(),
        contact: contact.trim(),
        player,
        selectedSports: multiSport
          ? selectedSportIds
          : sportsConfig.map((s) => s.id),
        selectedAgeCategoryId: effectiveSelectedAgeCategoryId || null,
        enrollmentGender: enrollmentGender || null,
        feeBreakdown: payable.breakdown,
        teamCustomValues: teamFieldValues,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create team');
    setToken(data.token);
    setLinks(data.links);
    return { token: data.token as string, links: data.links as Links };
  };

  const completePayment = async (
    inviteToken: string,
    body: Record<string, unknown>,
    nextLinks: Links
  ) => {
    const res = await fetch(`/api/team-invites/${encodeURIComponent(inviteToken)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment confirmation failed');
    setLinks(nextLinks);
    setDone(true);

    const wa = data?.whatsapp as
      | { sent?: boolean; skipped?: boolean; error?: string | null }
      | undefined;
    if (wa?.sent) {
      whatsappAutoSentRef.current = true;
      toast.success('Payment done! WhatsApp sent to the representative.');
    } else if (wa?.skipped) {
      toast.success('Payment done! Configure WhatsApp API to auto-message, or share manually.');
    } else if (wa?.error) {
      toast.success('Payment done!');
      toast.message(`WhatsApp auto-send failed: ${wa.error}`);
    } else {
      toast.success('Payment done! Opening WhatsApp for the representative…');
    }
  };

  const handlePay = async () => {
    if (lockRef.current || paying) return;
    setPaying(true);
    try {
      const created = await ensureInvite();
      const inviteToken = created.token;
      const nextLinks = created.links;

      const orderRes = await fetch(`/api/team-invites/${encodeURIComponent(inviteToken)}/pay`, {
        method: 'POST',
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Could not start payment');

      if (orderData.free) {
        await completePayment(inviteToken, {}, nextLinks);
        setPaying(false);
        return;
      }

      if (orderData.mock) {
        toast.message('Mock payment mode');
        await completePayment(
          inviteToken,
          {
            razorpayOrderId: orderData.id,
            razorpayPaymentId: `pay_MOCK_${Date.now()}`,
            razorpaySignature: 'dev_mock_signature',
            devMockPayment: true,
          },
          nextLinks
        );
        setPaying(false);
        return;
      }

      await loadRazorpay();
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId || !window.Razorpay) throw new Error('Payment gateway not configured');

      lockRef.current = true;
      const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
      const rzp = new window.Razorpay({
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Force Pulse',
        description: `${teamName} — team registration`,
        image: '/logo.png',
        order_id: orderData.id,
        prefill: { name: representative, contact },
        // On mobile: show UPI intent (opens GPay / PhonePe / Paytm directly)
        ...(isMobile && {
          config: {
            display: {
              blocks: {
                upi_block: {
                  name: 'Pay via UPI',
                  instruments: [{ method: 'upi', flows: ['intent', 'collect', 'qr'] }],
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }],
                },
              },
              sequence: ['block.upi_block', 'block.other'],
              preferences: { show_default_blocks: false },
            },
          },
        }),
        handler: async (response: Record<string, unknown>) => {
          try {
            await completePayment(
              inviteToken,
              {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              nextLinks
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Confirmation failed');
          } finally {
            lockRef.current = false;
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            lockRef.current = false;
            setPaying(false);
          },
        },
      });
      rzp.on('payment.failed', (resp: any) => {
        lockRef.current = false;
        setPaying(false);
        toast.error(resp?.error?.description || 'Payment failed');
      });
      rzp.open();
    } catch (err) {
      lockRef.current = false;
      toast.error(err instanceof Error ? err.message : 'Payment failed');
      setPaying(false);
    }
  };

  return (
    <div
      className={styles.registerContainer}
      style={{ ['--theme-color' as string]: theme }}
    >
      <div
        className={styles.bannerArea}
        style={{
          ['--banner-image' as string]: tournament.banner ? `url(${tournament.banner})` : 'none',
        }}
      >
        {hasSponsors ? (
          <div className={styles.sponsorRibbon} role="region" aria-label="Tournament sponsors">
            <div className={styles.sponsorRibbonInner}>
              <span className={styles.sponsorLabel}>Presented by</span>
              <RegistrationSponsors sponsors={visibleSponsors} variant="ribbon" />
            </div>
          </div>
        ) : null}
        <div className={styles.overlay} />
        <div
          className={`container ${styles.bannerContent}${hasSponsors ? ` ${styles.bannerContentLift}` : ''}`}
        >
          <h1 className={styles.title}>{tournament.name}</h1>
          <div className={styles.metaRow}>
            {deadlineLabel ? (
              <span className={styles.meta}>
                <Calendar size={18} aria-hidden /> Reg Closes: {deadlineLabel}
              </span>
            ) : null}
            {tournament.venue ? (
              <span className={styles.meta}>
                <MapPin size={18} aria-hidden /> {tournament.venue}
              </span>
            ) : null}
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {rosterLabel}
            </span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
          <RegisterStepProgress steps={STEPS} currentIndex={progressIndex} />

          {done && links ? (
            <div className={`glass-panel animate-scale-up ${styles.card}`}>
              <div className={flowStyles.successHero}>
                {teamLogo ? (
                  <img
                    src={teamLogo}
                    alt="Team logo"
                    style={{
                      width: '3.5rem',
                      height: '3.5rem',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid rgba(16, 185, 129, 0.4)',
                    }}
                  />
                ) : (
                  <CheckCircle2
                    className="w-11 h-11 text-emerald-600"
                    aria-hidden
                    strokeWidth={2.25}
                  />
                )}
                <h2 className={flowStyles.successHeroTitle}>You&apos;re all set, {representative.split(' ')[0] || 'captain'}!</h2>
                <p className={flowStyles.successHeroLead}>
                  <strong>{teamName}</strong> is registered and paid for. Now invite your
                  teammates to fill in their own details.
                </p>
              </div>

              <div className={styles.infoSection} style={{ marginBottom: '1.25rem' }}>
                <h3 className={styles.infoSectionTitle}>What happens next</h3>
                <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  <li>
                    Send the <strong>player register</strong> link below to your teammates — each
                    one fills in their own details, no extra payment needed.
                  </li>
                  <li>Registration for this team closes automatically at {tournament.maxPlayers} players.</li>
                  <li>
                    Check the <strong>live roster</strong> link anytime to see who&apos;s joined so
                    far.
                  </li>
                </ol>
              </div>

              <div className={flowStyles.createdLinks}>
                <div className={`${flowStyles.linkCard} ${flowStyles.linkCardPlayer}`}>
                  <p className={flowStyles.linkLabel}>Player register link · {teamName}</p>
                  <code className={flowStyles.path}>{publicUrl(links.player)}</code>
                  <div className={flowStyles.linkActions}>
                    <button
                      type="button"
                      className={flowStyles.iconBtn}
                      onClick={() => copyUrl(links.player, 'player')}
                    >
                      <Copy size={14} aria-hidden />
                      {copied === 'player' ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
                <div className={`${flowStyles.linkCard} ${flowStyles.linkCardLive}`}>
                  <p className={flowStyles.linkLabel}>Live team · {teamName}</p>
                  <code className={flowStyles.path}>{publicUrl(links.live)}</code>
                  <div className={flowStyles.linkActions}>
                    <button
                      type="button"
                      className={flowStyles.iconBtn}
                      onClick={() => copyUrl(links.live, 'live')}
                    >
                      <Copy size={14} aria-hidden />
                      {copied === 'live' ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={flowStyles.whatsappBtn}
                onClick={() => shareLinksOnWhatsApp()}
              >
                Share on WhatsApp
              </button>
              <p className={flowStyles.whatsappHint}>
                Sends both links in one message to {contact || 'your number'}.
              </p>

              <div className={styles.formActions} style={{ marginTop: '1.25rem' }}>
                <Link href="/" className="btn-secondary">
                  Back to home
                </Link>
              </div>
            </div>
          ) : null}

          {!done && step === 1 ? (
            <div className={`glass-panel animate-fade-in ${styles.card}`}>
              <div className={styles.overviewIntro}>
                <h2 className={styles.cardTitle}>Tournament Overview</h2>
                <p className={styles.overviewLead}>
                  Review the details below, then continue to enter team and player information.
                </p>
              </div>

              {description ? (
                <div className={styles.infoSection}>
                  <div className={styles.infoSectionHeader}>
                    <FileText size={18} className={styles.infoSectionIcon} aria-hidden />
                    <h3 className={styles.infoSectionTitle}>Description</h3>
                  </div>
                  <p className={styles.infoSectionBody}>{description}</p>
                </div>
              ) : null}

              {rules ? (
                <div className={styles.infoSection}>
                  <div className={styles.infoSectionHeader}>
                    <ClipboardList size={18} className={styles.infoSectionIcon} aria-hidden />
                    <h3 className={styles.infoSectionTitle}>Game Rules</h3>
                  </div>
                  <p className={styles.infoSectionBody}>{rules}</p>
                </div>
              ) : null}

              {tournament.venue ? (
                <p className={styles.venueFooter}>
                  <MapPin size={16} className={styles.venueFooterIcon} aria-hidden />
                  <span>
                    <strong className={styles.infoStrong}>Venue:</strong> {tournament.venue}
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

              {terms ? (
                <>
                  <div id="terms-section" className={styles.infoSection}>
                    <div className={styles.infoSectionHeader}>
                      <ScrollText size={18} className={styles.infoSectionIcon} aria-hidden />
                      <h3 className={styles.infoSectionTitle}>Terms &amp; Conditions</h3>
                    </div>
                    <div className={styles.termsBox}>
                      <p className={styles.infoSectionBody}>{terms}</p>
                    </div>
                  </div>

                  <div className={styles.termsRow}>
                    <input
                      type="checkbox"
                      id="acceptTeamInviteTerms"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <label htmlFor="acceptTeamInviteTerms" className={styles.termsLabel}>
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
                        Terms &amp; Conditions
                      </span>
                    </label>
                  </div>
                </>
              ) : null}

              <div className={styles.formActions}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    if (terms && !termsAccepted) {
                      toast.error('Please accept the Terms & Conditions');
                      return;
                    }
                    setStep(2);
                  }}
                >
                  Continue to team info
                </button>
              </div>
            </div>
          ) : null}

          {!done && step === 2 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!teamName.trim() || !representative.trim() || !contact.trim()) {
                  toast.error('Enter team name, representative, and contact');
                  return;
                }
                for (const field of teamCustomFields) {
                  const err = validateCustomFieldAnswers([field], teamFieldValues);
                  if (err) {
                    toast.error(err);
                    return;
                  }
                }
                setStep(3);
              }}
              className={`glass-panel animate-fade-in delay-100 ${styles.card}`}
            >
              <h2 className={`${styles.cardTitle} ${styles.cardTitleWithIcon}`}>
                <Users size={24} className={styles.cardTitleIcon} aria-hidden /> Team Information
              </h2>
              <p className={styles.overviewLead}>
                Enter team name, representative name, and contact number.
              </p>

              <div
                className={`${styles.logoUpload} ${styles.teamLogoPicker}`}
                onClick={() => document.getElementById('teamLogoInput')?.click()}
              >
                {teamLogo ? (
                  <img src={teamLogo} alt="Team logo" />
                ) : (
                  <>
                    <ImageIcon size={32} style={{ color: '#94a3b8' }} />
                    <p className={styles.teamLogoHint}>Upload Team Logo</p>
                  </>
                )}
                <input
                  id="teamLogoInput"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error('File size exceeds 5MB.');
                      e.target.value = '';
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const img = new window.Image();
                      img.onload = () => {
                        const maxSide = 800;
                        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(img.width * scale));
                        canvas.height = Math.max(1, Math.round(img.height * scale));
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        setTeamLogo(canvas.toDataURL('image/jpeg', 0.7));
                      };
                      img.src = ev.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Team name <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Mumbai Strikers"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    autoComplete="organization"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>
                    Team Representative Name <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Captain / manager"
                    value={representative}
                    onChange={(e) => setRepresentative(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>
                    Contact Number <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    placeholder="10-digit mobile"
                    value={contact}
                    onChange={(e) => setContact(formatPhoneNumber(e.target.value))}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {teamCustomFields.length > 0 ? (
                <>
                  <p className={styles.formSectionLabel} style={{ marginTop: '1.5rem' }}>
                    Additional Team Details
                  </p>
                  <div className={styles.formGrid}>
                    {teamCustomFields.map((field) => (
                      <div className={styles.formGroup} key={field.id}>
                        <label>
                          {field.label}
                          {field.required ? <span style={{ color: 'var(--error)' }}> *</span> : null}
                        </label>
                        {field.type === 'select' || field.type === 'category' ? (
                          <select
                            required={field.required}
                            value={teamFieldValues[field.label] || ''}
                            onChange={(e) =>
                              setTeamFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))
                            }
                          >
                            <option value="">-- Select {field.label} --</option>
                            {(field.type === 'category'
                              ? ageCategories.map((c) => ({
                                  value: c.id,
                                  label: `${c.name} (${formatAgeCategoryRange(c)}${
                                    feeMode === 'category' && c.fee > 0
                                      ? ` · ₹${c.fee.toLocaleString('en-IN')}`
                                      : ''
                                  })`,
                                }))
                              : (field.options || '')
                                  .split(',')
                                  .map((o) => o.trim())
                                  .filter(Boolean)
                                  .map((o) => ({ value: o, label: o }))
                            ).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={
                              resolveCustomFieldValidation(field).htmlType ||
                              (field.type === 'number' ? 'number' : 'text')
                            }
                            inputMode={resolveCustomFieldValidation(field).inputMode}
                            pattern={resolveCustomFieldValidation(field).pattern}
                            minLength={resolveCustomFieldValidation(field).minLength}
                            maxLength={resolveCustomFieldValidation(field).maxLength}
                            title={resolveCustomFieldValidation(field).message}
                            required={field.required}
                            placeholder={
                              resolveCustomFieldValidation(field).hint
                                ? `Enter ${field.label.toLowerCase()} (${resolveCustomFieldValidation(field).hint})`
                                : `Enter ${field.label.toLowerCase()}`
                            }
                            value={teamFieldValues[field.label] || ''}
                            onChange={(e) =>
                              setTeamFieldValues((prev) => ({
                                ...prev,
                                [field.label]: sanitizeCustomFieldInput(field, e.target.value),
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <div className={styles.formActions}>
                <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="submit" className="btn-primary">
                  Continue to your details
                </button>
              </div>
            </form>
          ) : null}

          {!done && step === 3 ? (
            <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
              <div className={`${styles.playersHeader} ${styles.playersHeaderBar}`}>
                <div className={styles.playersStepHeader}>
                  <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                    Add Player Details
                  </h2>
                  <p className={styles.playersStepSubtitle}>
                    Representative only — fill your own details. Other players join after payment
                    (max {tournament.maxPlayers}).
                  </p>
                </div>
              </div>

              <div className={styles.playersList}>
                <div className={`glass-panel ${styles.playerCard}`}>
                  <div className={styles.playerHeader}>
                    <div className={styles.playerAvatar}>
                      <Users size={20} />
                    </div>
                    <div className={styles.playerHeaderCopy}>
                      <h3>Your profile</h3>
                      <p className={styles.playerHeaderHint}>
                        Fill the player profile exactly as it should appear in the roster.
                      </p>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                  <OrderedPlayerFields
                    fieldKeys={orderedFieldKeys}
                    player={player}
                    config={config}
                    tournament={{
                      sport: tournament.sport,
                      customFields,
                      ageCategories,
                    }}
                    selectedAgeCategoryId={effectiveSelectedAgeCategoryId || ''}
                    variant="individual"
                    formatPhoneNumber={formatPhoneNumber}
                    profileKinds={profileKinds}
                    preferSelectedSportProfiles={multiSport}
                    onChange={(key, value) => setPlayer((p) => ({ ...p, [key]: value }))}
                    onCustomChange={(label, value) =>
                      setPlayer((p) => ({
                        ...p,
                        customValues: { ...p.customValues, [label]: value },
                      }))
                    }
                    onSportRoleToggle={(role) =>
                      setPlayer((p) => withLegacySportRoleToggle(p, tournament.sport, role))
                    }
                    onSportProfileRoleToggle={(kind, role) =>
                      setPlayer((p) => withSportProfileRoleToggle(p, profileKinds, kind, role))
                    }
                    onSportProfileFieldChange={(kind, field, value) =>
                      setPlayer((p) => withSportProfileFieldChange(p, profileKinds, kind, field, value))
                    }
                    onPhotoUpload={(e) => {
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
                          setPlayer((p) => ({ ...p, photo: canvas.toDataURL('image/jpeg', 0.82) }));
                          setPhotoLabel(file.name);
                        };
                        img.src = ev.target?.result as string;
                      };
                      reader.readAsDataURL(file);
                    }}
                    photoFileLabel={photoLabel}
                    photoInputRef={photoInputRef}
                    onPhotoChooseClick={() => photoInputRef.current?.click()}
                  />
                  {multiSport || ageCategories.length > 0 ? (
                    <div className={styles.enrollmentStep} style={{ gridColumn: '1 / -1' }}>
                      <h3 className={styles.sportsPickerTitle}>
                        {sportsSectionCopy.label || 'Eligible events'}
                      </h3>
                      <p className={styles.sportsPickerHint}>
                        Your category is set from date of birth. Eligible events follow that category and gender.
                      </p>
                      {!player.dob ? (
                        <p className={styles.sportsPickerTotalWarn}>
                          Enter date of birth to see your category and events.
                        </p>
                      ) : !effectiveSelectedAgeCategoryId ? (
                        <p className={styles.sportsPickerTotalWarn}>
                          This date of birth does not match an age category for this tournament.
                        </p>
                      ) : (
                        <p className={styles.sportsPickerHint}>
                          Category:{' '}
                          <strong>
                            {ageCategories.find((c) => c.id === effectiveSelectedAgeCategoryId)?.name ||
                              'Selected'}
                          </strong>
                          {(() => {
                            const cat = ageCategories.find((c) => c.id === effectiveSelectedAgeCategoryId);
                            const range = cat ? formatAgeCategoryRange(cat) : '';
                            return range ? ` · ${range}` : '';
                          })()}
                        </p>
                      )}
                      {effectiveSelectedAgeCategoryId && !genderFieldOn ? (
                        <div className={styles.ageCategoryGuide} role="listbox" aria-label="Gender">
                          {ELIGIBILITY_GENDERS.map((g) => (
                            <button
                              key={g}
                              type="button"
                              role="option"
                              aria-selected={enrollmentGender === g}
                              className={[
                                styles.ageCategoryCard,
                                styles.ageCategoryPickCard,
                                enrollmentGender === g ? styles.ageCategoryCardActive : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setPlayer((p) => ({ ...p, gender: g }))}
                            >
                              <span className={styles.ageCategoryCardTitle}>{g}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {effectiveSelectedAgeCategoryId && genderFieldOn && !enrollmentGender ? (
                        <p className={styles.sportsPickerTotalWarn}>
                          Select gender on this form to see events.
                        </p>
                      ) : null}
                      {effectiveSelectedAgeCategoryId && enrollmentGender && requireDisciplinePick ? (
                        <>
                        <p className={styles.sportsPickerHint}>
                          {disciplineSectionCopy.label || 'Select discipline'}
                        </p>
                        <div className={styles.ageCategoryGuide} role="group" aria-label="Disciplines">
                          {disciplineOptions.map((disc) => {
                            const active = selectedDisciplines.includes(disc);
                            return (
                              <button
                                key={disc}
                                type="button"
                                aria-pressed={active}
                                className={[
                                  styles.ageCategoryCard,
                                  styles.ageCategoryPickCard,
                                  active ? styles.ageCategoryCardActive : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => {
                                  setSelectedDisciplines((prev) =>
                                    prev.includes(disc) ? prev.filter((d) => d !== disc) : [...prev, disc]
                                  );
                                  setSelectedSportIds([]);
                                }}
                              >
                                <span className={styles.ageCategoryCardTitle}>{disc}</span>
                              </button>
                            );
                          })}
                        </div>
                        </>
                      ) : null}
                      {multiSport &&
                      (!ageCategories.length || effectiveSelectedAgeCategoryId) &&
                      (!requireEnrollmentGender || enrollmentGender) &&
                      (!requireDisciplinePick || selectedDisciplines.length > 0) ? (
                        <div className={styles.sportsPickerList}>
                          {eligibleSportsConfig.length === 0 ? (
                            <p className={styles.sportsPickerTotalWarn}>
                              No events are available for this category and gender.
                            </p>
                          ) : (
                            groupSportsForDisplay(eligibleSportsConfig).map((group) => (
                              <div key={group.family} className={styles.sportsFamily}>
                                {group.entries.length > 1 ? (
                                  <div className={styles.sportsFamilyTitle}>{group.family}</div>
                                ) : null}
                                <div className={styles.sportsOptions}>
                                  {group.entries.map((s) => {
                                    const checked = selectedSportIds.includes(s.id);
                                    const title =
                                      group.entries.length > 1 ? s.formatLabel || s.name : s.name;
                                    const stepAmount =
                                      feeMode === 'step'
                                        ? stepFeeAt(selectedSportIds, s.id, stepFees)
                                        : null;
                                    return (
                                      <label
                                        key={s.id}
                                        className={`${styles.sportOption}${
                                          checked ? ` ${styles.sportOptionChecked}` : ''
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          className={styles.sportOptionCheck}
                                          checked={checked}
                                          onChange={() => {
                                            setSelectedSportIds((prev) =>
                                              prev.includes(s.id)
                                                ? prev.filter((id) => id !== s.id)
                                                : [...prev, s.id]
                                            );
                                          }}
                                        />
                                        <span className={styles.sportOptionBody}>
                                          <span className={styles.sportOptionName}>{title}</span>
                                          {s.description ? (
                                            <span className={styles.sportOptionMeta}>{s.description}</span>
                                          ) : null}
                                        </span>
                                        <span className={styles.sportOptionFee}>
                                          {feeMode === 'sport'
                                            ? `₹${s.fee.toLocaleString('en-IN')}`
                                            : stepAmount != null
                                              ? `₹${stepAmount.toLocaleString('en-IN')}`
                                              : ''}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                          <div className={styles.sportsPickerTotal}>
                            <span className={styles.sportsPickerTotalLabel}>Total payable</span>
                            <span className={styles.sportsPickerTotalAmount}>
                              ₹{feeAmount.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    if (!player.name.trim()) {
                      toast.error('Enter your player name');
                      return;
                    }
                    const catCheck = validatePlayerDobAgainstCategory(
                      player.dob,
                      ageCategories,
                      effectiveSelectedAgeCategoryId
                    );
                    if (!catCheck.ok) {
                      toast.error(catCheck.error);
                      return;
                    }
                    if (requireAgeCategoryPick && !effectiveSelectedAgeCategoryId) {
                      toast.error('Enter a date of birth that matches an age category.');
                      return;
                    }
                    if (requireEnrollmentGender && !enrollmentGender) {
                      toast.error('Select gender to see eligible events.');
                      return;
                    }
                    if (requireDisciplinePick && selectedDisciplines.length === 0) {
                      toast.error('Select at least one discipline.');
                      return;
                    }
                    if (multiSport && selectedSportIds.length === 0) {
                      toast.error('Select at least one event.');
                      return;
                    }
                    const customErr = validateCustomFieldAnswers(customFields, player.customValues);
                    if (customErr) {
                      toast.error(customErr);
                      return;
                    }
                    setStep(4);
                  }}
                >
                  Continue to payment
                </button>
              </div>
            </div>
          ) : null}

          {!done && step === 4 ? (
            <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
              <h2 className={styles.cardTitle}>Payment</h2>
              <p className={styles.overviewLead}>
                Pay once for <strong>{teamName || 'your team'}</strong>. After payment you get the
                player register link and live roster link.
              </p>

              <div className={styles.infoSection} style={{ marginBottom: '0.85rem' }}>
                <h3 className={styles.infoSectionTitle}>Team summary</h3>
              </div>
              <div className={styles.closedMeta} style={{ marginBottom: '1.35rem' }}>
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Team name</p>
                  <p className={styles.closedMetaValue}>{teamName || '—'}</p>
                </div>
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Representative</p>
                  <p className={styles.closedMetaValue}>{representative || '—'}</p>
                </div>
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Contact</p>
                  <p className={styles.closedMetaValue}>{contact || '—'}</p>
                </div>
                <div className={styles.closedMetaItem}>
                  <p className={styles.closedMetaLabel}>Player</p>
                  <p className={styles.closedMetaValue}>{player.name || '—'}</p>
                </div>
              </div>

              <div className={styles.paymentFeeRow}>
                <div>
                  <p className={styles.stepFooterFeeTitle}>Amount due</p>
                  <p className={styles.stepFooterFeeHint}>
                    One payment for the whole team. Roster closes at {tournament.maxPlayers}{' '}
                    players.
                  </p>
                </div>
                <p className={styles.paymentFeeAmount}>
                  {feeAmount > 0 ? `₹${feeAmount.toLocaleString('en-IN')}` : 'Free'}
                </p>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep(3)}
                  disabled={paying}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={paying}
                  onClick={() => void handlePay()}
                >
                  {paying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 inline mr-2" />
                      Pay for team
                      {feeAmount > 0 ? ` · ₹${feeAmount.toLocaleString('en-IN')}` : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
      </div>
    </div>
  );
}
