'use client';

import { toast } from 'sonner';

import { use, useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, MapPin, User, Image as ImageIcon, ChevronRight, CheckCircle2, Mail, Phone, Award, Users, AlertTriangle, Plus, Minus, FileText, ClipboardList, ScrollText } from 'lucide-react';
import styles from './register.module.css';
import {
  allRounderTypeForCricketPayload,
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  cricketRolesNeedCombinedDetail,
  normalizeBattingHandUi,
  parseCricketRoles,
  toggleCricketRoleString,
} from '@/lib/cricket-roles';
import { isSportsProfileShown, resolveSportsProfileForTournament, visibleFieldOrder, normalizeFieldOrder } from '@/lib/form-config';
import { parseCustomFields, validateCustomFieldAnswers } from '@/lib/custom-fields';
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
import { RegisterStepChecklist } from './RegisterStepChecklist';
import { RegisterStepProgress } from './RegisterStepProgress';
import {
  entryTypeLabel,
  isMultiSportMode,
  isSoloTournamentType,
  isTeamInviteLinkType,
  parsePrecreatedTeams,
  parseSportsConfig,
  resolveSelectedSports,
  resolveTeamsBySport,
  rosterBoundsForSelection,
  seatsRemaining,
  seatsUsed,
  soloTournamentRosterBounds,
  teamSportsFromSelection,
  type SportEntry,
  type TeamOccupancyMap,
} from '@/lib/multi-sport';
import TeamInviteStartClient from '@/components/team-invite/TeamInviteStartClient';
import { groupSportsForDisplay } from '@/lib/sport-presets';
import {
  categoryMatchesPlayer,
  formatAgeCategoryRange,
  parseAgeCategories,
  resolveAgeCategoryName,
  type AgeCategoryDef,
} from '@/lib/age-categories';
import {
  resolveTournamentFeeMode,
  resolveTournamentPayable,
} from '@/lib/fee-mode';
import {
  emptySportProfiles,
  ensureSportProfiles,
  legacyFieldsFromSportProfiles,
  profileKindsForRegistration,
  validateSportProfiles,
  type SportProfileKind,
  type SportProfilesMap,
} from '@/lib/sport-profiles';
import { toggleFootballRoleString } from '@/lib/football-roles';

