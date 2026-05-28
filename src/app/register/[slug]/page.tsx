'use client';

import { use, useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, MapPin, IndianRupee, User, Image as ImageIcon, ChevronRight, CheckCircle2, Mail, Phone, Award, Users, AlertTriangle, Plus, Minus } from 'lucide-react';
import styles from './register.module.css';
import {
  CRICKET_ROLES,
  allRounderTypeForCricketPayload,
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  cricketRolesNeedCombinedDetail,
  normalizeBattingHandUi,
  parseCricketRoles,
} from '@/lib/cricket-roles';
import { FOOTBALL_ROLES } from '@/lib/football-roles';
import { isSportsProfileShown, resolveSportsProfileForTournament } from '@/lib/form-config';
import {
  isCricketSport,
  isFootballSport,
  parseSportRoles,
  toggleSportRoleString,
  usesStructuredSportsProfile,
} from '@/lib/sport-utils';
import { parseSponsorsFromTournament, sponsorHasDisplay } from '@/lib/sponsors';
import { RegistrationSponsors } from '@/components/tournament/RegistrationSponsors';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const BATTING_HANDS = ['Right-Hand', 'Left-Hand'] as const;
const BOWLING_STYLES = [
  'Right-Arm Fast',
  'Right-Arm Medium',
  'Right-Arm Spin',
  'Left-Arm Fast',
  'Left-Arm Medium',
  'Left-Arm Spin',
] as const;

