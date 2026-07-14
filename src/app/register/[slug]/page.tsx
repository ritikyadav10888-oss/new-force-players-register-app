'use client';

import { use, useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, MapPin, User, Image as ImageIcon, ChevronRight, CheckCircle2, Mail, Phone, Award, Users, AlertTriangle, Plus, Minus } from 'lucide-react';
import styles from './register.module.css';
import {
  allRounderTypeForCricketPayload,
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  cricketRolesNeedCombinedDetail,
  normalizeBattingHandUi,
  parseCricketRoles,
} from '@/lib/cricket-roles';
import { isSportsProfileShown, resolveSportsProfileForTournament, visibleFieldOrder, normalizeFieldOrder } from '@/lib/form-config';
import {
  isCricketSport,
  isFootballSport,
  parseSportRoles,
  toggleSportRoleString,
  usesStructuredSportsProfile,
} from '@/lib/sport-utils';
import { parseSponsorsFromTournament, sponsorHasDisplay } from '@/lib/sponsors';
import { RegistrationSponsors } from '@/components/tournament/RegistrationSponsors';
import { OrderedPlayerFields } from './OrderedPlayerFields';

interface PageProps {
  params: Promise<{ slug: string }>;
}

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
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [completedPaymentRef, setCompletedPaymentRef] = useState<string | null>(null);
  const confirmedPaymentIdRef = useRef<string | null>(null);
  const paymentCompletionLockRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);

  const draftKey = `fpr:draft:${slug}`;
  const paymentPersistKey = `fpr:payment:${slug}`;

  const readStoredPaymentRef = (): string | null => {
    if (confirmedPaymentIdRef.current?.trim()) return confirmedPaymentIdRef.current.trim();
    if (completedPaymentRef?.trim()) return completedPaymentRef.trim();
    try {
      return sessionStorage.getItem(paymentPersistKey)?.trim() || null;
    } catch {
      return null;
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  };

  const clearPaymentRef = () => {
    confirmedPaymentIdRef.current = null;
    setCompletedPaymentRef(null);
    try {
      sessionStorage.removeItem(paymentPersistKey);
    } catch {
      // ignore
    }
  };

  const persistPaymentRef = (paymentId: string | null) => {
    const trimmed = paymentId != null ? String(paymentId).trim() : '';
    if (!trimmed) return;
    confirmedPaymentIdRef.current = trimmed;
    setCompletedPaymentRef(trimmed);
    try {
      sessionStorage.setItem(paymentPersistKey, trimmed);
    } catch {
      // ignore
    }
  };

  const extractRazorpayPaymentId = (response: Record<string, unknown>): string | null => {
    const candidates = [
      response.razorpay_payment_id,
      response.payment_id,
      (response as { razorpayPaymentId?: string }).razorpayPaymentId,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  const finishRegistration = (
    result: {
      registration?: { razorpay_payment_id?: string | null; razorpay_order_id?: string | null };
      paymentReference?: string | null;
      razorpayOrderId?: string | null;
    },
    fallbackPaymentId?: string | null,
    razorpayOrderId?: string | null
  ) => {
    const id =
      result?.paymentReference ??
      result?.registration?.razorpay_payment_id ??
      fallbackPaymentId ??
      readStoredPaymentRef() ??
      null;
    const trimmed = id != null ? String(id).trim() : '';
    if (trimmed) persistPaymentRef(trimmed);
    clearDraft();

    const orderId =
      razorpayOrderId ||
      result?.razorpayOrderId ||
      result?.registration?.razorpay_order_id ||
      null;
    if (orderId) {
      fetch(`/api/register/pending?orderId=${encodeURIComponent(String(orderId))}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  };

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
  const [teamPhotoFileLabels, setTeamPhotoFileLabels] = useState<Record<number, string>>({});

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
        const minPlayers = Math.max(1, Math.min(maxPlayers, Number(data.min_players) || 1));
        const rawFormConfig =
          data.form_config &&
          typeof data.form_config === 'object' &&
          !Array.isArray(data.form_config)
            ? (data.form_config as Record<string, unknown>)
            : {};
        const tournamentSport = String(data.sport || 'Cricket');
        const customFieldsLoaded = data.custom_fields || [];
        const mergedFormConfig = {
          ...DEFAULT_FORM_CONFIG,
          ...rawFormConfig,
          cricketProfile: resolveSportsProfileForTournament(rawFormConfig, tournamentSport),
          fieldOrder: normalizeFieldOrder(rawFormConfig.fieldOrder, customFieldsLoaded),
        } as typeof DEFAULT_FORM_CONFIG & { fieldOrder?: string[] };
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
          minPlayers,
          theme: data.theme || '#6366f1',
          description: data.description ?? '',
          rules: data.rules ?? '',
          terms: data.terms ?? '',
          organizerName: data.organizer_name ?? '',
          organizerPhone: data.organizer_phone ?? '',
          registrationDeadline: data.registration_deadline,
          banner: data.banner_url || '/tournament-banner.png',
          customFields: customFieldsLoaded,
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

  // Restore payment ID on success screen (e.g. after refresh) for paid tournaments.
  useEffect(() => {
    if (!tournament?.id) return;
    const teamFlow = tournament.type === 'Team';
    const onSuccess = (teamFlow && step === 5) || (!teamFlow && step === 4);
    if (!onSuccess) return;
    const fee = Number(tournament.fee) || 0;
    if (fee <= 0) return;
    const stored = readStoredPaymentRef();
    if (stored) persistPaymentRef(stored);
  }, [step, tournament?.id, tournament?.fee, tournament?.type, paymentPersistKey]);

  // Restore saved draft after tournament loads.
  useEffect(() => {
    if (!tournament?.id) return;
    if (draftRestoredRef.current) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        draftRestoredRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as any;
      if (parsed?.tournamentId && parsed.tournamentId !== tournament.id) {
        draftRestoredRef.current = true;
        return;
      }

      if (typeof parsed?.step === 'number') {
        const teamFlow = tournament.type === 'Team';
        const maxStep = teamFlow ? 4 : 3;
        setStep(Math.min(Math.max(1, parsed.step), maxStep));
      }
      try {
        const savedPayment = sessionStorage.getItem(paymentPersistKey)?.trim();
        if (savedPayment) persistPaymentRef(savedPayment);
      } catch {
        // ignore
      }
      if (typeof parsed?.termsAccepted === 'boolean') setTermsAccepted(parsed.termsAccepted);
      if (parsed?.teamInfo && typeof parsed.teamInfo === 'object') {
        setTeamInfo((prev) => ({ ...prev, ...parsed.teamInfo }));
      }
      if (typeof parsed?.playerCount === 'number') setPlayerCount(parsed.playerCount);
      if (Array.isArray(parsed?.teamPlayers)) {
        setTeamPlayers(
          parsed.teamPlayers.map((p: any) => ({
            ...p,
            age: p?.dob ? calculateAge(String(p.dob)) : '',
          }))
        );
      }
      if (parsed?.individualPlayer && typeof parsed.individualPlayer === 'object') {
        setIndividualPlayer((prev: any) => {
          const merged = { ...prev, ...parsed.individualPlayer };
          return {
            ...merged,
            age: merged?.dob ? calculateAge(String(merged.dob)) : '',
          };
        });
      }
      draftRestoredRef.current = true;
    } catch {
      draftRestoredRef.current = true;
    }
  }, [tournament?.id, draftKey]);

  // Auto-save draft while user fills the form (images are excluded to keep the
  // draft small; they live in memory and are re-picked on resume).
  useEffect(() => {
    if (!tournament?.id) return;
    if (!draftRestoredRef.current) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);

    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        const teamFlow = tournament.type === 'Team';
        const successStep = teamFlow ? 5 : 4;
        if (step >= successStep) return;

        // Images are held as base64 in memory now, which is too large for
        // localStorage. Strip them from the saved draft (users re-pick the
        // photo when resuming); everything else is restored as before.
        const stripData = (v: string) => (v && v.startsWith('data:') ? '' : v);
        const payload = {
          tournamentId: tournament.id,
          step,
          termsAccepted,
          teamInfo: { ...teamInfo, logo: stripData(teamInfo.logo) },
          playerCount,
          teamPlayers: teamPlayers.map((p) => ({ ...p, photo: stripData(p.photo || '') })),
          individualPlayer: { ...individualPlayer, photo: stripData(individualPlayer.photo || '') },
        };
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }, 400);

    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    tournament?.id,
    draftKey,
    step,
    termsAccepted,
    teamInfo,
    playerCount,
    teamPlayers,
    individualPlayer,
  ]);

  // Resizing handler for team players roster
  const handlePlayerCountChange = (count: number) => {
    const minCount = Math.max(1, tournament.minPlayers || 1);
    const validatedCount = Math.max(minCount, Math.min(tournament.maxPlayers || 10, count));
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

  const isFutureDob = (dobString: string) => {
    if (!dobString) return false;
    const d = new Date(dobString);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    // Compare at date granularity (ignore timezones/time portion)
    const dobDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return dobDateOnly > todayDateOnly;
  };

  const handleTeamPlayerChange = (index: number, field: string, value: string) => {
    // Age is derived from DOB only — ignore direct edits
    if (field === 'age') return;
    const newPlayers = [...teamPlayers];
    const updatedPlayer = {
      ...newPlayers[index],
      ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {}),
      [field]: value,
    };
    if (field === 'dob') {
      if (isFutureDob(value)) {
        alert('DOB cannot be a future date.');
        updatedPlayer.dob = '';
        updatedPlayer.age = '';
      } else {
        updatedPlayer.age = calculateAge(value);
      }
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
    // Age is derived from DOB only — ignore direct edits
    if (field === 'age') return;
    setIndividualPlayer((prev: any) => {
      const updated = {
        ...prev,
        [field]: value,
        ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {})
      };
      if (field === 'dob') {
        if (isFutureDob(value)) {
          alert('DOB cannot be a future date.');
          updated.dob = '';
          updated.age = '';
        } else {
          updated.age = calculateAge(value);
        }
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

      // Compress the image and keep it in the browser only. It is uploaded to
      // storage by the server as part of final registration, so no file is
      // stored unless the registration actually completes. Re-picking simply
      // replaces the in-memory image, so no orphan/junk files are created.
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
    clearPaymentRef();
    paymentCompletionLockRef.current = false;

    const isTeamFlow = tournament.type === 'Team';
    const feeAmount = Number(tournament.fee) || 0;
    if (feeAmount < 0) {
      alert('Registration fee cannot be negative. Please contact the organizer.');
      setSubmitting(false);
      return;
    }

    // Enforce required player photo so registrations never save without one.
    // The photo is held in the browser (base64) and uploaded by the server at
    // final save, so we only need to confirm one was chosen.
    const photoCfg = tournament.formConfig?.photo;
    if (photoCfg?.enabled && photoCfg?.required) {
      const playersToCheck = isTeamFlow ? teamPlayers.slice(0, playerCount) : [individualPlayer];
      for (let i = 0; i < playersToCheck.length; i++) {
        const photo = (playersToCheck[i]?.photo || '').trim();
        const who = isTeamFlow ? `player ${i + 1}` : 'your profile';
        if (!photo) {
          alert(`Please upload a photo for ${who} before completing registration.`);
          setSubmitting(false);
          return;
        }
      }
    }

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

    // 0. Perform duplicate dryRun check before starting Razorpay checkout or free
    //    processing. The duplicate check only needs names/emails/phones, so we
    //    strip the (large) base64 images to keep this request small.
    try {
      const dryRunPayload = {
        ...basePayload,
        teamLogoUrl: null,
        players: basePayload.players.map((p) => ({ ...p, photo: '' })),
        dryRun: true,
      };
      const checkResponse = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dryRunPayload),
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
        finishRegistration(result);
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

      // Save full form BEFORE checkout so a captured payment can still become a
      // registration if the browser never returns (tab close / UPI intent).
      try {
        const pendingRes = await fetch('/api/register/pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpayOrderId: orderData.id,
            tournamentId: tournament.id,
            payload: basePayload,
          }),
        });
        if (!pendingRes.ok) {
          const pendingErr = await pendingRes.json().catch(() => ({}));
          throw new Error(
            (pendingErr as { error?: string }).error ||
              'Could not save registration details before payment. Please try again.'
          );
        }
      } catch (pendingSaveErr: unknown) {
        setSubmitting(false);
        throw pendingSaveErr instanceof Error
          ? pendingSaveErr
          : new Error('Could not save registration details before payment.');
      }

      // 3. Fallback check for Mock mode if keys are not supplied in env configuration
      if (orderData.mock) {
        alert(`ℹ️ Razorpay running in Mock Mode\n\nTo configure live transactions, add NEXT_PUBLIC_RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET inside your .env.local file.\n\nProceeding to simulate successful payment of ₹${feeAmount.toLocaleString()}...`);
        
        try {
          const mockPaymentId = `pay_MOCK_${Date.now()}`;
          persistPaymentRef(mockPaymentId);
          const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              razorpayOrderId: orderData.id,
              razorpayPaymentId: mockPaymentId,
              razorpaySignature: 'dev_mock_signature',
              devMockPayment: true,
            }),
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to submit mock registration');
          finishRegistration(result, mockPaymentId, orderData.id);
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

      const completePaidRegistration = async (response: Record<string, unknown>) => {
        if (paymentCompletionLockRef.current) return;
        paymentCompletionLockRef.current = true;

        const livePaymentId = extractRazorpayPaymentId(response);
        const orderId =
          (typeof response.razorpay_order_id === 'string' && response.razorpay_order_id.trim()) ||
          orderData.id;
        const signature =
          typeof response.razorpay_signature === 'string' ? response.razorpay_signature : '';

        if (livePaymentId) persistPaymentRef(livePaymentId);

        if (!livePaymentId || !signature) {
          paymentCompletionLockRef.current = false;
          setSubmitting(false);
          setPaymentError('Payment was completed but confirmation details were not received. Please note your bank/UPI receipt and contact the organiser with proof of payment.');
          return;
        }

        try {
          const finalResponse = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              razorpayOrderId: orderId,
              razorpayPaymentId: livePaymentId,
              razorpaySignature: signature,
            }),
          });

          const result = await finalResponse.json();
          if (!finalResponse.ok) {
            // Webhook may have already auto-completed from the pending payload.
            const alreadyDone =
              finalResponse.status === 409 ||
              /already (been )?used|already registered/i.test(String(result.error || ''));
            if (!alreadyDone) {
              throw new Error(result.error || 'Failed to process database registration');
            }
          }
          finishRegistration(result, livePaymentId, orderId);
          setStep(isTeamFlow ? 5 : 4);
        } catch (err: any) {
          paymentCompletionLockRef.current = false;
          alert('Payment succeeded but roster registration failed: ' + err.message);
        } finally {
          setSubmitting(false);
        }
      };

      const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);

      const options: Record<string, unknown> = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Force Sports Player Register',
        description: `Registration for ${tournament.name}`,
        image: '/logo.png',
        order_id: orderData.id,
        handler: completePaidRegistration,
        modal: {
          ondismiss: () => setSubmitting(false),
          confirm_close: true,
        },
        prefill: {
          name: isTeamFlow ? teamInfo.representative : individualPlayer.name,
          email: isTeamFlow ? '' : individualPlayer.email,
          contact: isTeamFlow ? teamInfo.contact : individualPlayer.phone,
        },
        theme: {
          color: tournament.theme || '#6366f1',
        },
        // On mobile: show UPI intent (opens GPay / PhonePe / Paytm directly)
        ...(isMobile && {
          config: {
            display: {
              blocks: {
                upi_block: {
                  name: 'Pay via UPI App',
                  instruments: [
                    { method: 'upi', flows: ['intent'] },
                  ],
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' },
                  ],
                },
              },
              sequence: ['block.upi_block', 'block.other'],
              preferences: { show_default_blocks: false },
            },
          },
        }),
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
  const orderedFieldKeys = visibleFieldOrder(
    config as Record<string, unknown>,
    tournament.customFields || [],
    isSportsProfileShown(config.cricketProfile)
  );
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
              {isTeam
                ? ((tournament.minPlayers || 1) < (tournament.maxPlayers || 1)
                    ? `${tournament.minPlayers || 1}–${tournament.maxPlayers} Players/Team`
                    : `${tournament.maxPlayers} Players/Team`)
                : 'Individual Entry'}
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
              {tournament.organizerPhone ? (
                <div>
                  <p style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Contact Info</p>
                  <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: 500, margin: 0 }}>
                    <a href={`tel:${tournament.organizerPhone}`} style={{ color: 'var(--theme-color)', textDecoration: 'none' }}>
                      📞 {tournament.organizerPhone}
                    </a>
                  </p>
                </div>
              ) : null}
            </div>

            <button className="btn-primary" style={{ display: 'inline-flex', padding: '0.75rem 2rem', textDecoration: 'none', margin: '0 auto' }} onClick={() => window.location.href='/'}>
              Back to Home
            </button>
          </div>
        ) : (
          <>
            {/* Dynamic Progress Bar */}
            <p className={styles.progressScrollHint} aria-hidden>
              Swipe steps →
            </p>
            <div className={`glass-panel animate-scale-up ${styles.progressContainer}`}>
              {stepsList.map((stepName, idx) => (
            <div key={idx} className={styles.progressItem}>
              <div className={`${styles.progressStep} ${step >= idx + 1 ? styles.activeStep : ''}`}>
                {idx + 1}. {stepName}
              </div>
              {idx < stepsList.length - 1 && <ChevronRight size={16} className={styles.progressSeparator} style={{ margin: '0 0.35rem' }} />}
            </div>
          ))}
          <ChevronRight size={16} className={styles.progressSeparator} style={{ margin: '0 0.35rem' }} />
          <div className={`${styles.progressStep} ${step === stepsList.length + 1 ? styles.activeStep : ''}`}>
            {stepsList.length + 1}. Success
          </div>
        </div>

        {/* ================= STEP 1: TOURNAMENT DETAILS ================= */}
        {step === 1 && (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <div className={styles.overviewIntro}>
              <h2 className={styles.cardTitle}>Tournament Overview</h2>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>
                Description
              </h3>
              <p
                className={styles.description}
                style={{ whiteSpace: 'pre-line', margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.8' }}
              >
                {String(tournament.description || '').trim() || 'No description provided for this tournament.'}
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>
                Game Rules
              </h3>
              <p
                className={styles.description}
                style={{ whiteSpace: 'pre-line', margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.8' }}
              >
                {String(tournament.rules || '').trim() || 'No game rules provided.'}
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--theme-color)' }}>
                Organizer Contact
              </h3>
              <p className={styles.description} style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.8' }}>
                {tournament.organizerName ? (
                  <strong style={{ color: '#f1f5f9' }}>{tournament.organizerName}</strong>
                ) : (
                  <span style={{ color: '#64748b' }}>Organizer details not available.</span>
                )}
                {tournament.organizerPhone ? (
                  <>
                    <br />
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
                        transition: 'opacity 0.2s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
                      onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      📞 {tournament.organizerPhone}
                    </a>
                  </>
                ) : null}
              </p>
            </div>

            <div
              id="terms-section"
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '1.5rem',
                marginBottom: '2rem',
              }}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--theme-color)' }}>
                Terms & Conditions
              </h3>
              <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-line', margin: 0 }}>
                {String(tournament.terms || '').trim() || 'No terms & conditions provided.'}
              </p>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className={styles.termsRow}>
              <input
                type="checkbox"
                id="acceptTerms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="acceptTerms" className={styles.termsLabel}>
                I have read and agree to the{' '}
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const element = document.getElementById('terms-section');
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={styles.termsLink}
                  role="button"
                  tabIndex={0}
                >
                  Terms & Conditions
                </span>
              </label>
            </div>

            <button
              onClick={nextStep}
              className={`btn-primary ${styles.fullWidthBtn}`}
              disabled={!termsAccepted}
              style={{
                opacity: termsAccepted ? 1 : 0.5,
                cursor: termsAccepted ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
              }}
            >
              REGISTER <ChevronRight size={20} />
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
              className={`${styles.logoUpload} ${styles.teamLogoPicker}`}
              onClick={() => document.getElementById('teamLogoInput')?.click()}
            >
              {teamInfo.logo ? (
                <img 
                  src={teamInfo.logo} 
                  alt="Team Logo" 
                />
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
                  if (file) {
                    // Keep the logo in the browser only; the server uploads it
                    // during final registration, so nothing is stored early.
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

            <div className={styles.formActions}>
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button type="submit" className="btn-primary">Next: Add Players</button>
            </div>
          </form>
        )}

        {/* ================= TEAM FLOW: STEP 3 (PLAYERS ROSTER) ================= */}
        {isTeam && step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const minRequired = Math.max(1, tournament.minPlayers || 1);
              if (playerCount < minRequired) {
                alert(`This tournament requires at least ${minRequired} players per team.`);
                return;
              }
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
            className={`glass-panel animate-fade-in delay-100 ${styles.playersStepPanel}`}
          >
            <div className={`${styles.playersHeader} ${styles.playersHeaderBar}`}>
              <div className={styles.playersStepHeader}>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>Add Player Details</h2>
                <p className={styles.playersStepSubtitle}>
                  {(tournament.minPlayers || 1) > 1
                    ? `Add ${tournament.minPlayers}–${tournament.maxPlayers} players for your team`
                    : 'Fill in details for your team members'}
                </p>
              </div>
              
              <div className={styles.playerCountWidget}>
                <span className={styles.playerCountLabel}>Players to register</span>
                
                <div className={styles.playerCountControls}>
                  <button 
                    type="button"
                    className={styles.playerCountBtn}
                    disabled={playerCount <= (tournament.minPlayers || 1)}
                    onClick={() => handlePlayerCountChange(playerCount - 1)}
                    aria-label="Decrease player count"
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>

                  <span className={styles.playerCountValue}>{playerCount}</span>

                  <button 
                    type="button"
                    className={styles.playerCountBtn}
                    disabled={playerCount >= (tournament.maxPlayers || 10)}
                    onClick={() => handlePlayerCountChange(playerCount + 1)}
                    aria-label="Increase player count"
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
                      <User size={20} />
                    </div>
                    <h3>Player {idx + 1}</h3>
                  </div>
                  
                  <div className={styles.formGrid}>
                    <OrderedPlayerFields
                      fieldKeys={orderedFieldKeys}
                      player={player}
                      config={config}
                      tournament={tournament}
                      variant="team"
                      playerIndex={idx}
                      photoFileLabel={teamPhotoFileLabels[idx]}
                      formatPhoneNumber={formatPhoneNumber}
                      onChange={(key, value) => handleTeamPlayerChange(idx, key, value)}
                      onCustomChange={(label, value) => handleTeamPlayerCustomValueChange(idx, label, value)}
                      onSportRoleToggle={(role) => handleTeamPlayerSportRoleToggle(idx, role)}
                      onPhotoUpload={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setTeamPhotoFileLabels((prev) => ({ ...prev, [idx]: file.name }));
                        }
                        handlePhotoUpload(e, true, idx);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`${styles.formActions} ${styles.formActionsSpaced}`}>
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button type="submit" className="btn-primary">Next: Review & Pay</button>
            </div>
          </form>
        )}

        {/* ================= TEAM FLOW: STEP 4 (PAYMENT Summary) ================= */}
        {isTeam && step === 4 && (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={`${styles.cardTitle} ${styles.cardSectionTitle}`}>
              Team Registration Summary & Payment
            </h2>
            
            <div className={styles.summaryBlock}>
              <h3>
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

            <div className={styles.paymentFeeRow}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>ENTRY FEE</h3>
                <p style={{ color: '#94a3b8' }}>Secure transaction via Razorpay gateway</p>
              </div>
              <div className={styles.paymentFeeAmount}>
                ₹{(Number(tournament.fee) || 0).toLocaleString()}
              </div>
            </div>

            <div className={styles.formActions}>
              <button onClick={() => setStep(3)} className="btn-secondary">Back</button>
              <button
                onClick={handlePayment}
                className="btn-primary"
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
              Player Information
            </h2>

            {hasSponsors ? (
              <RegistrationSponsors sponsors={tournament.sponsors} variant="form" />
            ) : null}
            
            <div className={styles.formGrid}>
              <OrderedPlayerFields
                fieldKeys={orderedFieldKeys}
                player={individualPlayer}
                config={config}
                tournament={tournament}
                variant="individual"
                photoFileLabel={individualPhotoFileLabel}
                photoInputRef={individualPhotoInputRef}
                formatPhoneNumber={formatPhoneNumber}
                onChange={(key, value) => handleIndividualInputChange(key, value)}
                onCustomChange={(label, value) => handleIndividualCustomValueChange(label, value)}
                onSportRoleToggle={(role) => handleIndividualSportRoleToggle(role)}
                onPhotoUpload={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setIndividualPhotoFileLabel(file.name);
                  handlePhotoUpload(e, false);
                }}
                onPhotoChooseClick={() => individualPhotoInputRef.current?.click()}
              />
            </div>

            <div className={`${styles.formActions} ${styles.formActionsSpaced}`}>
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button type="submit" className="btn-primary">Next: Review & Pay</button>
            </div>
          </form>
        )}

        {/* ================= INDIVIDUAL FLOW: STEP 3 (PAYMENT / SUMMARY) ================= */}
        {!isTeam && step === 3 && (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={`${styles.cardTitle} ${styles.cardSectionTitle}`}>
              Registration Summary & Payment
            </h2>
            
            <div className={styles.summaryGrid}>
              <div className={styles.summaryBlock}>
                <h3>
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
                <div className={styles.summaryBlock}>
                  <h3>
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

            <div className={styles.paymentFeeRow}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>ENTRY FEE</h3>
                <p style={{ color: '#94a3b8' }}>Secure transaction via Razorpay gateway</p>
              </div>
              <div className={styles.paymentFeeAmount}>
                ₹{(Number(tournament.fee) || 0).toLocaleString()}
              </div>
            </div>

            <div className={styles.formActions}>
              <button onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button
                onClick={handlePayment}
                className="btn-primary"
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
                <p style={{ color: '#94a3b8', fontSize: '1.05rem', marginBottom: '1.5rem', maxWidth: '500px' }}>
                  Your team <strong>{teamInfo.name}</strong> has been successfully registered for {tournament.name}.
                </p>

                {/* Single unified info card */}
                <div style={{
                  width: '100%', maxWidth: '500px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.85rem',
                  padding: '1.25rem 1.5rem',
                  display: 'flex', flexDirection: 'column', gap: '0.65rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Representative</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamInfo.representative}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Contact Mobile</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamInfo.contact}</span>
                  </div>

                  {(Number(tournament.fee) || 0) > 0 && (
                    <>
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Payment ID</span>
                        <span style={{ color: '#6ee7b7', fontFamily: 'monospace', fontSize: '0.88rem', fontWeight: 700 }}>
                          {readStoredPaymentRef() || '—'}
                        </span>
                      </div>
                    </>
                  )}

                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Total Team Members</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{playerCount} players</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Next Step</span>
                    <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>Fixture schedule shared shortly</span>
                  </div>
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
                  {(Number(tournament.fee) || 0) > 0 && (
                    <p style={{ margin: '0.75rem 0 0.4rem' }}>
                      <strong>Payment ID:</strong>{' '}
                      <span style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{readStoredPaymentRef() || '—'}</span>
                    </p>
                  )}
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

      {/* PAYMENT ERROR MODAL */}
      {paymentError && (
        <div onClick={() => setPaymentError(null)} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '1.5rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1a2235',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '1rem', width: '100%', maxWidth: '420px',
            padding: '2rem', textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h3 style={{ color: '#f87171', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              Payment Note
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.7', marginBottom: '1.5rem' }}>
              {paymentError}
            </p>
            <button
              onClick={() => setPaymentError(null)}
              style={{
                padding: '0.65rem 2rem', borderRadius: '0.6rem',
                background: '#dc2626', border: 'none',
                color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              OK, I understand
            </button>
          </div>
        </div>
      )}

      {/* DUPLICATE REGISTRATION OVERLAY MODAL */}
      {duplicateData && (
        <div className={styles.duplicateModalOverlay}>
          <div className={styles.duplicateModalPanel}>
            
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
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>
                {duplicateData.sameRoster ? 'Duplicate Player' : 'Already Registered!'}
              </h2>
              <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                {duplicateData.sameRoster
                  ? 'The same player has been added more than once in this form. Please make each player unique.'
                  : `You are already registered for ${tournament.name}. Below is your registration detail.`}
              </p>
            </div>

            {/* Duplicate player info card */}
            <div style={{
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '0.75rem',
              padding: '1.1rem 1.35rem',
              marginBottom: '1.25rem',
            }}>
              {/* Team logo */}
              {duplicateData.duplicateTeamLogo && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
                  <img
                    src={duplicateData.duplicateTeamLogo}
                    alt="Team Logo"
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid rgba(245,158,11,0.4)',
                    }}
                  />
                </div>
              )}
              {duplicateData.duplicateTeamName && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team</span>
                  <span style={{ color: '#fcd34d', fontWeight: 700, fontSize: '0.95rem' }}>{duplicateData.duplicateTeamName}</span>
                </div>
              )}
              {duplicateData.duplicatePlayerName && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player</span>
                  <span style={{ color: '#fcd34d', fontWeight: 700, fontSize: '0.95rem' }}>{duplicateData.duplicatePlayerName}</span>
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(99,102,241,0.07)',
              border: '1px dashed rgba(99,102,241,0.25)',
              padding: '1rem 1.25rem',
              borderRadius: '0.75rem',
              marginBottom: '2rem',
            }}>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.65 }}>
                {duplicateData.error ||
                  'This player is already registered for this tournament.'}
                {!duplicateData.sameRoster && (
                  <>
                    {' '}Contact the organizer
                    {tournament.organizerPhone ? ` at ${tournament.organizerPhone}` : ''} if you need help.
                  </>
                )}
              </p>
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
