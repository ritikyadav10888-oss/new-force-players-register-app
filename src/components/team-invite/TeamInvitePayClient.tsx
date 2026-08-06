'use client';

import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, CreditCard, Loader2, Users } from 'lucide-react';
import styles from '@/app/register/[slug]/register.module.css';
import flowStyles from './teamInviteFlow.module.css';
import { OrderedPlayerFields } from '@/app/register/[slug]/OrderedPlayerFields';
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
import { parseSportsConfig, resolveSelectedSports } from '@/lib/multi-sport';
import { parseAgeCategories, validatePlayerDobAgainstCategory } from '@/lib/age-categories';
import {
  buildWhatsAppShareUrl,
  teamInviteWhatsAppMessage,
  toWhatsAppE164,
} from '@/lib/whatsapp-share';

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

type Props = { slug: string; token: string };

export default function TeamInvitePayClient({ slug, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [players, setPlayers] = useState<{ name: string }[]>([]);
  const [links, setLinks] = useState<{ live: string; player: string; pay: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [player, setPlayer] = useState(emptyPlayer());
  const [photoLabel, setPhotoLabel] = useState('No file chosen');
  const [copied, setCopied] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lockRef = useRef(false);
  const whatsappAutoSentRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setInvite(data.invite);
      setTournament(data.tournament);
      setPlayers(data.players || []);
      setLinks(data.links);
      if (String(data.invite.paymentStatus).toLowerCase() === 'paid') setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const customFields = useMemo(
    () => parseCustomFields(tournament?.custom_fields),
    [tournament?.custom_fields]
  );

  const config = useMemo(() => {
    const fc = tournament?.form_config || {};
    return {
      ...fc,
      cricketProfile: resolveSportsProfileForTournament(fc, tournament?.sport),
    };
  }, [tournament]);

  const sportsConfig = useMemo(
    () => parseSportsConfig(tournament?.sports_config),
    [tournament?.sports_config]
  );

  const selectedSports = useMemo(() => {
    const ids = Array.isArray(invite?.selectedSports) ? invite.selectedSports : [];
    return resolveSelectedSports(sportsConfig, ids);
  }, [invite?.selectedSports, sportsConfig]);

  const ageCategories = useMemo(
    () => parseAgeCategories(tournament?.age_categories),
    [tournament?.age_categories]
  );

  const multiSport = selectedSports.length > 1;
  const profileKinds = profileKindsForRegistration({
    multiSport,
    selected: selectedSports,
    tournamentSport: tournament?.sport,
  });

  const orderedFieldKeys = useMemo(() => {
    const sportsProfileShown = Boolean(
      config.cricketProfile?.enabled || config.cricketProfile?.required
    );
    return visibleFieldOrder(config, customFields, sportsProfileShown);
  }, [config, customFields]);

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

  const completePayment = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment confirmation failed');
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
    await load();
  };

  const ensureRepresentativePlayer = async () => {
    if (players.length >= 1) return true;
    if (!player.name.trim()) {
      toast.error('Fill your own player details first');
      return false;
    }
    const catCheck = validatePlayerDobAgainstCategory(
      player.dob,
      ageCategories,
      invite?.selectedAgeCategoryId
    );
    if (!catCheck.ok) {
      toast.error(catCheck.error);
      return false;
    }
    const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, asRepresentative: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Could not save your details');
      return false;
    }
    setPlayers([{ name: player.name }]);
    return true;
  };

  const handlePay = async () => {
    if (lockRef.current || paying) return;
    setPaying(true);
    try {
      const ok = await ensureRepresentativePlayer();
      if (!ok) {
        setPaying(false);
        return;
      }

      const orderRes = await fetch(`/api/team-invites/${encodeURIComponent(token)}/pay`, {
        method: 'POST',
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Could not start payment');

      if (orderData.free) {
        await completePayment({});
        setPaying(false);
        return;
      }

      if (orderData.mock) {
        toast.message('Mock payment mode');
        await completePayment({
          razorpayOrderId: orderData.id,
          razorpayPaymentId: `pay_MOCK_${Date.now()}`,
          razorpaySignature: 'dev_mock_signature',
          devMockPayment: true,
        });
        setPaying(false);
        return;
      }

      await loadRazorpay();
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId || !window.Razorpay) {
        throw new Error('Payment gateway not configured');
      }

      lockRef.current = true;

      const rzp = new window.Razorpay({
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: tournament?.name || 'Force Sports Player Register',
        description: `${invite.teamName} — team registration`,
        order_id: orderData.id,
        prefill: {
          name: invite.representative,
          contact: invite.contact,
        },
        handler: async (response: Record<string, unknown>) => {
          try {
            await completePayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
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
    if (!links || !invite) return false;
    const phone = toWhatsAppE164(invite.contact);
    if (!phone) {
      if (!opts?.silent) {
        toast.error('Add a valid representative WhatsApp number to share.');
      }
      return false;
    }
    const text = teamInviteWhatsAppMessage({
      teamName: invite.teamName || 'your team',
      tournamentName: tournament?.name,
      playerUrl: publicUrl(links.player),
      liveUrl: publicUrl(links.live),
      maxPlayers: invite.maxPlayers ?? tournament?.max_players,
    });
    window.open(
      buildWhatsAppShareUrl({ phone: invite.contact, text }),
      '_blank',
      'noopener,noreferrer'
    );
    if (!opts?.silent) toast.success('Opening WhatsApp…');
    return true;
  };

  useEffect(() => {
    if (!done || !links || !invite || whatsappAutoSentRef.current) return;
    whatsappAutoSentRef.current = true;
    const timer = window.setTimeout(() => {
      const opened = shareLinksOnWhatsApp({ silent: true });
      if (opened) {
        toast.message('WhatsApp opened — tap Send if the message is not delivered yet.');
      }
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once after payment success
  }, [done, links, invite?.contact]);

  const theme = tournament?.theme || '#0d472c';
  const needsRepForm = !done && players.length < 1;
  const banner = tournament?.banner_url || tournament?.banner || '';

  if (loading) {
    return (
      <div
        className={styles.registerContainer}
        style={{ ['--theme-color' as string]: theme }}
      >
        <div className="container py-24 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin opacity-60" />
          <p className="text-sm opacity-70">Loading payment…</p>
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className={styles.registerContainer}>
        <div className="container py-16 text-center">
          <p className="text-red-600">{error || 'Not found'}</p>
          <Link href="/" className="inline-block mt-4 text-sm underline">
            Home
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
          <h1 className={styles.title}>{tournament?.name || 'Team registration'}</h1>
          <div className={styles.metaRow}>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {invite.teamName}
            </span>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {players.length}/{invite.maxPlayers} Players
            </span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
        {done ? (
          <div className={`glass-panel animate-scale-up ${styles.card}`}>
            <div className={flowStyles.successHero}>
              <CheckCircle2
                className="w-11 h-11 text-emerald-600"
                aria-hidden
                strokeWidth={2.25}
              />
              <h2 className={flowStyles.successHeroTitle}>You&apos;re all set!</h2>
              <p className={flowStyles.successHeroLead}>
                <strong>{invite.teamName}</strong> is registered and paid for. Now invite your
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
                <li>Registration for this team closes automatically once the roster is full.</li>
                <li>
                  Check the <strong>live roster</strong> link anytime to see who&apos;s joined so
                  far.
                </li>
              </ol>
            </div>

            {links ? (
              <>
                <div className={flowStyles.createdLinks}>
                  <div className={flowStyles.linkCard}>
                    <p className={flowStyles.linkLabel}>
                      Player register · {invite.teamName}
                    </p>
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
                  <div className={flowStyles.linkCard}>
                    <p className={flowStyles.linkLabel}>Live roster · {invite.teamName}</p>
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
                  Sends both links in one message to {invite.contact || 'your number'}.
                </p>
              </>
            ) : null}

            <div className={styles.formActions} style={{ marginTop: '1.25rem' }}>
              <Link href="/" className="btn-secondary">
                Back to home
              </Link>
            </div>
          </div>
        ) : needsRepForm && tournament ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handlePay();
            }}
            className={`glass-panel animate-fade-in delay-100 ${styles.card}`}
          >
            <div className={`${styles.playersHeader} ${styles.playersHeaderBar}`}>
              <div className={styles.playersStepHeader}>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                  Add Player Details
                </h2>
                <p className={styles.playersStepSubtitle}>
                  Representative only — fill your own details, then pay once for the whole team.
                </p>
              </div>
            </div>

            <div className={styles.playersList}>
              <div className={`glass-panel ${styles.playerCard}`}>
                <OrderedPlayerFields
                  fieldKeys={orderedFieldKeys}
                  player={player}
                  config={config}
                  tournament={tournament}
                  selectedAgeCategoryId={invite.selectedAgeCategoryId || ''}
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
                    setPlayer((p) => withLegacySportRoleToggle(p, tournament?.sport, role))
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
                        const base64 = canvas.toDataURL('image/jpeg', 0.82);
                        setPlayer((p) => ({ ...p, photo: base64 }));
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
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="submit" className="btn-primary" disabled={paying}>
                <CreditCard className="w-4 h-4 inline mr-2" />
                {paying ? 'Processing…' : 'Save & pay for team'}
              </button>
            </div>
          </form>
        ) : (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={styles.cardTitle}>Payment</h2>
            <p className={styles.overviewLead}>
              Your details are saved. Pay once for <strong>{invite.teamName}</strong>.
            </p>

            <div className={styles.infoSection}>
              <h3 className={styles.infoSectionTitle}>Team summary</h3>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Team Name:</strong> {invite.teamName}
              </p>
              <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                <strong>Team Representative Name:</strong> {invite.representative}
              </p>
              {players.length > 0 ? (
                <p style={{ margin: '0.4rem 0', color: '#24352c' }}>
                  <strong>Player:</strong> {players.map((p) => p.name).join(', ')}
                </p>
              ) : null}
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className="btn-primary"
                disabled={paying}
                onClick={() => void handlePay()}
              >
                <CreditCard className="w-4 h-4 inline mr-2" />
                {paying ? 'Processing…' : 'Pay for team'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