export default function RegisterPage({ params }: PageProps) {
  const unwrappedParams = use(params);
  const slug = unwrappedParams.slug;

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
    // `cricketProfile` is the persisted key; values are normalized from `sportsProfile` if present (see resolveSportsProfile).
    cricketProfile: { enabled: false, required: false },
  };

  const [tournament, setTournament] = useState<any>(null);
  const [tournamentLoading, setTournamentLoading] = useState(true);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [duplicateData, setDuplicateData] = useState<any>(null);

  const formatPhoneNumber = (value: string) => {
    let cleaned = value.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+91')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }
    return cleaned.replace(/\D/g, '').slice(0, 10);
  };

  // --- TEAM FLOW STATES ---
  const [teamInfo, setTeamInfo] = useState({ name: '', representative: '', contact: '', logo: '' });
  const [playerCount, setPlayerCount] = useState(10);
  const [teamPlayers, setTeamPlayers] = useState<any[]>([]);

  // --- INDIVIDUAL FLOW STATES ---
  const [individualPlayer, setIndividualPlayer] = useState<any>({
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
    photo: '',
    role: '',           // comma-separated roles (cricket or football positions, depending on tournament sport)
    battingHand: '',    // 'Right-handed', 'Left-handed'
    bowlingType: '',    // 'Fast Bowler', 'Spinner'
    allRounderType: '',  // 'Batting All-rounder', 'Bowling All-rounder'
    customValues: {}    // Map label -> value
  });

  const individualPhotoInputRef = useRef<HTMLInputElement>(null);
  const [individualPhotoFileLabel, setIndividualPhotoFileLabel] = useState('No file chosen');

  // Load actual tournament details from database (Supabase API)
  useEffect(() => {
    const fetchTournament = async () => {
      setTournamentLoading(true);
      setTournamentError(null);
      setTournament(null);
      setIndividualPhotoFileLabel('No file chosen');

      try {
        const response = await fetch(`/api/tournaments/${slug}`);
        const data = await response.json();

        if (!response.ok) {
          setTournamentError(data.error || 'Tournament not found');
          return;
        }

        const maxPlayers = Number(data.max_players) || 1;
        const rawFormConfig =
          data.form_config &&
          typeof data.form_config === 'object' &&
          !Array.isArray(data.form_config)
            ? (data.form_config as Record<string, unknown>)
            : {};
        const tournamentSport = String(data.sport || 'Cricket');
        const mergedFormConfig = {
          ...DEFAULT_FORM_CONFIG,
          ...rawFormConfig,
          cricketProfile: resolveSportsProfileForTournament(rawFormConfig, tournamentSport),
        } as typeof DEFAULT_FORM_CONFIG;
        if (String(data.type || 'Team') === 'Individual' && !('photo' in rawFormConfig)) {
          mergedFormConfig.photo = { enabled: true, required: false };
        }

        const matched = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          type: data.type || 'Team',
          venue: data.venue,
          fee: Number(data.fee) || 0,
          maxPlayers,
          theme: data.theme || '#6366f1',
          description: data.description,
          rules: data.rules,
          terms: data.terms,
          organizerName: data.organizer_name,
          organizerPhone: data.organizer_phone,
          registrationDeadline: data.registration_deadline,
          banner: data.banner_url || '/tournament-banner.png',
          customFields: data.custom_fields || [],
          formConfig: mergedFormConfig,
          status: data.status || 'Active',
          sponsors: parseSponsorsFromTournament(data),
          sport: data.sport || 'Cricket',
        };

        setTournament(matched);
        setPlayerCount(maxPlayers);
        setTeamPlayers(
          Array(maxPlayers)
            .fill(null)
            .map(() => ({
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
              customValues: {},
            }))
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load tournament';
        console.error('Error fetching tournament details:', message);
        setTournamentError(message);
      } finally {
        setTournamentLoading(false);
      }
    };

    fetchTournament();
  }, [slug]);

  // Resizing handler for team players roster
  const handlePlayerCountChange = (count: number) => {
    const validatedCount = Math.max(1, Math.min(tournament.maxPlayers || 10, count));
    setPlayerCount(validatedCount);
    
    setTeamPlayers(prev => {
      if (prev.length === validatedCount) return prev;
      if (prev.length > validatedCount) {
        return prev.slice(0, validatedCount);
      } else {
        const diff = validatedCount - prev.length;
        const newPlayers = Array(diff).fill(null).map(() => ({
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
          customValues: {},
        }));
        return [...prev, ...newPlayers];
      }
    });
  };

  const calculateAge = (dobString: string) => {
    if (!dobString) return '';
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age.toString() : '';
  };

  const handleTeamPlayerChange = (index: number, field: string, value: string) => {
    const newPlayers = [...teamPlayers];
    const updatedPlayer = {
      ...newPlayers[index],
      ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {}),
      [field]: value,
    };
    if (field === 'dob') {
      updatedPlayer.age = calculateAge(value);
    }
    newPlayers[index] = updatedPlayer;
    setTeamPlayers(newPlayers);
  };

  const handleTeamPlayerCustomValueChange = (index: number, label: string, value: string) => {
    const newPlayers = [...teamPlayers];
    const updatedCustom = { ...(newPlayers[index].customValues || {}), [label]: value };
    newPlayers[index] = { ...newPlayers[index], customValues: updatedCustom };
    setTeamPlayers(newPlayers);
  };

  const handleIndividualInputChange = (field: string, value: string) => {
    setIndividualPlayer((prev: any) => {
      const updated = {
        ...prev,
        [field]: value,
        ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {})
      };
      if (field === 'dob') {
        updated.age = calculateAge(value);
      }
      return updated;
    });
  };

  const handleIndividualSportRoleToggle = (r: string) => {
    setIndividualPlayer((prev: any) => {
      const sp = tournament?.sport;
      const nextRole = toggleSportRoleString(sp, prev.role || '', r);
      const rolesArr = parseSportRoles(sp, nextRole);
      const needBat = isCricketSport(tournament) && cricketRolesNeedBattingHand(rolesArr);
      const needBowl = isCricketSport(tournament) && cricketRolesNeedBowling(rolesArr);
      return {
        ...prev,
        role: nextRole,
        battingHand: needBat ? prev.battingHand : '',
        bowlingType: needBowl ? prev.bowlingType : '',
        allRounderType: '',
      };
    });
  };

  const handleTeamPlayerSportRoleToggle = (index: number, r: string) => {
    setTeamPlayers((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      if (!cur) return prev;
      const sp = tournament?.sport;
      const nextRole = toggleSportRoleString(sp, cur.role || '', r);
      const rolesArr = parseSportRoles(sp, nextRole);
      const needBat = isCricketSport(tournament) && cricketRolesNeedBattingHand(rolesArr);
      const needBowl = isCricketSport(tournament) && cricketRolesNeedBowling(rolesArr);
      copy[index] = {
        ...cur,
        role: nextRole,
        battingHand: needBat ? cur.battingHand : '',
        bowlingType: needBowl ? cur.bowlingType : '',
        allRounderType: '',
      };
      return copy;
    });
  };

  const handleIndividualCustomValueChange = (label: string, value: string) => {
    setIndividualPlayer((prev: any) => ({
      ...prev,
      customValues: {
        ...(prev.customValues || {}),
        [label]: value
      }
    }));
  };

  const compressImage = (file: File, callback: (base64: string) => void) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Resize to reasonable dimensions
        const MAX_HEIGHT = 800;
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
        
        // Compress as JPEG with 70% quality to severely reduce base64 size
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        callback(dataUrl);
      };
    };
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isTeamPlayer: boolean, idx?: number) => {
    const file = e.target.files?.[0];
    if (file) {
      // Hard limit of 5MB
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB. Please upload a smaller image.');
        e.target.value = ''; // Reset input
        if (!isTeamPlayer) setIndividualPhotoFileLabel('No file chosen');
        return;
      }

      // Automatically compress and resize the image before saving
      compressImage(file, (base64String) => {
        if (isTeamPlayer && idx !== undefined) {
          handleTeamPlayerChange(idx, 'photo', base64String);
        } else {
          handleIndividualInputChange('photo', base64String);
          setIndividualPhotoFileLabel(file.name);
        }
      });
    }
  };

  const nextStep = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep(s => s + 1);
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    if (tournamentLoading || !tournament?.id) {
      alert('Tournament is still loading. Please wait a moment and try again.');
      return;
    }

    if (tournament.status === 'Closed') {
      alert('Registration is closed for this tournament.');
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    const isTeamFlow = tournament.type === 'Team';
    const feeAmount = Number(tournament.fee) || 0;

    const basePayload = {
      tournamentId: tournament.id,
      teamName: isTeamFlow ? teamInfo.name : individualPlayer.name,
      representative: isTeamFlow ? teamInfo.representative : individualPlayer.name,
      contact: isTeamFlow ? teamInfo.contact : individualPlayer.phone,
      teamLogoUrl: isTeamFlow ? teamInfo.logo : null,
      players: isTeamFlow 
        ? teamPlayers.slice(0, playerCount).map(p => ({
            name: p.name,
            email: p.email,
            phone: p.phone,
            emergencyContact: p.emergencyContact,
            dob: p.dob,
            age: p.age ? Number(p.age) : null,
            gender: p.gender,
            aadhar: p.aadhar,
            jerseyName: p.jerseyName,
            jerseyNumber: p.jerseyNumber ? Number(p.jerseyNumber) : null,
            jerseySize: p.jerseySize,
            photo: p.photo,
            role: p.role,
            battingHand: p.battingHand,
            bowlingType: p.bowlingType,
            allRounderType: allRounderTypeForCricketPayload(
              isCricketSport(tournament),
              p.role,
              p.battingHand,
              p.bowlingType,
              p.allRounderType
            ),
            customValues: p.customValues
          }))
        : [{
            name: individualPlayer.name,
            email: individualPlayer.email,
            phone: individualPlayer.phone,
            emergencyContact: individualPlayer.emergencyContact,
            dob: individualPlayer.dob,
            age: individualPlayer.age ? Number(individualPlayer.age) : null,
            gender: individualPlayer.gender,
            aadhar: individualPlayer.aadhar,
            jerseyName: individualPlayer.jerseyName,
            jerseyNumber: individualPlayer.jerseyNumber ? Number(individualPlayer.jerseyNumber) : null,
            jerseySize: individualPlayer.jerseySize,
            photo: individualPlayer.photo,
            role: individualPlayer.role,
            battingHand: individualPlayer.battingHand,
            bowlingType: individualPlayer.bowlingType,
            allRounderType: allRounderTypeForCricketPayload(
              isCricketSport(tournament),
              individualPlayer.role,
              individualPlayer.battingHand,
              individualPlayer.bowlingType,
              individualPlayer.allRounderType
            ),
            customValues: individualPlayer.customValues
          }]
    };

    // 0. Perform duplicate dryRun check before starting Razorpay checkout or free processing
    try {
      const checkResponse = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...basePayload,
          dryRun: true
        })
      });

      const checkData = await checkResponse.json();
      if (!checkResponse.ok) {
        if (checkData.duplicate) {
          setDuplicateData(checkData);
          setSubmitting(false);
          return;
        }
        throw new Error(checkData.error || 'Failed duplicate verification check');
      }
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
      return;
    }

    // 1. If the registration fee is 0, register immediately without invoking Razorpay
    if (feeAmount <= 0) {
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to submit registration');
        setStep(isTeamFlow ? 5 : 4);
      } catch (err: any) {
        alert('Error submitting free registration: ' + err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      // 2. Call our backend route to generate a Razorpay Order ID
      const orderResponse = await fetch('/api/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok) {
        setSubmitting(false);
        throw new Error(orderData.error || 'Failed to create payment order');
      }

      // 3. Fallback check for Mock mode if keys are not supplied in env configuration
      if (orderData.mock) {
        alert(`ℹ️ Razorpay running in Mock Mode\n\nTo configure live transactions, add NEXT_PUBLIC_RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET inside your .env.local file.\n\nProceeding to simulate successful payment of ₹${feeAmount.toLocaleString()}...`);
        
        try {
          const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              razorpayOrderId: orderData.id,
              razorpayPaymentId: `pay_MOCK_${Date.now()}`,
              razorpaySignature: 'dev_mock_signature',
              devMockPayment: true,
            }),
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to submit mock registration');
          setStep(isTeamFlow ? 5 : 4);
        } catch (err: any) {
          alert('Error submitting mock registration: ' + err.message);
        } finally {
          setSubmitting(false);
        }
        return;
      }

      // 4. Load official script and open checkout overlay
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        alert('Failed to load Razorpay payment gateway. Please check your internet connection.');
        setSubmitting(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Force Sports Player Register',
        description: `Registration for ${tournament.name}`,
        image: '/logo.png', // Optional icon
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            const finalResponse = await fetch('/api/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...basePayload,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const result = await finalResponse.json();
            if (!finalResponse.ok) throw new Error(result.error || 'Failed to process database registration');
            setStep(isTeamFlow ? 5 : 4);
          } catch (err: any) {
            alert('Payment succeeded but roster registration failed: ' + err.message);
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
        prefill: {
          name: isTeamFlow ? teamInfo.representative : individualPlayer.name,
          email: isTeamFlow ? '' : individualPlayer.email,
          contact: isTeamFlow ? teamInfo.contact : individualPlayer.phone,
        },
        theme: {
          color: tournament.theme || '#6366f1'
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', () => setSubmitting(false));
      rzp.open();
    } catch (err: any) {
      alert('Error initializing payment checkout: ' + err.message);
      setSubmitting(false);
    }
  };

  if (tournamentLoading) {
    return (
      <div
        className={styles.registerContainer}
        style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <p style={{ color: '#94a3b8' }}>Loading tournament…</p>
      </div>
    );
  }

  if (tournamentError || !tournament) {
    return (
      <div
        className={styles.registerContainer}
        style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
      >
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', maxWidth: '480px' }}>
          <h1 style={{ color: '#f87171', marginBottom: '0.75rem' }}>Tournament unavailable</h1>
          <p style={{ color: '#94a3b8' }}>{tournamentError || 'This registration link is invalid.'}</p>
        </div>
      </div>
    );
  }

  const isTeam = tournament.type === 'Team';
  const stepsList = isTeam
    ? ['Details', 'Team Info', 'Players', 'Payment']
    : ['Details', 'Player Info', 'Payment'];

  const config = tournament.formConfig || DEFAULT_FORM_CONFIG;
  const visibleSponsors = (tournament.sponsors ?? []).filter(sponsorHasDisplay);
  const hasSponsors = visibleSponsors.length > 0;

  return (
    <div className={styles.registerContainer} style={{ '--theme-color': tournament.theme } as React.CSSProperties}>
      
      {/* Banner Area */}
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
              <RegistrationSponsors sponsors={tournament.sponsors} variant="ribbon" />
            </div>
          </div>
        ) : null}
        <div className={styles.overlay}></div>
        <div className={`container animate-slide-in-right ${styles.bannerContent}${hasSponsors ? ` ${styles.bannerContentLift}` : ''}`}>
          <h1 className={styles.title}>{tournament.name}</h1>
          <div className={styles.metaRow}>
            <span className={styles.meta} style={{ color: '#ef4444' }}><Calendar size={18} /> Reg Closes: {tournament.registrationDeadline ? new Date(tournament.registrationDeadline).toLocaleDateString() : 'TBD'}</span>
            <span className={styles.meta}><MapPin size={18} /> {tournament.venue}</span>
            <span className={styles.meta}>
              {isTeam ? <Users size={18} /> : <User size={18} />} 
              {isTeam ? `Max ${tournament.maxPlayers} Players/Team` : 'Individual Entry'}
            </span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
        
        {tournament.status === 'Closed' ? (
          <div className="glass-panel animate-scale-up" style={{
            padding: '3.5rem 2rem',
            textAlign: 'center',
            borderRadius: '1.5rem',
            border: '2px solid rgba(239, 68, 68, 0.25)', 
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(255,255,255,0.05)',
            background: 'linear-gradient(135deg, rgba(30, 20, 20, 0.5) 0%, rgba(10, 10, 10, 0.6) 100%)',
            maxWidth: '650px',
            margin: '0 auto'
          }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem auto',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)'
            }}>
              <AlertTriangle size={36} className="animate-pulse" />
            </div>

            <span style={{
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              padding: '0.4rem 1rem',
              borderRadius: '100px',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              Registration Ended
            </span>

            <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, marginTop: '1.25rem', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
              {tournament.name}
            </h2>

            <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: '1.6', maxWidth: '500px', margin: '0 auto 2.5rem auto' }}>
              Sorry! The registration window for this tournament has closed because it has been marked as <strong>Completed / Ended</strong> by the organizer. New registrations are no longer accepted.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              background: 'rgba(0,0,0,0.25)',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255,255,255,0.05)',
              textAlign: 'left',
              marginBottom: '2.5rem'
            }}>
              <div>
                <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Venue</p>
                <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: 500, margin: 0 }}>{tournament.venue}</p>
              </div>
              <div>
                <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Organizer</p>
                <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: 500, margin: 0 }}>{tournament.organizerName}</p>
              </div>
              <div>
                <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Contact Info</p>
                <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: 500, margin: 0 }}>
                  <a href={`tel:${tournament.organizerPhone}`} style={{ color: 'var(--theme-color)', textDecoration: 'none' }}>
                    📞 {tournament.organizerPhone}
                  </a>
                </p>
              </div>
            </div>

            <button className="btn-primary" style={{ display: 'inline-flex', padding: '0.75rem 2rem', textDecoration: 'none', margin: '0 auto' }} onClick={() => window.location.href='/'}>
              Back to Home
            </button>
          </div>
        ) : (
          <>
            {/* Dynamic Progress Bar */}
            <div className={`glass-panel animate-scale-up ${styles.progressContainer}`}>
              {stepsList.map((stepName, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
              <div className={`${styles.progressStep} ${step >= idx + 1 ? styles.activeStep : ''}`}>
                {idx + 1}. {stepName}
              </div>
              {idx < stepsList.length - 1 && <ChevronRight size={16} className={styles.progressSeparator} style={{ margin: '0 0.5rem' }} />}
            </div>
          ))}
          <ChevronRight size={16} className={styles.progressSeparator} style={{ margin: '0 0.5rem' }} />
          <div className={`${styles.progressStep} ${step === stepsList.length + 1 ? styles.activeStep : ''}`}>
            {stepsList.length + 1}. Success
          </div>
        </div>

        {/* ================= STEP 1: TOURNAMENT DETAILS ================= */}
        {step === 1 && (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <div className={styles.overviewHeaderRow} style={{ marginBottom: '2rem' }}>
              <div>
                <h2 className={styles.cardTitle} style={{ marginBottom: '0.5rem' }}>Tournament Overview</h2>
                <p style={{ color: '#94a3b8' }}>
                  {isTeam ? 'Review team entry rules and registration timelines.' : 'Review solo playing details and selection timelines.'}
                </p>
              </div>
              <div className={`${styles.feeBox} ${styles.feeBoxCompact}`}>
                <IndianRupee size={24} color="var(--theme-color)" />
                <div>
                  <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Registration Fee</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>₹{(Number(tournament.fee) || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <button 
              className="btn-secondary" 
              style={{ width: '100%', marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Tournament Details' : 'View Tournament Details'}
            </button>
            
            {showDetails && (
              <div className="animate-fade-in" style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', marginBottom: '2rem' }}>
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>Description</h3>
                  <p className={styles.description} style={{ margin: 0 }}>{tournament.description}</p>
                </div>
                
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>Game Rules</h3>
                  <p className={styles.description} style={{ whiteSpace: 'pre-line', margin: 0 }}>{tournament.rules}</p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>Organizer Contact</h3>
                  <p className={styles.description} style={{ margin: 0 }}>
                    <strong>{tournament.organizerName}</strong><br/>
                    <a 
                      href={`tel:${tournament.organizerPhone}`} 
                      style={{ 
                        color: 'var(--theme-color)', 
                        textDecoration: 'none', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginTop: '0.25rem',
                        fontWeight: 500,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                      onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      📞 {tournament.organizerPhone}
                    </a>
                  </p>
                </div>

                <div id="terms-section" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--theme-color)' }}>Terms & Conditions</h3>
                  <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-line', margin: 0 }}>
                    {tournament.terms}
                  </p>
                </div>
              </div>
            )}

            {/* Terms and Conditions Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '2rem', marginBottom: '1.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <input 
                type="checkbox" 
                id="acceptTerms" 
                checked={termsAccepted} 
                onChange={(e) => setTermsAccepted(e.target.checked)} 
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--theme-color)' }}
              />
              <label htmlFor="acceptTerms" style={{ color: '#cbd5e1', fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}>
                I have read and agree to the{' '}
                <span 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDetails(true);
                    setTimeout(() => {
                      const element = document.getElementById('terms-section');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }}
                  style={{ color: 'var(--theme-color)', textDecoration: 'underline', fontWeight: 600 }}
                >
                  Terms & Conditions
                </span>
              </label>
            </div>

            <button 
              onClick={nextStep} 
              className="btn-primary" 
              disabled={!termsAccepted}
              style={{ 
                width: '100%', 
                opacity: termsAccepted ? 1 : 0.5, 
                cursor: termsAccepted ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease'
              }}
            >
              {isTeam ? 'Register My Team' : 'Register Solo'} <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* ================= TEAM FLOW: STEP 2 (TEAM INFO) ================= */}
        {isTeam && step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); nextStep(); }} className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={styles.cardTitle}>Team Information</h2>

            {hasSponsors ? (
              <RegistrationSponsors sponsors={tournament.sponsors} variant="form" />
            ) : null}
            
            <div 
              className={styles.logoUpload} 
              onClick={() => document.getElementById('teamLogoInput')?.click()}
              style={{
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                border: '2px dashed rgba(255,255,255,0.15)',
                borderRadius: '1rem',
                background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s ease',
                width: '120px',
                height: '120px',
                margin: '0 auto 2rem auto',
                overflow: 'hidden'
              }}
            >
              {teamInfo.logo ? (
                <img 
                  src={teamInfo.logo} 
                  alt="Team Logo" 
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '0.75rem'
                  }} 
                />
              ) : (
                <>
                  <ImageIcon size={32} style={{ color: '#94a3b8' }} />
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8', textAlign: 'center' }}>Upload Team Logo</p>
                </>
              )}
              <input 
                id="teamLogoInput" 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    compressImage(file, (base64) => {
                      setTeamInfo(prev => ({ ...prev, logo: base64 }));
                    });
                  }
                }}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Team Name <span style={{ color: 'var(--error)' }}>*</span></label>
                <input required type="text" placeholder="e.g. Mumbai Strikers" value={teamInfo.name} onChange={e => setTeamInfo({...teamInfo, name: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label>Representative Name <span style={{ color: 'var(--error)' }}>*</span></label>
                <input required type="text" placeholder="Manager/Captain Name" value={teamInfo.representative} onChange={e => setTeamInfo({...teamInfo, representative: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label>Contact Number <span style={{ color: 'var(--error)' }}>*</span></label>
                <input required type="tel" pattern="[0-9]{10}" maxLength={10} minLength={10} placeholder="10-digit mobile (No +91 or 0)" value={teamInfo.contact} onChange={e => setTeamInfo({...teamInfo, contact: formatPhoneNumber(e.target.value)})} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="button" onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
              <button type="submit" className="btn-primary" style={{ flex: 2 }}>Next: Add Players</button>
            </div>
          </form>
        )}

        {/* ================= TEAM FLOW: STEP 3 (PLAYERS ROSTER) ================= */}
        {isTeam && step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (config.cricketProfile?.required) {
                for (let i = 0; i < playerCount; i++) {
                  const p = teamPlayers[i];
                  if (!usesStructuredSportsProfile(tournament)) {
                    if (!p?.role?.trim()) {
                      alert(`Please enter playing role / position for player ${i + 1}.`);
                      return;
                    }
                    continue;
                  }
                  const roles = parseSportRoles(tournament?.sport, p?.role);
                  if (roles.length === 0) {
                    alert(
                      isFootballSport(tournament)
                        ? `Please select at least one position for player ${i + 1}.`
                        : `Please select at least one playing role for player ${i + 1}.`,
                    );
                    return;
                  }
                  if (isCricketSport(tournament)) {
                    const hand = normalizeBattingHandUi(p.battingHand);
                    if (cricketRolesNeedBattingHand(roles) && !hand) {
                      alert(`Please select batting hand for player ${i + 1}.`);
                      return;
                    }
                    if (cricketRolesNeedBowling(roles) && !p.bowlingType?.trim()) {
                      alert(`Please select bowling style for player ${i + 1}.`);
                      return;
                    }
                  }
                }
              }
              nextStep();
            }}
            className={`animate-fade-in delay-100`}
          >
            <div className={styles.playersHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem' }}>
              <div>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>Add Player Details</h2>
                <p style={{ color: '#94a3b8', marginTop: '0.25rem' }}>Fill in details for your team members</p>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1.2rem', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1', letterSpacing: '0.02em' }}>Total Players to Register:</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button 
                    type="button"
                    disabled={playerCount <= 1}
                    onClick={() => handlePlayerCountChange(playerCount - 1)}
                    style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '50%', 
                      border: '1px solid rgba(255,255,255,0.15)', 
                      background: playerCount <= 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)', 
                      color: playerCount <= 1 ? '#475569' : '#ffffff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      cursor: playerCount <= 1 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (playerCount > 1) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (playerCount > 1) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      }
                    }}
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>

                  <span style={{ 
                    minWidth: '24px', 
                    textAlign: 'center', 
                    fontSize: '1.25rem', 
                    fontWeight: 700, 
                    color: 'white',
                    fontFamily: 'monospace'
                  }}>
                    {playerCount}
                  </span>

                  <button 
                    type="button"
                    disabled={playerCount >= (tournament.maxPlayers || 10)}
                    onClick={() => handlePlayerCountChange(playerCount + 1)}
                    style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '50%', 
                      border: '1px solid rgba(255,255,255,0.15)', 
                      background: playerCount >= (tournament.maxPlayers || 10) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.08)', 
                      color: playerCount >= (tournament.maxPlayers || 10) ? '#475569' : '#ffffff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      cursor: playerCount >= (tournament.maxPlayers || 10) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (playerCount < (tournament.maxPlayers || 10)) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (playerCount < (tournament.maxPlayers || 10)) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      }
                    }}
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.playersList}>
              {teamPlayers.slice(0, playerCount).map((player, idx) => (
                <div key={idx} className={`glass-panel ${styles.playerCard} animate-slide-in-right delay-${Math.min(idx * 100, 400)}`}>
                  <div className={styles.playerHeader}>
                    <div className={styles.playerAvatar}>
                      <ImageIcon size={20} />
                    </div>
                    <h3>Player {idx + 1}</h3>
                  </div>
                  
                  <div className={styles.formGrid}>
                    {/* Photo Field */}
                    {config.photo?.enabled && (
                      <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                        <label>Player Photo {config.photo.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          {player.photo ? (
                            <img src={player.photo} alt="Preview" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                          ) : (
                            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ImageIcon size={24} color="#64748b" />
                            </div>
                          )}
                          <input 
                            type="file" 
                            accept="image/*"
                            required={config.photo.required && !player.photo}
                            onChange={(e) => handlePhotoUpload(e, true, idx)}
                            style={{ 
                              padding: '0.5rem', 
                              background: 'rgba(255,255,255,0.02)', 
                              border: '1px dashed var(--border)',
                              borderRadius: 'var(--radius-md)',
                              color: '#94a3b8',
                              flex: 1
                            }} 
                          />
                        </div>
                      </div>
                    )}

                    {/* Core Full Name Field - Always On */}
                    <div className={styles.formGroup}>
                      <label>Full Name <span style={{ color: 'var(--error)' }}>*</span></label>
                      <input 
                        type="text" 
                        required 
                        placeholder="Enter full name" 
                        value={player.name || ''} 
                        onChange={e => handleTeamPlayerChange(idx, 'name', e.target.value)} 
                      />
                    </div>

                    {/* Email Field */}
                    {config.email?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Email {config.email.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="email" 
                          required={config.email.required} 
                          placeholder="your.email@domain.com" 
                          value={player.email || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'email', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Phone Field */}
                    {config.phone?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Phone Number {config.phone.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="tel" 
                          pattern="[0-9]{10}"
                          maxLength={10}
                          minLength={10}
                          required={config.phone.required} 
                          placeholder="10-digit mobile (No +91 or 0)" 
                          value={player.phone || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'phone', formatPhoneNumber(e.target.value))} 
                        />
                      </div>
                    )}

                    {/* Emergency Contact Field */}
                    {config.emergencyContact?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Emergency Contact {config.emergencyContact.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="tel" 
                          pattern="[0-9]{10}"
                          maxLength={10}
                          minLength={10}
                          required={config.emergencyContact.required} 
                          placeholder="Emergency number (No +91 or 0)" 
                          value={player.emergencyContact || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'emergencyContact', formatPhoneNumber(e.target.value))} 
                        />
                      </div>
                    )}

                    {/* Date of Birth Field */}
                    {config.dob?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Date of Birth {config.dob.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="date" 
                          required={config.dob.required} 
                          value={player.dob || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'dob', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Age Field */}
                    {config.age?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Age {config.age.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="number" 
                          required={config.age.required} 
                          placeholder="Player age" 
                          value={player.age || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'age', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Aadhar Number Field */}
                    {config.aadhar?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Aadhar Number {config.aadhar.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="text" 
                          required={config.aadhar.required} 
                          placeholder="12-digit Aadhaar" 
                          value={player.aadhar || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'aadhar', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Gender Dropdown Field */}
                    {config.gender?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Gender {config.gender.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <select 
                          required={config.gender.required} 
                          value={player.gender || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'gender', e.target.value)}
                          style={{
                            padding: '0.75rem',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">-- Select Gender --</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    )}

              {/* Jersey Name Field */}
                    {config.jerseyName?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Jersey Name {config.jerseyName.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="text" 
                          required={config.jerseyName.required} 
                          placeholder="Name on Jersey" 
                          value={player.jerseyName || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'jerseyName', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Jersey Number Field */}
                    {config.jerseyNumber?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Jersey Number {config.jerseyNumber.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <input 
                          type="number" 
                          required={config.jerseyNumber.required} 
                          placeholder="Jersey No" 
                          value={player.jerseyNumber || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'jerseyNumber', e.target.value)} 
                        />
                      </div>
                    )}

                    {/* Jersey Size Dropdown Field */}
                    {config.jerseySize?.enabled && (
                      <div className={styles.formGroup}>
                        <label>Jersey Size {config.jerseySize.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                        <select 
                          required={config.jerseySize.required} 
                          value={player.jerseySize || ''} 
                          onChange={e => handleTeamPlayerChange(idx, 'jerseySize', e.target.value)}
                          style={{
                            padding: '0.75rem',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">-- Select Size --</option>
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                          <option value="XXXL">XXXL</option>
                        </select>
                      </div>
                    )}



                    {/* RENDER CUSTOM FORM BUILDER QUESTIONS FOR THIS TEAM PLAYER */}
                    {tournament.customFields?.map((field: any) => (
                      <div key={field.id} className={styles.formGroup}>
                        <label>
                          {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            value={player.customValues?.[field.label] || ''}
                            required={field.required}
                            onChange={e => handleTeamPlayerCustomValueChange(idx, field.label, e.target.value)}
                            style={{
                              padding: '0.75rem',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              color: 'white',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="">-- Select {field.label} --</option>
                            {(field.options || '').split(',').map((opt: string) => {
                              const trimmed = opt.trim();
                              return <option key={trimmed} value={trimmed}>{trimmed}</option>;
                            })}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            placeholder={`Enter your ${field.label.toLowerCase()}`}
                            required={field.required}
                            value={player.customValues?.[field.label] || ''}
                            onChange={e => handleTeamPlayerCustomValueChange(idx, field.label, e.target.value)}
                          />
                        )}
                      </div>
                    ))}

                    {/* Sports profile — cricket UI on team roster */}
                    {isSportsProfileShown(config.cricketProfile) && isCricketSport(tournament) && (
                      <div className={styles.cricketBlock}>
                        <div className={styles.cricketRoleTitle}>Playing role (player {idx + 1})</div>
                        <p className={styles.cricketRoleHint}>
                          Select one or more roles. Batting hand applies for batsman, wicketkeeper, or all-rounder;
                          bowling style for bowler or all-rounder (both sections if you pick e.g. batsman and bowler).
                        </p>
                        <div
                          className={styles.roleChipRow}
                          role="group"
                          aria-label={`Playing roles player ${idx + 1}`}
                          aria-multiselectable="true"
                        >
                          {CRICKET_ROLES.map((r) => {
                            const selected = parseCricketRoles(player.role).includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                aria-pressed={selected}
                                className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                                onClick={() => handleTeamPlayerSportRoleToggle(idx, r)}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>

                        {cricketRolesNeedBattingHand(parseCricketRoles(player.role)) && (
                          <div className="animate-fade-in">
                            <div className={styles.cricketSubLabel}>Batting hand</div>
                            <div className={styles.segmentWrap} role="group" aria-label="Batting hand">
                              {BATTING_HANDS.map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  className={`${styles.segmentBtn} ${normalizeBattingHandUi(player.battingHand) === h ? styles.segmentBtnActive : ''}`}
                                  onClick={() => handleTeamPlayerChange(idx, 'battingHand', h)}
                                >
                                  {h}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {cricketRolesNeedBowling(parseCricketRoles(player.role)) && (
                          <div className="animate-fade-in">
                            <div className={styles.cricketSubLabel}>Bowling style (Fast / Spin, left or right arm)</div>
                            <div className={styles.bowlingGrid}>
                              {BOWLING_STYLES.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`${styles.bowlingChip} ${player.bowlingType === opt ? styles.bowlingChipActive : ''}`}
                                  onClick={() => handleTeamPlayerChange(idx, 'bowlingType', opt)}
                                >
                                  {player.bowlingType === opt ? (
                                    <span className={styles.bowlingChipMark}>✓</span>
                                  ) : null}
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isSportsProfileShown(config.cricketProfile) && isFootballSport(tournament) && (
                      <div className={styles.cricketBlock}>
                        <div className={styles.cricketRoleTitle}>Position (player {idx + 1})</div>
                        <p className={styles.cricketRoleHint}>
                          Select one or more positions (e.g. midfielder and winger). You can pick multiple chips.
                        </p>
                        <div
                          className={styles.roleChipRow}
                          role="group"
                          aria-label={`Football positions player ${idx + 1}`}
                          aria-multiselectable="true"
                        >
                          {FOOTBALL_ROLES.map((r) => {
                            const selected = parseSportRoles(tournament?.sport, player.role).includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                aria-pressed={selected}
                                className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                                onClick={() => handleTeamPlayerSportRoleToggle(idx, r)}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isSportsProfileShown(config.cricketProfile) && !usesStructuredSportsProfile(tournament) && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Playing role {config.cricketProfile.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                          <select
                            required={config.cricketProfile.required}
                            value={player.role || ''}
                            onChange={(e) => handleTeamPlayerChange(idx, 'role', e.target.value)}
                            style={{
                              padding: '0.75rem',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              color: 'white',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">-- Select playing role --</option>
                            <option value="Batsman">Batsman</option>
                            <option value="Bowler">Bowler</option>
                            <option value="All-rounder">All-rounder</option>
                            <option value="Wicketkeeper">Wicketkeeper</option>
                          </select>
                        </div>

                        {(player.role === 'Batsman' || player.role === 'Wicketkeeper') && (
                          <div className={styles.formGroup}>
                            <label>Batting hand</label>
                            <select
                              value={player.battingHand || ''}
                              onChange={(e) => handleTeamPlayerChange(idx, 'battingHand', e.target.value)}
                              style={{
                                padding: '0.75rem',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'white',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">-- Select hand --</option>
                              <option value="Right-handed">Right-handed</option>
                              <option value="Left-handed">Left-handed</option>
                            </select>
                          </div>
                        )}

                        {player.role === 'Bowler' && (
                          <div className={styles.formGroup}>
                            <label>Bowling type</label>
                            <select
                              value={player.bowlingType || ''}
                              onChange={(e) => handleTeamPlayerChange(idx, 'bowlingType', e.target.value)}
                              style={{
                                padding: '0.75rem',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'white',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">-- Select bowling style --</option>
                              <option value="Fast Bowler">Fast bowler</option>
                              <option value="Spinner">Spinner</option>
                            </select>
                          </div>
                        )}

                        {player.role === 'All-rounder' && (
                          <div className={styles.formGroup}>
                            <label>All-rounder specialty</label>
                            <select
                              value={player.allRounderType || ''}
                              onChange={(e) => handleTeamPlayerChange(idx, 'allRounderType', e.target.value)}
                              style={{
                                padding: '0.75rem',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'white',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="">-- Select specialty --</option>
                              <option value="Batting All-rounder">Batting all-rounder</option>
                              <option value="Bowling All-rounder">Bowling all-rounder</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}

                  </div>
                </div>
              ))}
            </div>

            <div className={`glass-panel ${styles.card}`} style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Total Registration Fee</h3>
                  <p style={{ color: '#94a3b8' }}>To be paid securely via Razorpay</p>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-color)' }}>
                  ₹{(Number(tournament.fee) || 0).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }}>Next: Review & Pay</button>
              </div>
            </div>
          </form>
        )}

        {/* ================= TEAM FLOW: STEP 4 (PAYMENT Summary) ================= */}
        {isTeam && step === 4 && (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
              Team Registration Summary & Payment
            </h2>
            
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '2.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--theme-color)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} /> Team Details Summary
              </h3>
              <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Team Name:</strong> {teamInfo.name}</p>
              <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Manager/Representative:</strong> {teamInfo.representative}</p>
              <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Contact Info:</strong> {teamInfo.contact}</p>
              <p style={{ margin: '0.4rem 0', color: '#cbd5e1', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}><strong>Roster Size:</strong> {playerCount} players</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--theme-color)', fontWeight: 600 }}>Roster Details:</p>
                {teamPlayers.slice(0, playerCount).map((p, idx) => (
                  <div key={idx} style={{ fontSize: '0.9rem', color: '#cbd5e1', paddingLeft: '0.5rem', borderLeft: '2px solid var(--theme-color)' }}>
                    <strong>Player {idx + 1}:</strong> {p.name || 'Unnamed'} 
                    {p.customValues && Object.keys(p.customValues).length > 0 && (
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                        ({Object.entries(p.customValues).map(([k, v]) => `${k}: ${v}`).join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '2.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Team Entry Fee</h3>
                <p style={{ color: '#94a3b8' }}>Secure transaction via Razorpay gateway</p>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-color)' }}>
                ₹{(Number(tournament.fee) || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setStep(3)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
              <button
                onClick={handlePayment}
                className="btn-primary"
                style={{ flex: 2 }}
                disabled={submitting}
              >
                {submitting
                  ? 'Processing…'
                  : `Pay ₹${(Number(tournament.fee) || 0).toLocaleString()} & Complete Registration`}
              </button>
            </div>
          </div>
        )}

        {/* ================= INDIVIDUAL FLOW: STEP 2 (PLAYER DETAILED CRICKET INFO + CUSTOM FIELDS) ================= */}
        {!isTeam && step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (config.cricketProfile?.required) {
                if (!usesStructuredSportsProfile(tournament)) {
                  if (!individualPlayer.role?.trim()) {
                    alert('Please enter your playing role / position.');
                    return;
                  }
                } else {
                const roles = parseSportRoles(tournament?.sport, individualPlayer.role);
                if (roles.length === 0) {
                  alert(
                    isFootballSport(tournament)
                      ? 'Please select at least one position.'
                      : 'Please select at least one playing role.',
                  );
                  return;
                }
                if (isCricketSport(tournament)) {
                  const hand = normalizeBattingHandUi(individualPlayer.battingHand);
                  if (cricketRolesNeedBattingHand(roles) && !hand) {
                    alert('Please select your batting hand.');
                    return;
                  }
                  if (cricketRolesNeedBowling(roles) && !individualPlayer.bowlingType?.trim()) {
                    alert('Please select your bowling style.');
                    return;
                  }
                }
                }
              }
              nextStep();
            }}
            className={`glass-panel animate-fade-in delay-100 ${styles.card}`}
          >
            <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
              {isSportsProfileShown(config.cricketProfile) && isCricketSport(tournament)
                ? 'Personal & sports (cricket) details'
                : isSportsProfileShown(config.cricketProfile) && isFootballSport(tournament)
                  ? 'Personal & sports (football) details'
                  : isSportsProfileShown(config.cricketProfile)
                    ? 'Personal & playing role'
                    : 'Personal information'}
            </h2>

            {hasSponsors ? (
              <RegistrationSponsors sponsors={tournament.sponsors} variant="form" />
            ) : null}
            
            <div className={styles.formGrid}>
              {/* Photo Field */}
              {config.photo?.enabled && (
                <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Your photo {config.photo.required && <span style={{ color: 'var(--error)' }}>*</span>}
                  </label>
                  <div className={styles.fileUploadRow}>
                    {individualPlayer.photo ? (
                      <img src={individualPlayer.photo} alt="Preview" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                    ) : (
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={24} color="#64748b" />
                      </div>
                    )}
                    <input
                      ref={individualPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className={styles.fileInputHidden}
                      required={config.photo.required && !individualPlayer.photo}
                      onChange={(e) => handlePhotoUpload(e, false)}
                    />
                    <button
                      type="button"
                      className={styles.fileChooseBtn}
                      onClick={() => individualPhotoInputRef.current?.click()}
                    >
                      Choose file
                    </button>
                    <span className={styles.fileNameHint}>{individualPhotoFileLabel}</span>
                  </div>
                </div>
              )}

              {/* Core Full Name Field - Always On */}
              <div className={styles.formGroup}>
                <label>Full name <span style={{ color: 'var(--error)' }}>*</span></label>
                <input 
                  type="text" 
                  required 
                  placeholder="Enter your full name" 
                  value={individualPlayer.name || ''} 
                  onChange={e => handleIndividualInputChange('name', e.target.value)} 
                />
              </div>

              {/* Email Field */}
              {config.email?.enabled && (
                <div className={styles.formGroup}>
                  <label>Email address {config.email.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="email" 
                    required={config.email.required} 
                    placeholder="your.email@domain.com" 
                    value={individualPlayer.email || ''} 
                    onChange={e => handleIndividualInputChange('email', e.target.value)} 
                  />
                </div>
              )}

              {/* Phone Field */}
              {config.phone?.enabled && (
                <div className={styles.formGroup}>
                  <label>Phone number {config.phone.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="tel" 
                    pattern="[0-9]{10}"
                    maxLength={10}
                    minLength={10}
                    required={config.phone.required} 
                    placeholder="10-digit mobile (No +91 or 0)" 
                    value={individualPlayer.phone || ''} 
                    onChange={e => handleIndividualInputChange('phone', formatPhoneNumber(e.target.value))} 
                  />
                </div>
              )}

              {/* Emergency Contact Field */}
              {config.emergencyContact?.enabled && (
                <div className={styles.formGroup}>
                  <label>Emergency Contact {config.emergencyContact.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="tel" 
                    pattern="[0-9]{10}"
                    maxLength={10}
                    minLength={10}
                    required={config.emergencyContact.required} 
                    placeholder="Emergency number (No +91 or 0)" 
                    value={individualPlayer.emergencyContact || ''} 
                    onChange={e => handleIndividualInputChange('emergencyContact', formatPhoneNumber(e.target.value))} 
                  />
                </div>
              )}

              {/* Date of Birth Field */}
              {config.dob?.enabled && (
                <div className={styles.formGroup}>
                  <label>Date of Birth {config.dob.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="date" 
                    required={config.dob.required} 
                    value={individualPlayer.dob || ''} 
                    onChange={e => handleIndividualInputChange('dob', e.target.value)} 
                  />
                </div>
              )}

              {/* Age Field */}
              {config.age?.enabled && (
                <div className={styles.formGroup}>
                  <label>Age {config.age.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="number" 
                    required={config.age.required} 
                    placeholder="Your age" 
                    value={individualPlayer.age || ''} 
                    onChange={e => handleIndividualInputChange('age', e.target.value)} 
                  />
                </div>
              )}

              {/* Aadhar Number Field */}
              {config.aadhar?.enabled && (
                <div className={styles.formGroup}>
                  <label>Aadhar Number {config.aadhar.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="text" 
                    required={config.aadhar.required} 
                    placeholder="12-digit Aadhaar number" 
                    value={individualPlayer.aadhar || ''} 
                    onChange={e => handleIndividualInputChange('aadhar', e.target.value)} 
                  />
                </div>
              )}

              {/* Gender Dropdown Field */}
              {config.gender?.enabled && (
                <div className={styles.formGroup}>
                  <label>Gender {config.gender.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <select 
                    required={config.gender.required} 
                    value={individualPlayer.gender || ''} 
                    onChange={e => handleIndividualInputChange('gender', e.target.value)}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Select Gender --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              )}


              {/* Jersey Name Field */}
              {config.jerseyName?.enabled && (
                <div className={styles.formGroup}>
                  <label>Jersey Name {config.jerseyName.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="text" 
                    required={config.jerseyName.required} 
                    placeholder="Name on jersey" 
                    value={individualPlayer.jerseyName || ''} 
                    onChange={e => handleIndividualInputChange('jerseyName', e.target.value)} 
                  />
                </div>
              )}

              {/* Jersey Number Field */}
              {config.jerseyNumber?.enabled && (
                <div className={styles.formGroup}>
                  <label>Jersey Number {config.jerseyNumber.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <input 
                    type="number" 
                    required={config.jerseyNumber.required} 
                    placeholder="Jersey digits" 
                    value={individualPlayer.jerseyNumber || ''} 
                    onChange={e => handleIndividualInputChange('jerseyNumber', e.target.value)} 
                  />
                </div>
              )}

              {/* Jersey Size Dropdown Field */}
              {config.jerseySize?.enabled && (
                <div className={styles.formGroup}>
                  <label>Jersey Size {config.jerseySize.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                  <select 
                    required={config.jerseySize.required} 
                    value={individualPlayer.jerseySize || ''} 
                    onChange={e => handleIndividualInputChange('jerseySize', e.target.value)}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Select Size --</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                    <option value="XXXL">XXXL</option>
                  </select>
                </div>
              )}



              {/* RENDER DYNAMIC CUSTOM FIELDS CONFIGURED BY DRAFT BUILDER */}
              {tournament.customFields?.map((field: any) => (
                <div key={field.id} className={styles.formGroup}>
                  <label>
                    {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      value={individualPlayer.customValues?.[field.label] || ''}
                      required={field.required}
                      onChange={e => handleIndividualCustomValueChange(field.label, e.target.value)}
                      style={{
                        padding: '0.75rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Select {field.label} --</option>
                      {(field.options || '').split(',').map((opt: string) => {
                        const trimmed = opt.trim();
                        return <option key={trimmed} value={trimmed}>{trimmed}</option>;
                      })}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      placeholder={`Enter your ${field.label.toLowerCase()}`}
                      required={field.required}
                      value={individualPlayer.customValues?.[field.label] || ''}
                      onChange={e => handleIndividualCustomValueChange(field.label, e.target.value)}
                    />
                  )}
                </div>
              ))}

              {isSportsProfileShown(config.cricketProfile) && isCricketSport(tournament) && (
                <div className={styles.cricketBlock} style={{ gridColumn: '1 / -1' }}>
                  <div className={styles.cricketRoleTitle}>Playing role</div>
                  <p className={styles.cricketRoleHint}>
                    Select one or more roles. Batting hand applies for batsman, wicketkeeper, or all-rounder;
                    bowling style for bowler or all-rounder (both sections if you pick e.g. batsman and bowler).
                  </p>
                  <div
                    className={styles.roleChipRow}
                    role="group"
                    aria-label="Playing roles"
                    aria-multiselectable="true"
                  >
                    {CRICKET_ROLES.map((r) => {
                      const selected = parseCricketRoles(individualPlayer.role).includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={selected}
                          className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                          onClick={() => handleIndividualSportRoleToggle(r)}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>

                  {cricketRolesNeedBattingHand(parseCricketRoles(individualPlayer.role)) && (
                    <div className="animate-fade-in">
                      <div className={styles.cricketSubLabel}>Batting hand</div>
                      <div className={styles.segmentWrap} role="group" aria-label="Batting hand">
                        {BATTING_HANDS.map((h) => (
                          <button
                            key={h}
                            type="button"
                            className={`${styles.segmentBtn} ${normalizeBattingHandUi(individualPlayer.battingHand) === h ? styles.segmentBtnActive : ''}`}
                            onClick={() => handleIndividualInputChange('battingHand', h)}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {cricketRolesNeedBowling(parseCricketRoles(individualPlayer.role)) && (
                    <div className="animate-fade-in">
                      <div className={styles.cricketSubLabel}>Bowling style (Fast / Spin, left or right arm)</div>
                      <div className={styles.bowlingGrid}>
                        {BOWLING_STYLES.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`${styles.bowlingChip} ${individualPlayer.bowlingType === opt ? styles.bowlingChipActive : ''}`}
                            onClick={() => handleIndividualInputChange('bowlingType', opt)}
                          >
                            {individualPlayer.bowlingType === opt ? (
                              <span className={styles.bowlingChipMark}>✓</span>
                            ) : null}
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isSportsProfileShown(config.cricketProfile) && isFootballSport(tournament) && (
                <div className={styles.cricketBlock} style={{ gridColumn: '1 / -1' }}>
                  <div className={styles.cricketRoleTitle}>Position</div>
                  <p className={styles.cricketRoleHint}>
                    Select one or more positions (e.g. midfielder and winger). You can pick multiple chips.
                  </p>
                  <div
                    className={styles.roleChipRow}
                    role="group"
                    aria-label="Football positions"
                    aria-multiselectable="true"
                  >
                    {FOOTBALL_ROLES.map((r) => {
                      const selected = parseSportRoles(tournament?.sport, individualPlayer.role).includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={selected}
                          className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                          onClick={() => handleIndividualSportRoleToggle(r)}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isSportsProfileShown(config.cricketProfile) && !usesStructuredSportsProfile(tournament) && (
                <>
                  <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                    <label>Playing role {config.cricketProfile.required && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                    {config.cricketProfile.required ? (
                      <input
                        type="text"
                        required
                        placeholder="Enter your playing role / position"
                        value={individualPlayer.role || ''}
                        onChange={(e) => handleIndividualInputChange('role', e.target.value)}
                      />
                    ) : (
                      <select
                        value={individualPlayer.role || ''}
                        onChange={(e) => handleIndividualInputChange('role', e.target.value)}
                        style={{
                          padding: '0.75rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">-- Select playing role --</option>
                        <option value="Batsman">Batsman</option>
                        <option value="Bowler">Bowler</option>
                        <option value="All-rounder">All-rounder</option>
                        <option value="Wicketkeeper">Wicketkeeper</option>
                      </select>
                    )}
                  </div>

                  {(individualPlayer.role === 'Batsman' || individualPlayer.role === 'Wicketkeeper') && (
                    <div className={styles.formGroup}>
                      <label>Batting hand</label>
                      <select
                        value={individualPlayer.battingHand || ''}
                        onChange={(e) => handleIndividualInputChange('battingHand', e.target.value)}
                        style={{
                          padding: '0.75rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">-- Select hand --</option>
                        <option value="Right-handed">Right-handed</option>
                        <option value="Left-handed">Left-handed</option>
                      </select>
                    </div>
                  )}

                  {individualPlayer.role === 'Bowler' && (
                    <div className={styles.formGroup}>
                      <label>Bowling type</label>
                      <select
                        value={individualPlayer.bowlingType || ''}
                        onChange={(e) => handleIndividualInputChange('bowlingType', e.target.value)}
                        style={{
                          padding: '0.75rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">-- Select bowling style --</option>
                        <option value="Fast Bowler">Fast bowler</option>
                        <option value="Spinner">Spinner</option>
                      </select>
                    </div>
                  )}

                  {individualPlayer.role === 'All-rounder' && (
                    <div className={styles.formGroup}>
                      <label>All-rounder specialty</label>
                      <select
                        value={individualPlayer.allRounderType || ''}
                        onChange={(e) => handleIndividualInputChange('allRounderType', e.target.value)}
                        style={{
                          padding: '0.75rem',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">-- Select specialty --</option>
                        <option value="Batting All-rounder">Batting all-rounder</option>
                        <option value="Bowling All-rounder">Bowling all-rounder</option>
                      </select>
                    </div>
                  )}
                </>
              )}


            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem' }}>
              <button type="button" onClick={() => setStep(1)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
              <button type="submit" className="btn-primary" style={{ flex: 2 }}>Next: Review & Pay</button>
            </div>
          </form>
        )}

        {/* ================= INDIVIDUAL FLOW: STEP 3 (PAYMENT / SUMMARY) ================= */}
        {!isTeam && step === 3 && (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={styles.cardTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
              Registration Summary & Payment
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--theme-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={18} /> Personal Info
                </h3>
                <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Name:</strong> {individualPlayer.name}</p>
                {(!config.email || config.email.enabled) && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Email:</strong> {individualPlayer.email || '-'}</p>
                )}
                {config.phone?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Phone:</strong> {individualPlayer.phone || '-'}</p>
                )}
                {config.emergencyContact?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Emergency Contact:</strong> {individualPlayer.emergencyContact || '-'}</p>
                )}
                {config.dob?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>DOB:</strong> {individualPlayer.dob || '-'}</p>
                )}
                {config.age?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Age:</strong> {individualPlayer.age || '-'}</p>
                )}
                {config.aadhar?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Aadhaar:</strong> {individualPlayer.aadhar || '-'}</p>
                )}
                {config.gender?.enabled && (
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Gender:</strong> {individualPlayer.gender || '-'}</p>
                )}
                
                {/* Show Jersey Info if enabled */}
                {(config.jerseyName?.enabled || config.jerseyNumber?.enabled || config.jerseySize?.enabled) && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--theme-color)', fontWeight: 600, margin: '0.2rem 0' }}>Jersey Details:</p>
                    {config.jerseyName?.enabled && (
                      <p style={{ margin: '0.2rem 0 0.2rem 0.5rem', color: '#cbd5e1', fontSize: '0.85rem' }}><strong>Jersey Name:</strong> {individualPlayer.jerseyName || '-'}</p>
                    )}
                    {config.jerseyNumber?.enabled && (
                      <p style={{ margin: '0.2rem 0 0.2rem 0.5rem', color: '#cbd5e1', fontSize: '0.85rem' }}><strong>Jersey Number:</strong> {individualPlayer.jerseyNumber || '-'}</p>
                    )}
                    {config.jerseySize?.enabled && (
                      <p style={{ margin: '0.2rem 0 0.2rem 0.5rem', color: '#cbd5e1', fontSize: '0.85rem' }}><strong>Jersey Size:</strong> {individualPlayer.jerseySize || '-'}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Sports profile + custom fields */}
              {(isSportsProfileShown(config.cricketProfile) || (tournament.customFields && tournament.customFields.length > 0)) && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--theme-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Award size={18} /> Sports profile & custom fields
                  </h3>
                  
                  {isSportsProfileShown(config.cricketProfile) && (
                    <>
                      {(() => {
                        const reviewRoles = parseSportRoles(tournament?.sport, individualPlayer.role);
                        if (isFootballSport(tournament)) {
                          return (
                            <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                              <strong>Position{reviewRoles.length > 1 ? 's' : ''}:</strong>{' '}
                              {reviewRoles.length ? reviewRoles.join(', ') : 'Not selected'}
                            </p>
                          );
                        }
                        const combinedCricket =
                          isCricketSport(tournament) && cricketRolesNeedCombinedDetail(individualPlayer.role);
                        return (
                          <>
                            <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                              <strong>Playing role{reviewRoles.length > 1 ? 's' : ''}:</strong>{' '}
                              {reviewRoles.length ? reviewRoles.join(', ') : 'Not selected'}
                            </p>
                            {combinedCricket ? (
                              <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                                <strong>Style:</strong>{' '}
                                {[normalizeBattingHandUi(individualPlayer.battingHand), individualPlayer.bowlingType]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </p>
                            ) : (
                              <>
                                {cricketRolesNeedBattingHand(reviewRoles) && (
                                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                                    <strong>Batting hand:</strong>{' '}
                                    {normalizeBattingHandUi(individualPlayer.battingHand) ||
                                      individualPlayer.battingHand ||
                                      '—'}
                                  </p>
                                )}
                                {cricketRolesNeedBowling(reviewRoles) && (
                                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                                    <strong>Bowling style:</strong> {individualPlayer.bowlingType || '—'}
                                  </p>
                                )}
                                {!isCricketSport(tournament) && individualPlayer.role === 'All-rounder' && (
                                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                                    <strong>Specialty:</strong> {individualPlayer.allRounderType || '—'}
                                  </p>
                                )}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}

                  {/* SHOW ANSWERS TO CUSTOM FIELD BUILDER QUESTIONS */}
                  {individualPlayer.customValues && Object.entries(individualPlayer.customValues).map(([k, v]) => (
                    <p key={k} style={{ margin: '0.4rem 0', color: '#cbd5e1' }}>
                      <strong>{k}:</strong> {v as string || 'Not Answered'}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '2.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Solo Entry Fee</h3>
                <p style={{ color: '#94a3b8' }}>Secure transaction via Razorpay gateway</p>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-color)' }}>
                ₹{(Number(tournament.fee) || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Back</button>
              <button
                onClick={handlePayment}
                className="btn-primary"
                style={{ flex: 2 }}
                disabled={submitting}
              >
                {submitting
                  ? 'Processing…'
                  : `Pay ₹${(Number(tournament.fee) || 0).toLocaleString()} & Complete Registration`}
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4/5: SUCCESS (BOTH FLOWS) ================= */}
        {((isTeam && step === 5) || (!isTeam && step === 4)) && (
          <div className={`glass-panel animate-scale-up ${styles.card} ${styles.successCard}`}>
            <CheckCircle2 size={64} style={{ color: 'var(--success)', marginBottom: '1.5rem' }} />
            <h2 className={styles.cardTitle} style={{ fontSize: '2rem' }}>Registration Successful!</h2>
            
            {isTeam ? (
              <>
                <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem', maxWidth: '500px' }}>
                  Your team <strong>{teamInfo.name}</strong> has been successfully registered for {tournament.name}.
                </p>
                <div className={styles.successMeta} style={{ width: '100%', maxWidth: '500px' }}>
                  <p style={{ margin: '0.4rem 0' }}><strong>Representative:</strong> {teamInfo.representative}</p>
                  <p style={{ margin: '0.4rem 0' }}><strong>Contact Mobile:</strong> {teamInfo.contact}</p>
                  <p style={{ margin: '0.4rem 0' }}><strong>Total Roster size:</strong> {playerCount} players</p>
                  <p style={{ margin: '0.4rem 0' }}><strong>Payment Reference:</strong> pay_TEAM_MOCK12345XYZ</p>
                  <p style={{ margin: '0.4rem 0', color: '#10b981' }}>Complete fixture schedules will be shared shortly.</p>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem', maxWidth: '500px' }}>
                  Congratulations <strong>{individualPlayer.name}</strong>! You have been successfully registered for{' '}
                  <strong>{tournament.name}</strong>
                  {parseSportRoles(tournament?.sport, individualPlayer.role).length ? (
                    <>
                      {' '}
                      as <strong>
                        {parseSportRoles(tournament?.sport, individualPlayer.role).join(', ')}
                      </strong>
                      .
                    </>
                  ) : (
                    '.'
                  )}
                </p>
                <div className={styles.successMeta} style={{ width: '100%', maxWidth: '500px' }}>
                  <p style={{ margin: '0.4rem 0' }}>
                    <strong>
                      {isFootballSport(tournament)
                        ? `Draft position${parseSportRoles(tournament?.sport, individualPlayer.role).length > 1 ? 's' : ''}:`
                        : `Draft role${parseSportRoles(tournament?.sport, individualPlayer.role).length > 1 ? 's' : ''}:`}
                    </strong>{' '}
                    {parseSportRoles(tournament?.sport, individualPlayer.role).length
                      ? parseSportRoles(tournament?.sport, individualPlayer.role).join(', ')
                      : individualPlayer.role || '—'}
                  </p>
                  {!isFootballSport(tournament) && isCricketSport(tournament) && cricketRolesNeedCombinedDetail(individualPlayer.role) ? (
                    <p style={{ margin: '0.4rem 0' }}>
                      <strong>Profile:</strong>{' '}
                      {[normalizeBattingHandUi(individualPlayer.battingHand), individualPlayer.bowlingType]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  ) : !isFootballSport(tournament) ? (
                    <>
                      {cricketRolesNeedBattingHand(parseCricketRoles(individualPlayer.role)) &&
                        individualPlayer.battingHand && (
                          <p style={{ margin: '0.4rem 0' }}>
                            <strong>Batting:</strong> {individualPlayer.battingHand}
                          </p>
                        )}
                      {cricketRolesNeedBowling(parseCricketRoles(individualPlayer.role)) &&
                        individualPlayer.bowlingType && (
                          <p style={{ margin: '0.4rem 0' }}>
                            <strong>Bowling:</strong> {individualPlayer.bowlingType}
                          </p>
                        )}
                      {individualPlayer.allRounderType && (
                        <p style={{ margin: '0.4rem 0' }}>
                          <strong>Specialty:</strong> {individualPlayer.allRounderType}
                        </p>
                      )}
                    </>
                  ) : null}
                  <p style={{ margin: '0.4rem 0' }}><strong>Payment Reference:</strong> pay_SOLO_MOCK12345XYZ</p>
                  <p style={{ margin: '0.4rem 0', color: '#10b981' }}>Jerseys and draft team details will be sent to <strong>{individualPlayer.email}</strong> shortly.</p>
                </div>
              </>
            )}
            
            <button className="btn-primary" style={{ marginTop: '2rem' }} onClick={() => window.location.href='/'}>
              Back to Home
            </button>
          </div>
        )}
          </>
        )}
      </div>

      {/* DUPLICATE REGISTRATION OVERLAY MODAL */}
      {duplicateData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem',
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.15)',
            borderRadius: '1.5rem',
            width: '100%',
            maxWidth: '680px',
            padding: '2.5rem',
            position: 'relative',
            color: 'white',
          }}>
            
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ 
                width: '4rem', 
                height: '4rem', 
                borderRadius: '50%', 
                background: 'rgba(245, 158, 11, 0.1)', 
                color: '#f59e0b', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 1rem auto',
                border: '2px solid rgba(245, 158, 11, 0.2)'
              }}>
                <AlertTriangle size={32} />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>Already Registered!</h2>
              <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                You are already registered for **{tournament.name}**. Below is your registration detail.
              </p>
            </div>

            {/* Details Section */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '1.5rem' }}>
              
              {/* Player Photo (If uploaded) */}
              {duplicateData.duplicatePlayer?.photo_url && (
                <div style={{ flexShrink: 0, margin: '0 auto' }}>
                  <img 
                    src={duplicateData.duplicatePlayer.photo_url} 
                    alt="Registered Player" 
                    style={{ 
                      width: '6.5rem', 
                      height: '6.5rem', 
                      borderRadius: '50%', 
                      objectFit: 'cover', 
                      border: '3px solid var(--theme-color)',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                    }} 
                  />
                </div>
              )}

              {/* Player Profile Details */}
              <div style={{ flex: 1, minWidth: '240px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
                  Player Profile
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.4rem 1rem', fontSize: '0.9rem', color: '#cbd5e1' }}>
                  <strong>Name:</strong> <span>{duplicateData.duplicatePlayer?.name}</span>
                  <strong>Email:</strong> <span>{duplicateData.duplicatePlayer?.email || '-'}</span>
                  {duplicateData.duplicatePlayer?.phone && (
                    <><strong>Phone:</strong> <span>{duplicateData.duplicatePlayer.phone}</span></>
                  )}
                  {duplicateData.duplicatePlayer?.dob && (
                    <><strong>DOB:</strong> <span>{duplicateData.duplicatePlayer.dob}</span></>
                  )}
                  {duplicateData.duplicatePlayer?.role && (
                    <><strong>Role:</strong> <span>{duplicateData.duplicatePlayer.role}</span></>
                  )}
                </div>
              </div>
            </div>

            {/* Team details & Roster (If team registration) */}
            {duplicateData.registration?.team_name && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--theme-color)', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.4rem' }}>
                  Team: {duplicateData.registration.team_name}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.3rem 1rem', fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '1rem' }}>
                  <strong>Representative:</strong> <span>{duplicateData.registration.representative}</span>
                  <strong>Contact:</strong> <span>{duplicateData.registration.contact}</span>
                </div>

                {/* Team Roster List */}
                {duplicateData.roster && duplicateData.roster.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>Team Roster Players:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                      {duplicateData.roster.map((player: any, idx: number) => (
                        <div 
                          key={player.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.03)', 
                            padding: '0.6rem 1rem', 
                            borderRadius: '0.5rem', 
                            border: '1px solid rgba(255,255,255,0.03)' 
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>#{idx + 1}</span>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{player.name}</span>
                          </div>
                          {player.role && (
                            <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '0.25rem' }}>
                              {player.role}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Registration ID prominently highlighted */}
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px dashed rgba(99, 102, 241, 0.3)', padding: '1rem 1.5rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Registration ID</div>
                <div style={{ fontSize: '1.05rem', fontFamily: 'monospace', fontWeight: 700, color: 'white', marginTop: '0.2rem', wordBreak: 'break-all' }}>
                  {duplicateData.registrationId}
                </div>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(duplicateData.registrationId);
                  alert('Registration ID copied to clipboard!');
                }}
                className="btn-secondary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8' }}
              >
                Copy
              </button>
            </div>

            {/* Action Button to Dismiss */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={() => setDuplicateData(null)} 
                className="btn-primary" 
                style={{ minWidth: '150px', background: '#f59e0b', borderColor: '#f59e0b', color: '#1e293b', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