function emptyRegisterPlayer() {
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
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedAgeCategoryId, setSelectedAgeCategoryId] = useState<string>('');
  const [teamsBySport, setTeamsBySport] = useState<Record<string, string>>({});
  const [teamOccupancy, setTeamOccupancy] = useState<TeamOccupancyMap>({});
  const confirmedPaymentIdRef = useRef<string | null>(null);
  const paymentCompletionLockRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const activeProfileKindsRef = useRef<SportProfileKind[]>([]);

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
          sportsConfig: parseSportsConfig(data.sports_config),
          precreatedTeams: parsePrecreatedTeams(data.precreated_teams),
          ageCategories: parseAgeCategories(data.age_categories),
          teamCustomFields: Array.isArray(data.team_custom_fields) ? data.team_custom_fields : [],
        };

        setTournament(matched);
        setPlayerCount(maxPlayers);
        setTeamPlayers(
          Array(maxPlayers)
            .fill(null)
            .map(() => emptyRegisterPlayer())
        );

        // Load team seat occupancy for max-capacity UI (non-blocking).
        try {
          const capRes = await fetch(`/api/tournaments/${encodeURIComponent(slug)}/capacity`);
          if (capRes.ok) {
            const capJson = await capRes.json();
            if (capJson?.occupancy && typeof capJson.occupancy === 'object') {
              setTeamOccupancy(capJson.occupancy);
            }
          }
        } catch {
          /* ignore */
        }
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

  // Multi-sport / solo-doubles: keep roster size within selected sports' bounds.
  useEffect(() => {
    if (!tournament?.sportsConfig || !isMultiSportMode(tournament.sportsConfig)) return;
    const selected = resolveSelectedSports(tournament.sportsConfig as SportEntry[], selectedSportIds);
    if (selected.length === 0) return;
    const bounds = isSoloTournamentType(tournament.type)
      ? soloTournamentRosterBounds(selected)
      : rosterBoundsForSelection(selected);
    setPlayerCount((prev: number) => {
      const next = Math.min(bounds.maxPlayers, Math.max(bounds.minPlayers, prev || bounds.minPlayers));
      return next;
    });
    setTeamPlayers((prev: ReturnType<typeof emptyRegisterPlayer>[]) => {
      if (prev.length >= bounds.maxPlayers) return prev.slice(0, Math.max(bounds.maxPlayers, prev.length));
      return [
        ...prev,
        ...Array(bounds.maxPlayers - prev.length)
          .fill(null)
          .map(() => emptyRegisterPlayer()),
      ];
    });
    // Keep one shared team name mapped onto every selected team sport (Team tournaments only).
    if (isSoloTournamentType(tournament.type)) return;
    const teamIds = selected.filter((s) => s.entryType === 'team').map((s) => s.id);
    setTeamsBySport((prev) => {
      const shared =
        teamInfo.name.trim() ||
        Object.values(prev).find((v) => String(v || '').trim()) ||
        '';
      const next: Record<string, string> = {};
      if (shared) {
        for (const id of teamIds) next[id] = shared;
      }
      return next;
    });
  }, [selectedSportIds, tournament?.sportsConfig, tournament?.id, tournament?.type, teamInfo.name]);

  // Restore payment ID on success screen (e.g. after refresh) for paid tournaments.
  useEffect(() => {
    if (!tournament?.id) return;
    const sportsCfg = parseSportsConfig(tournament.sportsConfig);
    const selected = resolveSelectedSports(sportsCfg, selectedSportIds);
    const teamLikeFlow = isSoloTournamentType(tournament.type)
      ? soloTournamentRosterBounds(selected).hasDoubles
      : isMultiSportMode(sportsCfg)
        ? selected.length > 0 && !rosterBoundsForSelection(selected).individualOnly
        : tournament.type === 'Team';
    const onSuccess = (teamLikeFlow && step === 5) || (!teamLikeFlow && step === 4);
    if (!onSuccess) return;
    const fee = Number(tournament.fee) || 0;
    if (fee <= 0) return;
    const stored = readStoredPaymentRef();
    if (stored) persistPaymentRef(stored);
  }, [
    step,
    tournament?.id,
    tournament?.fee,
    tournament?.type,
    tournament?.sportsConfig,
    selectedSportIds,
    paymentPersistKey,
  ]);

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
        const sportsCfg = parseSportsConfig(tournament.sportsConfig);
        const multi = isMultiSportMode(sportsCfg);
        const savedSportIds = Array.isArray(parsed?.selectedSportIds)
          ? parsed.selectedSportIds.filter(
              (id: unknown): id is string =>
                typeof id === 'string' && sportsCfg.some((s) => s.id === id)
            )
          : [];
        if (savedSportIds.length > 0) setSelectedSportIds(savedSportIds);
        if (typeof parsed?.selectedAgeCategoryId === 'string') {
          const ageCats = parseAgeCategories(tournament.ageCategories);
          if (ageCats.some((c) => c.id === parsed.selectedAgeCategoryId)) {
            setSelectedAgeCategoryId(parsed.selectedAgeCategoryId);
          }
        }
        if (
          parsed?.teamsBySport &&
          typeof parsed.teamsBySport === 'object' &&
          !Array.isArray(parsed.teamsBySport)
        ) {
          setTeamsBySport(parsed.teamsBySport);
        }

        const teamFlow = isSoloTournamentType(tournament.type)
          ? savedSportIds.length > 0 &&
            soloTournamentRosterBounds(resolveSelectedSports(sportsCfg, savedSportIds)).hasDoubles
          : multi
            ? savedSportIds.length > 0
              ? !rosterBoundsForSelection(resolveSelectedSports(sportsCfg, savedSportIds))
                  .individualOnly
              : tournament.type === 'Team'
            : tournament.type === 'Team';
        // Multi-sport requires a selection — don't resume mid-flow without sports.
        // Age category must be chosen first when tournament defines categories.
        const ageCats = parseAgeCategories(tournament.ageCategories);
        const needsAgePick = ageCats.length > 0;
        let nextStep = Math.min(Math.max(1, parsed.step), teamFlow ? 4 : 3);
        if (needsAgePick && !parsed?.selectedAgeCategoryId) nextStep = 1;
        if (multi && savedSportIds.length === 0) nextStep = 1;
        setStep(nextStep);
      } else if (Array.isArray(parsed?.selectedSportIds)) {
        const sportsCfg = parseSportsConfig(tournament.sportsConfig);
        const savedSportIds = parsed.selectedSportIds.filter(
          (id: unknown): id is string =>
            typeof id === 'string' && sportsCfg.some((s) => s.id === id)
        );
        if (savedSportIds.length > 0) setSelectedSportIds(savedSportIds);
        if (typeof parsed?.selectedAgeCategoryId === 'string') {
          const ageCats = parseAgeCategories(tournament.ageCategories);
          if (ageCats.some((c) => c.id === parsed.selectedAgeCategoryId)) {
            setSelectedAgeCategoryId(parsed.selectedAgeCategoryId);
          }
        }
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
        const sportsCfg = parseSportsConfig(tournament.sportsConfig);
        const selected = resolveSelectedSports(sportsCfg, selectedSportIds);
        const teamLikeFlow = isSoloTournamentType(tournament.type)
          ? soloTournamentRosterBounds(selected).hasDoubles
          : isMultiSportMode(sportsCfg)
            ? selected.length > 0 && !rosterBoundsForSelection(selected).individualOnly
            : tournament.type === 'Team';
        const successStep = teamLikeFlow ? 5 : 4;
        if (step >= successStep) return;

        // Images are held as base64 in memory now, which is too large for
        // localStorage. Strip them from the saved draft (users re-pick the
        // photo when resuming); everything else is restored as before.
        const stripData = (v: string) => (v && v.startsWith('data:') ? '' : v);
        const payload = {
          tournamentId: tournament.id,
          step,
          termsAccepted,
          selectedSportIds,
          selectedAgeCategoryId,
          teamsBySport,
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
    selectedSportIds,
    selectedAgeCategoryId,
    teamsBySport,
    teamInfo,
    playerCount,
    teamPlayers,
    individualPlayer,
  ]);

  // Resizing handler for team players roster
  const handlePlayerCountChange = (count: number) => {
    const sportsCfg = parseSportsConfig(tournament?.sportsConfig);
    const multi = isMultiSportMode(sportsCfg);
    const bounds = multi
      ? rosterBoundsForSelection(resolveSelectedSports(sportsCfg, selectedSportIds))
      : null;
    const minCount = Math.max(1, multi ? bounds?.minPlayers || 1 : tournament.minPlayers || 1);
    const maxCount = multi ? bounds?.maxPlayers || 10 : tournament.maxPlayers || 10;
    const validatedCount = Math.max(minCount, Math.min(maxCount, count));
    setPlayerCount(validatedCount);
    
    setTeamPlayers(prev => {
      if (prev.length === validatedCount) return prev;
      if (prev.length > validatedCount) {
        return prev.slice(0, validatedCount);
      } else {
        const diff = validatedCount - prev.length;
        const newPlayers = Array(diff).fill(null).map(() => emptyRegisterPlayer());
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
        toast.error('DOB cannot be a future date.');
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
          toast.error('DOB cannot be a future date.');
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

  const patchPlayerSportProfile = (
    prev: ReturnType<typeof emptyRegisterPlayer>,
    kind: SportProfileKind,
    patch: Partial<{ role: string; battingHand: string; bowlingType: string; allRounderType: string }>
  ) => {
    const kinds = activeProfileKindsRef.current;
    const profiles = ensureSportProfiles(prev.sportProfiles, kinds, prev);
    const nextProfiles: SportProfilesMap = { ...profiles };
    if (kind === 'cricket') {
      const cur = { ...(profiles.cricket || { role: '', battingHand: '', bowlingType: '', allRounderType: '' }), ...patch };
      if (patch.role != null) {
        const rolesArr = parseCricketRoles(cur.role);
        if (!cricketRolesNeedBattingHand(rolesArr)) cur.battingHand = '';
        if (!cricketRolesNeedBowling(rolesArr)) cur.bowlingType = '';
        cur.allRounderType = '';
      }
      nextProfiles.cricket = cur;
    } else {
      nextProfiles.football = {
        ...(profiles.football || { role: '' }),
        ...patch,
        role: patch.role != null ? patch.role : profiles.football?.role || '',
      };
    }
    const legacy = legacyFieldsFromSportProfiles(nextProfiles);
    return { ...prev, sportProfiles: nextProfiles, ...legacy };
  };

  const handleIndividualSportProfileRoleToggle = (kind: SportProfileKind, r: string) => {
    setIndividualPlayer((prev: any) => {
      const profiles = ensureSportProfiles(prev.sportProfiles, activeProfileKindsRef.current, prev);
      const current =
        kind === 'cricket' ? profiles.cricket?.role || '' : profiles.football?.role || '';
      const nextRole =
        kind === 'cricket' ? toggleCricketRoleString(current, r) : toggleFootballRoleString(current, r);
      return patchPlayerSportProfile(prev, kind, { role: nextRole });
    });
  };

  const handleIndividualSportProfileFieldChange = (
    kind: SportProfileKind,
    field: 'battingHand' | 'bowlingType' | 'allRounderType',
    value: string
  ) => {
    setIndividualPlayer((prev: any) => patchPlayerSportProfile(prev, kind, { [field]: value }));
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

  const handleTeamPlayerSportProfileRoleToggle = (index: number, kind: SportProfileKind, r: string) => {
    setTeamPlayers((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      if (!cur) return prev;
      const profiles = ensureSportProfiles(cur.sportProfiles, activeProfileKindsRef.current, cur);
      const current =
        kind === 'cricket' ? profiles.cricket?.role || '' : profiles.football?.role || '';
      const nextRole =
        kind === 'cricket' ? toggleCricketRoleString(current, r) : toggleFootballRoleString(current, r);
      copy[index] = patchPlayerSportProfile(cur, kind, { role: nextRole });
      return copy;
    });
  };

  const handleTeamPlayerSportProfileFieldChange = (
    index: number,
    kind: SportProfileKind,
    field: 'battingHand' | 'bowlingType' | 'allRounderType',
    value: string
  ) => {
    setTeamPlayers((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      if (!cur) return prev;
      copy[index] = patchPlayerSportProfile(cur, kind, { [field]: value });
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
        toast.error('File size exceeds 5MB. Please upload a smaller image.');
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

  /** Block leaving player details if DOB is outside tournament age categories. */
  const validatePlayersAgeCategories = (
    players: { dob?: string }[],
    opts?: { teamLabels?: boolean; soloDoubles?: boolean }
  ): boolean => {
    const ageCats = (tournament?.ageCategories || []) as AgeCategoryDef[];
    const ageCfg = tournament?.formConfig?.age;
    const dobCfg = tournament?.formConfig?.dob;
    if (!(ageCfg?.enabled || dobCfg?.enabled) || ageCats.length === 0) return true;

    const selectedCat =
      selectedAgeCategoryId
        ? ageCats.find((c) => c.id === selectedAgeCategoryId) || null
        : null;

    for (let i = 0; i < players.length; i++) {
      const dob = (players[i]?.dob || '').trim();
      if (!dob) continue;
      const who = opts?.teamLabels
        ? opts.soloDoubles
          ? i === 0
            ? 'You'
            : 'Partner'
          : `Player ${i + 1}`
        : 'Your profile';

      if (selectedCat) {
        if (!categoryMatchesPlayer(selectedCat, dob)) {
          toast.error(
            `${who}: date of birth does not match the selected age category "${selectedCat.name}".`
          );
          return false;
        }
        continue;
      }

      if (!resolveAgeCategoryName(dob, ageCats)) {
        toast.error(
          `${who}: date of birth does not match any age category for this tournament. Please check the age categories and try again.`
        );
        return false;
      }
    }
    return true;
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
      toast.error('Tournament is still loading. Please wait a moment and try again.');
      return;
    }

    if (tournament.status === 'Closed') {
      toast.error('Registration is closed for this tournament.');
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    clearPaymentRef();
    paymentCompletionLockRef.current = false;

    // Refresh sports_config from API so checkout matches DB (avoids stale empty config → 400).
    let sportsConfigPay = parseSportsConfig(tournament.sportsConfig);
    let legacyFee = Number(tournament.fee) || 0;
    try {
      const freshRes = await fetch(`/api/tournaments/${encodeURIComponent(String(tournament.slug || slug))}`);
      if (freshRes.ok) {
        const fresh = await freshRes.json();
        sportsConfigPay = parseSportsConfig(fresh.sports_config);
        legacyFee = Number(fresh.fee) || 0;
        setTournament((prev: any) =>
          prev
            ? {
                ...prev,
                fee: legacyFee,
                sportsConfig: sportsConfigPay,
                ageCategories: parseAgeCategories(fresh.age_categories),
              }
            : prev
        );
      }
    } catch {
      /* use in-memory tournament */
    }

    const ageCatsPay = parseAgeCategories(tournament.ageCategories);
    let selectedIds = selectedSportIds.filter((id) => sportsConfigPay.some((s) => s.id === id));
    if (selectedIds.length !== selectedSportIds.length) {
      setSelectedSportIds(selectedIds);
    }

    const multiPay = isMultiSportMode(sportsConfigPay);
    const feeModePay = resolveTournamentFeeMode({
      formConfig: tournament.formConfig,
      sportsConfig: sportsConfigPay,
      ageCategories: ageCatsPay,
    });
    const payablePay = resolveTournamentPayable({
      feeMode: feeModePay,
      legacyFee,
      sportsConfig: sportsConfigPay,
      selectedSportIds: selectedIds,
      ageCategories: ageCatsPay,
      selectedAgeCategoryId,
    });
    const feeBreakdownPay = payablePay.breakdown;
    const soloForcedPay = isSoloTournamentType(tournament.type);
    const soloBoundsPay = soloForcedPay
      ? soloTournamentRosterBounds(payablePay.selected)
      : null;
    // Solo + doubles → 2-player (partner) roster; solo singles → individual; else normal rules.
    const isTeamFlow = soloForcedPay
      ? Boolean(soloBoundsPay && !soloBoundsPay.individualOnly)
      : multiPay
        ? !rosterBoundsForSelection(payablePay.selected).individualOnly
        : tournament.type === 'Team';
    const feeAmount = payablePay.fee;
    if (multiPay && payablePay.selected.length === 0) {
      toast.error('Please select at least one sport before paying.');
      setStep(1);
      setSubmitting(false);
      return;
    }
    if (ageCatsPay.length > 0 && !selectedAgeCategoryId) {
      toast.error('Please select an age category before continuing.');
      setStep(1);
      setSubmitting(false);
      return;
    }
    if (feeAmount < 0) {
      toast.error('Registration fee cannot be negative. Please contact the organizer.');
      setSubmitting(false);
      return;
    }

    const payBounds = soloForcedPay
      ? soloBoundsPay!
      : multiPay
        ? rosterBoundsForSelection(payablePay.selected)
        : { needsTeamSlot: false, hasTeamSport: false, minPlayers: 1, maxPlayers: 99 };
    const requireTeamIdentityPay = soloForcedPay
      ? false
      : multiPay
        ? Boolean(payBounds.hasTeamSport)
        : tournament.type === 'Team';
    const firstPlayer = isTeamFlow ? teamPlayers[0] : individualPlayer;
    let resolvedTeamName = isTeamFlow
      ? requireTeamIdentityPay
        ? teamInfo.name
        : firstPlayer?.name || 'Doubles entry'
      : individualPlayer.name;
    let precreatedTeamId: string | null = null;
    let resolvedTeamsBySport: Record<string, string> = {};
    if (!soloForcedPay && payBounds.needsTeamSlot) {
      const teamResolve = resolveTeamsBySport({
        selected: payablePay.selected,
        sharedTeamName: teamInfo.name,
        teamsBySport,
        precreatedTeams: tournament.precreatedTeams || [],
      });
      if (!teamResolve.ok) {
        toast.error(teamResolve.error);
        setSubmitting(false);
        return;
      }
      // Client-side capacity check before payment.
      for (const sport of teamSportsFromSelection(payablePay.selected)) {
        const teamName = teamResolve.teamsBySport[sport.id];
        if (!teamName) continue;
        const left = seatsRemaining(sport, teamName, teamOccupancy);
        const need = isTeamFlow ? playerCount : 1;
        if (need > left) {
          toast.error(
            `${sport.name} team "${teamName}" does not have enough seats (${left} left, need ${need}). Use another name or reduce roster size.`
          );
          setSubmitting(false);
          return;
        }
      }
      resolvedTeamsBySport = teamResolve.teamsBySport;
      precreatedTeamId = null;
      resolvedTeamName = teamResolve.primaryTeamName || teamInfo.name;
      setTeamInfo((prev) => ({ ...prev, name: resolvedTeamName }));
      setTeamsBySport(resolvedTeamsBySport);
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
          toast.error(`Please upload a photo for ${who} before completing registration.`);
          setSubmitting(false);
          return;
        }
      }
    }

    const profileKindsPay = profileKindsForRegistration({
      multiSport: multiPay,
      selected: payablePay.selected,
      tournamentSport: tournament.sport,
    });
    const sportsProfileFlagsPay = resolveSportsProfileForTournament(
      (tournament.formConfig && typeof tournament.formConfig === 'object'
        ? tournament.formConfig
        : {}) as Record<string, unknown>,
      tournament.sport
    );
    if (sportsProfileFlagsPay.required && profileKindsPay.length > 0) {
      const playersToCheck = isTeamFlow ? teamPlayers.slice(0, playerCount) : [individualPlayer];
      for (let i = 0; i < playersToCheck.length; i++) {
        const p = playersToCheck[i];
        const profiles = ensureSportProfiles(p?.sportProfiles, profileKindsPay, p);
        const err = validateSportProfiles(profiles, profileKindsPay, true);
        if (err) {
          const who = isTeamFlow ? `Player ${i + 1}` : 'Your profile';
          toast.error(`${who}: ${err}`);
          setSubmitting(false);
          return;
        }
      }
    }

    const ageCats = (tournament.ageCategories || []) as AgeCategoryDef[];
    const ageCfg = tournament.formConfig?.age;
    const dobCfg = tournament.formConfig?.dob;
    if ((ageCfg?.enabled || dobCfg?.enabled) && ageCats.length > 0) {
      const playersToCheck = isTeamFlow ? teamPlayers.slice(0, playerCount) : [individualPlayer];
      if (
        !validatePlayersAgeCategories(playersToCheck, {
          teamLabels: isTeamFlow,
          soloDoubles: Boolean(soloForcedPay && soloBoundsPay?.hasDoubles),
        })
      ) {
        setSubmitting(false);
        return;
      }
    }

    {
      const customDefs = parseCustomFields(tournament.customFields);
      const playersToCheck = isTeamFlow ? teamPlayers.slice(0, playerCount) : [individualPlayer];
      for (let i = 0; i < playersToCheck.length; i++) {
        const customErr = validateCustomFieldAnswers(customDefs, playersToCheck[i]?.customValues);
        if (customErr) {
          const who = isTeamFlow ? `Player ${i + 1}` : 'Your profile';
          toast.error(`${who}: ${customErr}`);
          setSubmitting(false);
          return;
        }
      }
    }

    const toPlayerPayload = (p: {
      name: string;
      email: string;
      phone: string;
      emergencyContact: string;
      dob: string;
      age: string;
      gender: string;
      aadhar: string;
      jerseyName: string;
      jerseyNumber: string;
      jerseySize: string;
      photo: string;
      role: string;
      battingHand: string;
      bowlingType: string;
      allRounderType: string;
      sportProfiles?: SportProfilesMap;
      customValues: Record<string, string>;
    }) => {
      const kinds = profileKindsForRegistration({
        multiSport: isMultiSportMode((tournament.sportsConfig || []) as SportEntry[]),
        selected: payablePay.selected,
        tournamentSport: tournament.sport,
      });
      const profiles =
        kinds.length > 0
          ? ensureSportProfiles(p.sportProfiles, kinds, p)
          : p.sportProfiles || {};
      const legacy =
        kinds.length > 0
          ? legacyFieldsFromSportProfiles(profiles)
          : {
              role: p.role,
              battingHand: p.battingHand,
              bowlingType: p.bowlingType,
              allRounderType: p.allRounderType,
            };
      return {
        name: p.name,
        email: p.email,
        phone: p.phone,
        emergencyContact: p.emergencyContact,
        dob: p.dob,
        age: p.age ? Number(p.age) : null,
        ageCategory: (() => {
          const selectedCat =
            selectedAgeCategoryId && ageCats.length > 0
              ? ageCats.find((c) => c.id === selectedAgeCategoryId) || null
              : null;
          if (selectedCat && p.dob && categoryMatchesPlayer(selectedCat, p.dob)) {
            return selectedCat.name;
          }
          return resolveAgeCategoryName(p.dob || '', ageCats);
        })(),
        gender: p.gender,
        aadhar: p.aadhar,
        jerseyName: p.jerseyName,
        jerseyNumber: p.jerseyNumber ? Number(p.jerseyNumber) : null,
        jerseySize: p.jerseySize,
        photo: p.photo,
        role: legacy.role,
        battingHand: legacy.battingHand,
        bowlingType: legacy.bowlingType,
        allRounderType: allRounderTypeForCricketPayload(
          kinds.includes('cricket') || isCricketSport(tournament),
          legacy.role,
          legacy.battingHand,
          legacy.bowlingType,
          legacy.allRounderType
        ),
        sportProfiles: profiles,
        customValues: p.customValues,
      };
    };

    const basePayload = {
      tournamentId: tournament.id,
      teamName: resolvedTeamName,
      representative: isTeamFlow
        ? requireTeamIdentityPay
          ? teamInfo.representative || firstPlayer?.name
          : firstPlayer?.name
        : individualPlayer.name,
      contact: isTeamFlow
        ? requireTeamIdentityPay
          ? teamInfo.contact || firstPlayer?.phone
          : firstPlayer?.phone
        : individualPlayer.phone,
      teamLogoUrl: isTeamFlow && requireTeamIdentityPay ? teamInfo.logo : null,
      selectedSports: payablePay.selected.map((s) => s.id),
      selectedAgeCategoryId: selectedAgeCategoryId || null,
      feeBreakdown: feeBreakdownPay,
      precreatedTeamId,
      teamsBySport: resolvedTeamsBySport,
      players: isTeamFlow
        ? teamPlayers.slice(0, playerCount).map(toPlayerPayload)
        : [toPlayerPayload(individualPlayer)],
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
      toast.error(err.message);
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
        toast.error('Error submitting free registration: ' + err.message);
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
        body: JSON.stringify({
          tournamentId: tournament.id,
          selectedSportIds: payablePay.selected.map((s) => s.id),
          selectedAgeCategoryId: selectedAgeCategoryId || null,
        }),
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
        toast.message('Razorpay running in Mock Mode', {
          description: `Add NEXT_PUBLIC_RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET in .env.local for live payments. Simulating ₹${feeAmount.toLocaleString()}…`,
          duration: 6000,
        });
        
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
          toast.error('Error submitting mock registration: ' + err.message);
        } finally {
          setSubmitting(false);
        }
        return;
      }

      // 4. Load official script and open checkout overlay
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Failed to load Razorpay payment gateway. Please check your internet connection.');
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
          toast.error('Payment succeeded but roster registration failed: ' + err.message);
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
          name: isTeamFlow
            ? requireTeamIdentityPay
              ? teamInfo.representative
              : firstPlayer?.name
            : individualPlayer.name,
          email: isTeamFlow ? '' : individualPlayer.email,
          contact: isTeamFlow
            ? requireTeamIdentityPay
              ? teamInfo.contact
              : firstPlayer?.phone
            : individualPlayer.phone,
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
                  name: 'Pay via UPI',
                  instruments: [
                    { method: 'upi', flows: ['intent', 'collect', 'qr'] },
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
      toast.error('Error initializing payment checkout: ' + err.message);
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

  // Team Link / Player Link: representative starts here with ONE form, then pays.
  if (isTeamInviteLinkType(tournament.type)) {
    return (
      <TeamInviteStartClient
        slug={tournament.slug || slug}
        tournament={{
          name: tournament.name,
          theme: tournament.theme,
          sport: tournament.sport,
          minPlayers: tournament.minPlayers,
          maxPlayers: tournament.maxPlayers,
          fee: tournament.fee,
          venue: tournament.venue,
          banner: tournament.banner,
          description: tournament.description,
          rules: tournament.rules,
          terms: tournament.terms,
          registrationDeadline: tournament.registrationDeadline,
          organizerName: tournament.organizerName,
          organizerPhone: tournament.organizerPhone,
          sponsors: tournament.sponsors,
          formConfig: tournament.formConfig,
          customFields: tournament.customFields,
          sportsConfig: tournament.sportsConfig,
          ageCategories: tournament.ageCategories,
          teamCustomFields: tournament.teamCustomFields,
        }}
      />
    );
  }

  const sportsConfig = (tournament.sportsConfig || []) as SportEntry[];
  const ageCategoryOptions = Array.isArray(tournament.ageCategories)
    ? (tournament.ageCategories as AgeCategoryDef[])
    : [];
  const requireAgeCategoryPick = ageCategoryOptions.length > 0;
  const selectedAgeCategory =
    requireAgeCategoryPick
      ? ageCategoryOptions.find((c) => c.id === selectedAgeCategoryId) || null
      : null;
  const multiSport = isMultiSportMode(sportsConfig);
  const feeMode = resolveTournamentFeeMode({
    formConfig: tournament.formConfig,
    sportsConfig,
    ageCategories: tournament.ageCategories as AgeCategoryDef[] | undefined,
  });
  const payable = resolveTournamentPayable({
    feeMode,
    legacyFee: Number(tournament.fee) || 0,
    sportsConfig,
    selectedSportIds,
    ageCategories: tournament.ageCategories as AgeCategoryDef[] | undefined,
    selectedAgeCategoryId,
  });
  const ageCategoryFee = feeMode === 'category' ? payable.fee : 0;
  const feeAmount = payable.fee;
  const multiBounds = multiSport
    ? rosterBoundsForSelection(payable.selected)
    : null;
  const soloForced = isSoloTournamentType(tournament.type);
  const soloBounds = soloForced
    ? soloTournamentRosterBounds(payable.selected)
    : null;
  // Solo + doubles → partner roster (2); solo singles → 1 player; else team/doubles rules.
  // Never ask team name / representative on Solo tournaments.
  const isTeam = soloForced
    ? Boolean(soloBounds && !soloBounds.individualOnly)
    : multiSport
      ? Boolean(multiBounds && !multiBounds.individualOnly)
      : tournament.type === 'Team';
  const requireTeamIdentity = soloForced
    ? false
    : multiSport
      ? Boolean(multiBounds?.hasTeamSport)
      : tournament.type === 'Team';
  const needsPlayerTeamNames = requireTeamIdentity && Boolean(multiBounds?.needsTeamSlot);
  const selectedTeamSports = multiSport
    ? teamSportsFromSelection(payable.selected)
    : [];
  const isSoloDoubles = Boolean(soloForced && soloBounds?.hasDoubles);
  const activeProfileKinds = profileKindsForRegistration({
    multiSport,
    selected: payable.selected,
    tournamentSport: tournament.sport,
  });
  activeProfileKindsRef.current = activeProfileKinds;
  const rosterMin = soloForced
    ? soloBounds?.minPlayers || 1
    : multiSport
      ? multiBounds?.minPlayers || 1
      : tournament.type === 'Team'
        ? tournament.minPlayers
        : 1;
  const rosterMax = soloForced
    ? soloBounds?.maxPlayers || 1
    : multiSport
      ? multiBounds?.maxPlayers || 1
      : tournament.maxPlayers;
  const stepsList = isTeam
    ? requireTeamIdentity
      ? ['Details', 'Team Info', 'Players', 'Payment']
      : isSoloDoubles
        ? ['Details', 'You & Partner', 'Payment']
        : ['Details', 'Players', 'Payment']
    : ['Details', 'Player Info', 'Payment'];

  const overviewDescription = String(tournament.description || '').trim();
  const overviewRules = String(tournament.rules || '').trim();
  const overviewTerms = String(tournament.terms || '').trim();

  const canContinueStep1 =
    (!overviewTerms || termsAccepted) &&
    (!requireAgeCategoryPick || Boolean(selectedAgeCategoryId)) &&
    !(multiSport && selectedSportIds.length === 0) &&
    !(multiSport && requireAgeCategoryPick && !selectedAgeCategoryId);

  /** Map internal step → progress bar index (1-based within stepsList). */
  const progressStepIndex = (() => {
    if (!isTeam || requireTeamIdentity) return step;
    if (step <= 1) return 1;
    if (step === 3) return 2;
    if (step === 4) return 3;
    if (step >= 5) return 4;
    return 1;
  })();

  const goAfterDetails = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (isTeam && !requireTeamIdentity) setStep(3);
    else setStep((s) => s + 1);
  };

  const step1ChecklistItems = [
    ...(requireAgeCategoryPick
      ? [{ id: 'category', label: 'Select your age category', done: Boolean(selectedAgeCategoryId) }]
      : []),
    ...(multiSport
      ? [{ id: 'sports', label: 'Choose at least one sport / event', done: selectedSportIds.length > 0 }]
      : []),
    ...(overviewTerms
      ? [{ id: 'terms', label: 'Accept Terms & Conditions', done: termsAccepted }]
      : []),
  ];

  const handleStep1Continue = () => {
    const pending = step1ChecklistItems.filter((item) => !item.done);
    if (pending.length > 0) {
      toast.error(`Please complete: ${pending.map((p) => p.label).join(', ')}`);
      return;
    }
    goAfterDetails();
  };

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
              {soloForced
                ? 'Individual / Solo Entry'
                : isTeam
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
            <RegisterStepProgress steps={stepsList} currentIndex={progressStepIndex} />

        {/* ================= STEP 1: TOURNAMENT DETAILS ================= */}
        {step === 1 && (
          <div className={`glass-panel animate-fade-in ${styles.card}`}>
            <div className={styles.overviewIntro}>
              <h2 className={styles.cardTitle}>Tournament Overview</h2>
              <p className={styles.overviewLead}>
                Review details below, pick your category and events, then continue to enter player
                information and pay.
              </p>
            </div>

            {requireAgeCategoryPick && (
              <div className={styles.enrollmentStep}>
                <div className={styles.enrollmentStepHeader}>
                  <span className={styles.enrollmentStepBadge}>Step 1</span>
                  <h3 className={styles.sportsPickerTitle}>Select age category *</h3>
                  <p className={styles.sportsPickerHint}>
                    Choose the category that matches your date of birth.
                  </p>
                </div>
                <div className={styles.ageCategoryGuide} role="listbox" aria-label="Age categories">
                  {ageCategoryOptions.map((cat) => {
                    const active = selectedAgeCategoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={[
                          styles.ageCategoryCard,
                          styles.ageCategoryPickCard,
                          active ? styles.ageCategoryCardActive : '',
                          active ? styles.ageCardMen : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          setSelectedAgeCategoryId(cat.id);
                          if (multiSport) setSelectedSportIds([]);
                        }}
                      >
                        {active ? (
                          <CheckCircle2 size={18} className={styles.ageCategoryPickCheck} aria-hidden />
                        ) : null}
                        <div className={styles.ageCategoryCardTop}>
                          <span className={styles.ageCategoryCardTitle}>{cat.name}</span>
                          <span className={styles.ageCategoryCardRange}>
                            {formatAgeCategoryRange(cat)}
                            {feeMode === 'category' && Number(cat.fee) >= 0
                              ? ` · ₹${Number(cat.fee).toLocaleString('en-IN')}`
                              : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!selectedAgeCategoryId && (
                  <p className={styles.sportsPickerTotalWarn}>Select an age category to continue</p>
                )}
              </div>
            )}

            {multiSport && (
              <div
                className={styles.enrollmentStep}
                style={
                  requireAgeCategoryPick && !selectedAgeCategoryId
                    ? { opacity: 0.45, pointerEvents: 'none' }
                    : undefined
                }
              >
                <div className={styles.enrollmentStepHeader}>
                  <span className={styles.enrollmentStepBadge}>
                    {requireAgeCategoryPick ? 'Step 2' : 'Step 1'}
                  </span>
                  <h3 className={styles.sportsPickerTitle}>Select sports *</h3>
                  <p className={styles.sportsPickerHint}>
                  {requireAgeCategoryPick && !selectedAgeCategoryId
                    ? 'Pick an age category above first.'
                    : feeMode === 'sport'
                      ? 'Select the events you want to join. Total is the sum of selected fees.'
                      : feeMode === 'category'
                        ? 'Select events to enroll in. Fee is based on your age category.'
                        : 'Select events to enroll in.'}
                </p>
                </div>
                <div className={styles.sportsPickerList}>
                  {groupSportsForDisplay(sportsConfig).map((group) => (
                    <div key={group.family} className={styles.sportsFamily}>
                      {group.entries.length > 1 && (
                        <div className={styles.sportsFamilyTitle}>{group.family}</div>
                      )}
                      <div className={styles.sportsOptions}>
                        {group.entries.map((s) => {
                          const checked = selectedSportIds.includes(s.id);
                          const title =
                            group.entries.length > 1 ? s.formatLabel || s.name : s.name;
                          const metaParts = [
                            entryTypeLabel(s.entryType),
                            s.entryType === 'team'
                              ? `${s.minPlayers}–${s.maxPlayers} players`
                              : s.entryType === 'doubles'
                                ? '2 players'
                                : '1 player',
                          ];
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
                                <span className={styles.sportOptionMeta}>
                                  {metaParts.join(' · ')}
                                </span>
                              </span>
                              <span className={styles.sportOptionFee}>
                                {feeMode === 'sport' ? `₹${s.fee.toLocaleString('en-IN')}` : '—'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.sportsPickerTotal}>
                  <span className={styles.sportsPickerTotalLabel}>Total payable</span>
                  <span className={styles.sportsPickerTotalAmount}>
                    ₹{feeAmount.toLocaleString('en-IN')}
                  </span>
                  {ageCategoryFee >= 0 && selectedAgeCategory && feeMode === 'category' ? (
                    <p className={styles.sportsPickerHint} style={{ margin: '0.35rem 0 0', width: '100%' }}>
                      {selectedAgeCategory.name} category fee ₹
                      {ageCategoryFee.toLocaleString('en-IN')}
                      {' (sport fees not added)'}
                    </p>
                  ) : null}
                  {selectedSportIds.length === 0 && (
                    <p className={styles.sportsPickerTotalWarn}>Select at least one sport to continue</p>
                  )}
                </div>
              </div>
            )}

            {overviewDescription ? (
              <div className={styles.infoSection}>
                <div className={styles.infoSectionHeader}>
                  <FileText size={18} className={styles.infoSectionIcon} aria-hidden />
                  <h3 className={styles.infoSectionTitle}>Description</h3>
                </div>
                <p className={styles.infoSectionBody}>{overviewDescription}</p>
              </div>
            ) : null}

            {overviewRules ? (
              <div className={styles.infoSection}>
                <div className={styles.infoSectionHeader}>
                  <ClipboardList size={18} className={styles.infoSectionIcon} aria-hidden />
                  <h3 className={styles.infoSectionTitle}>Game Rules</h3>
                </div>
                <p className={styles.infoSectionBody}>{overviewRules}</p>
              </div>
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

            {overviewTerms ? (
              <>
                <div id="terms-section" className={styles.infoSection}>
                  <div className={styles.infoSectionHeader}>
                    <ScrollText size={18} className={styles.infoSectionIcon} aria-hidden />
                    <h3 className={styles.infoSectionTitle}>Terms &amp; Conditions</h3>
                  </div>
                  <div className={styles.termsBox}>
                    <p className={styles.infoSectionBody}>{overviewTerms}</p>
                  </div>
                </div>

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
              </>
            ) : null}

            <RegisterStepChecklist items={step1ChecklistItems} />

            <div className={styles.registerStickyFooter}>
            <button
              type="button"
              onClick={handleStep1Continue}
              className={`btn-primary ${styles.fullWidthBtn}`}
              aria-disabled={!canContinueStep1}
              style={{
                opacity: canContinueStep1 ? 1 : 0.85,
                transition: 'all 0.3s ease',
              }}
            >
              Continue to {isTeam ? (requireTeamIdentity ? 'team details' : 'players') : 'player info'}{' '}
              <ChevronRight size={20} />
            </button>
            </div>
          </div>
        )}

        {/* ================= TEAM FLOW: STEP 2 (TEAM INFO) — team sports only ================= */}
        {isTeam && requireTeamIdentity && step === 2 && (
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
              <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                <label>
                  Team name <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Mumbai Strikers"
                  value={teamInfo.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setTeamInfo((info) => ({ ...info, name }));
                    if (needsPlayerTeamNames) {
                      const next: Record<string, string> = {};
                      for (const s of selectedTeamSports) next[s.id] = name;
                      setTeamsBySport(next);
                    }
                  }}
                />
                {needsPlayerTeamNames ? (
                  <p style={{ margin: '0.4rem 0 0', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.45 }}>
                    This team is enrolled in:{' '}
                    <strong style={{ color: '#e2e8f0' }}>
                      {payable.selected.map((s) => s.name).join(', ') || '—'}
                    </strong>
                    . Same name is used for every team sport
                    {selectedTeamSports.length > 0
                      ? ` (${selectedTeamSports.map((s) => s.name).join(', ')})`
                      : ''}
                    .
                    {teamInfo.name.trim() && selectedTeamSports.length > 0 && (
                      <>
                        {' '}
                        Capacity check:{' '}
                        {selectedTeamSports
                          .map((s) => {
                            const used = seatsUsed(s, teamInfo.name, teamOccupancy);
                            const left = seatsRemaining(s, teamInfo.name, teamOccupancy);
                            return `${s.name} ${used}/${s.maxPlayers} (${left} left)`;
                          })
                          .join(' · ')}
                      </>
                    )}
                  </p>
                ) : null}
                {needsPlayerTeamNames &&
                  teamInfo.name.trim() &&
                  selectedTeamSports.some(
                    (s) => seatsRemaining(s, teamInfo.name, teamOccupancy) < playerCount
                  ) && (
                    <p style={{ margin: '0.35rem 0 0', color: '#f87171', fontSize: '0.8rem' }}>
                      Not enough seats for {playerCount} players on this team name for one or more
                      sports. Change the name or reduce roster size.
                    </p>
                  )}
              </div>
              <div className={styles.formGroup}>
                <label>Team Representative Name <span style={{ color: 'var(--error)' }}>*</span></label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={teamInfo.representative}
                  onChange={(e) => setTeamInfo({ ...teamInfo, representative: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Contact Number <span style={{ color: 'var(--error)' }}>*</span></label>
                <input
                  required
                  type="tel"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  minLength={10}
                  placeholder="10-digit mobile (No +91 or 0)"
                  value={teamInfo.contact}
                  onChange={(e) =>
                    setTeamInfo({ ...teamInfo, contact: formatPhoneNumber(e.target.value) })
                  }
                />
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
              const minRequired = Math.max(1, rosterMin || 1);
              if (playerCount < minRequired) {
                toast.error(`This tournament requires at least ${minRequired} players per team.`);
                return;
              }
              if (config.cricketProfile?.required) {
                for (let i = 0; i < playerCount; i++) {
                  const p = teamPlayers[i];
                  if (activeProfileKinds.length > 0) {
                    const profiles = ensureSportProfiles(p?.sportProfiles, activeProfileKinds, p);
                    const err = validateSportProfiles(profiles, activeProfileKinds, true);
                    if (err) {
                      toast.error(`Player ${i + 1}: ${err}`);
                      return;
                    }
                    continue;
                  }
                  if (!usesStructuredSportsProfile(tournament)) {
                    if (!p?.role?.trim()) {
                      toast.error(`Please enter playing role / position for player ${i + 1}.`);
                      return;
                    }
                    continue;
                  }
                  const roles = parseSportRoles(tournament?.sport, p?.role);
                  if (roles.length === 0) {
                    toast.error(
                      isFootballSport(tournament)
                        ? `Please select at least one position for player ${i + 1}.`
                        : `Please select at least one playing role for player ${i + 1}.`,
                    );
                    return;
                  }
                  if (isCricketSport(tournament)) {
                    const hand = normalizeBattingHandUi(p.battingHand);
                    if (cricketRolesNeedBattingHand(roles) && !hand) {
                      toast.error(`Please select batting hand for player ${i + 1}.`);
                      return;
                    }
                    if (cricketRolesNeedBowling(roles) && !p.bowlingType?.trim()) {
                      toast.error(`Please select bowling style for player ${i + 1}.`);
                      return;
                    }
                  }
                }
              }
              if (
                !validatePlayersAgeCategories(teamPlayers.slice(0, playerCount), {
                  teamLabels: true,
                  soloDoubles: isSoloDoubles,
                })
              ) {
                return;
              }
              const customDefs = parseCustomFields(tournament.customFields);
              for (let i = 0; i < playerCount; i++) {
                const customErr = validateCustomFieldAnswers(customDefs, teamPlayers[i]?.customValues);
                if (customErr) {
                  toast.error(`Player ${i + 1}: ${customErr}`);
                  return;
                }
              }
              nextStep();
            }}
            className={`glass-panel animate-fade-in delay-100 ${styles.playersStepPanel}`}
          >
            <div className={`${styles.playersHeader} ${styles.playersHeaderBar}`}>
              <div className={styles.playersStepHeader}>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                  {isSoloDoubles ? 'You & Partner Details' : 'Add Player Details'}
                </h2>
                <p className={styles.playersStepSubtitle}>
                  {isSoloDoubles
                    ? 'Enter your details and your doubles partner’s details'
                    : (rosterMin || 1) > 1
                      ? `Add ${rosterMin}–${rosterMax} players — this roster plays all selected sports`
                      : 'Fill in details for your team members — one roster for all selected sports'}
                </p>
              </div>
              
              {!isSoloDoubles && (
                <div className={styles.playerCountWidget}>
                  <span className={styles.playerCountLabel}>Players to register</span>

                  <div className={styles.playerCountControls}>
                    <button
                      type="button"
                      className={styles.playerCountBtn}
                      disabled={playerCount <= (rosterMin || 1)}
                      onClick={() => handlePlayerCountChange(playerCount - 1)}
                      aria-label="Decrease player count"
                    >
                      <Minus size={14} strokeWidth={3} />
                    </button>

                    <span className={styles.playerCountValue}>{playerCount}</span>

                    <button
                      type="button"
                      className={styles.playerCountBtn}
                      disabled={playerCount >= (rosterMax || 10)}
                      onClick={() => handlePlayerCountChange(playerCount + 1)}
                      aria-label="Increase player count"
                    >
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.playersList}>
              {teamPlayers.slice(0, playerCount).map((player, idx) => (
                <div key={idx} className={`glass-panel ${styles.playerCard} animate-slide-in-right delay-${Math.min(idx * 100, 400)}`}>
                  <div className={styles.playerHeader}>
                    <div className={styles.playerAvatar}>
                      <User size={20} />
                    </div>
                    <h3>
                      {isSoloDoubles
                        ? idx === 0
                          ? 'You'
                          : 'Partner'
                        : `Player ${idx + 1}`}
                    </h3>
                  </div>
                  
                  <div className={styles.formGrid}>
                    <OrderedPlayerFields
                      fieldKeys={orderedFieldKeys}
                      player={player}
                      config={config}
                      tournament={tournament}
                      selectedAgeCategoryId={selectedAgeCategoryId}
                      variant="team"
                      playerIndex={idx}
                      photoFileLabel={teamPhotoFileLabels[idx]}
                      formatPhoneNumber={formatPhoneNumber}
                      profileKinds={activeProfileKinds}
                      preferSelectedSportProfiles={multiSport}
                      onChange={(key, value) => handleTeamPlayerChange(idx, key, value)}
                      onCustomChange={(label, value) => handleTeamPlayerCustomValueChange(idx, label, value)}
                      onSportRoleToggle={(role) => handleTeamPlayerSportRoleToggle(idx, role)}
                      onSportProfileRoleToggle={(kind, role) =>
                        handleTeamPlayerSportProfileRoleToggle(idx, kind, role)
                      }
                      onSportProfileFieldChange={(kind, field, value) =>
                        handleTeamPlayerSportProfileFieldChange(idx, kind, field, value)
                      }
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
              <button type="button" onClick={() => setStep(requireTeamIdentity ? 2 : 1)} className="btn-secondary">Back</button>
              <button type="submit" className="btn-primary">Next: Review & Pay</button>
            </div>
          </form>
        )}

        {/* ================= TEAM FLOW: STEP 4 (PAYMENT Summary) ================= */}
        {isTeam && step === 4 && (
          <div className={`glass-panel animate-fade-in delay-100 ${styles.card}`}>
            <h2 className={`${styles.cardTitle} ${styles.cardSectionTitle}`}>
              {isSoloDoubles
                ? 'Doubles Summary & Payment'
                : requireTeamIdentity
                  ? 'Team Registration Summary & Payment'
                  : 'Registration Summary & Payment'}
            </h2>
            
            <div className={styles.summaryBlock}>
              <h3>
                <Users size={18} />{' '}
                {requireTeamIdentity
                  ? 'Team Details Summary'
                  : isSoloDoubles
                    ? 'You & Partner'
                    : 'Entry Summary'}
              </h3>
              {requireTeamIdentity ? (
                <>
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Team Name:</strong> {teamInfo.name}</p>
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Team Representative Name:</strong> {teamInfo.representative}</p>
                  <p style={{ margin: '0.4rem 0', color: '#cbd5e1' }}><strong>Contact Number:</strong> {teamInfo.contact}</p>
                </>
              ) : (
                <p style={{ margin: '0.4rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                  {isSoloDoubles
                    ? 'Doubles entry — you + partner. No team representative.'
                    : 'Singles / doubles entry — no team name required.'}
                </p>
              )}
              <p style={{ margin: '0.4rem 0', color: '#cbd5e1', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                <strong>{isSoloDoubles ? 'Players:' : 'Roster Size:'}</strong>{' '}
                {isSoloDoubles ? 'You + Partner' : `${playerCount} players`}
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--theme-color)', fontWeight: 600 }}>
                  {isSoloDoubles ? 'Player Details:' : 'Roster Details:'}
                </p>
                {teamPlayers.slice(0, playerCount).map((p, idx) => (
                  <div key={idx} style={{ fontSize: '0.9rem', color: '#cbd5e1', paddingLeft: '0.5rem', borderLeft: '2px solid var(--theme-color)' }}>
                    <strong>
                      {isSoloDoubles
                        ? idx === 0
                          ? 'You:'
                          : 'Partner:'
                        : `Player ${idx + 1}:`}
                    </strong>{' '}
                    {p.name || 'Unnamed'} 
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
                ₹{feeAmount.toLocaleString('en-IN')}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" onClick={() => setStep(3)} className="btn-secondary">Back</button>
              <button
                type="button"
                onClick={handlePayment}
                className="btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Processing…'
                  : feeAmount <= 0
                    ? 'Complete Registration'
                    : `Pay ₹${feeAmount.toLocaleString('en-IN')} & Complete Registration`}
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
                if (activeProfileKinds.length > 0) {
                  const profiles = ensureSportProfiles(
                    individualPlayer.sportProfiles,
                    activeProfileKinds,
                    individualPlayer
                  );
                  const err = validateSportProfiles(profiles, activeProfileKinds, true);
                  if (err) {
                    toast.error(err);
                    return;
                  }
                } else if (!usesStructuredSportsProfile(tournament)) {
                  if (!individualPlayer.role?.trim()) {
                    toast.error('Please enter your playing role / position.');
                    return;
                  }
                } else {
                const roles = parseSportRoles(tournament?.sport, individualPlayer.role);
                if (roles.length === 0) {
                  toast.error(
                    isFootballSport(tournament)
                      ? 'Please select at least one position.'
                      : 'Please select at least one playing role.',
                  );
                  return;
                }
                if (isCricketSport(tournament)) {
                  const hand = normalizeBattingHandUi(individualPlayer.battingHand);
                  if (cricketRolesNeedBattingHand(roles) && !hand) {
                    toast.error('Please select your batting hand.');
                    return;
                  }
                  if (cricketRolesNeedBowling(roles) && !individualPlayer.bowlingType?.trim()) {
                    toast.error('Please select your bowling style.');
                    return;
                  }
                }
                }
              }
              if (!validatePlayersAgeCategories([individualPlayer])) {
                return;
              }
              const customErr = validateCustomFieldAnswers(
                parseCustomFields(tournament.customFields),
                individualPlayer.customValues
              );
              if (customErr) {
                toast.error(customErr);
                return;
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
                selectedAgeCategoryId={selectedAgeCategoryId}
                variant="individual"
                photoFileLabel={individualPhotoFileLabel}
                photoInputRef={individualPhotoInputRef}
                formatPhoneNumber={formatPhoneNumber}
                profileKinds={activeProfileKinds}
                preferSelectedSportProfiles={multiSport}
                onChange={(key, value) => handleIndividualInputChange(key, value)}
                onCustomChange={(label, value) => handleIndividualCustomValueChange(label, value)}
                onSportRoleToggle={(role) => handleIndividualSportRoleToggle(role)}
                onSportProfileRoleToggle={handleIndividualSportProfileRoleToggle}
                onSportProfileFieldChange={handleIndividualSportProfileFieldChange}
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
                ₹{feeAmount.toLocaleString('en-IN')}
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button
                type="button"
                onClick={handlePayment}
                className="btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Processing…'
                  : feeAmount <= 0
                    ? 'Complete Registration'
                    : `Pay ₹${feeAmount.toLocaleString('en-IN')} & Complete Registration`}
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
                  {requireTeamIdentity ? (
                    <>
                      Your team <strong>{teamInfo.name}</strong> has been successfully registered for{' '}
                      {tournament.name}.
                    </>
                  ) : (
                    <>
                      Your entry has been successfully registered for {tournament.name}.
                    </>
                  )}
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
                  {requireTeamIdentity ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Team Representative Name</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamInfo.representative}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Contact Number</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamInfo.contact}</span>
                      </div>
                    </>
                  ) : isSoloDoubles ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>You</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamPlayers[0]?.name || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Partner</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamPlayers[1]?.name || '—'}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Lead player</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{teamPlayers[0]?.name || '—'}</span>
                    </div>
                  )}

                  {feeAmount > 0 && (
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
                    <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                      {isSoloDoubles ? 'Players' : 'Total Team Members'}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                      {isSoloDoubles ? 'You + Partner' : `${playerCount} players`}
                    </span>
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
                  {feeAmount > 0 && (
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
