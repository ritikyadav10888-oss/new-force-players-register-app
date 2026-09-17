'use client';

import { toast } from 'sonner';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Download, Users, IndianRupee } from 'lucide-react';
import { adminFetch } from '@/lib/auth/admin-client';
import { formatSportExportStyleSummary } from '@/lib/sport-utils';
import { resolveSportsProfileForTournament } from '@/lib/form-config';
import {
  flattenTeamsFromSports,
  isTeamInviteLinkType,
  isTeamLikeTournamentType,
  parsePrecreatedTeams,
  parseSportsConfig,
  type SportEntry,
} from '@/lib/multi-sport';
import { teamInviteLivePath, teamInvitePlayerPath } from '@/lib/team-invites/token';
import { AdminTeamLinkPlayerActions } from '@/components/team-invite/AdminTeamLinkPlayerEditor';
import { TeamInvitePanel } from '@/components/team-invite/TeamInvitePanel';
import { groupSportsForDisplay } from '@/lib/sport-presets';
import {
  formatSportProfilesExport,
  parseSportProfiles,
} from '@/lib/sport-profiles';
import { findAgeCategoryById, parseAgeCategories } from '@/lib/age-categories';
import * as XLSX from 'xlsx';
import styles from './tournamentRegistrations.module.css';

/** Batch-convert stored image refs (private bucket) into 120-day signed URLs. */
async function fetchSignedUrls(values: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(values.filter((v) => v && v !== '-'))];
  if (unique.length === 0) return {};
  try {
    const res = await adminFetch('/api/admin/signed-urls', {
      method: 'POST',
      body: JSON.stringify({ values: unique }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { urls?: Record<string, string> };
    return json.urls || {};
  } catch {
    return {};
  }
}

const EXCEL_MAX_CELL_CHARS = 32767;
const EXCEL_MAX_SHEET_NAME_LEN = 31;

function excelSafeCell(v: unknown): string {
  if (v == null) return '-';
  const s = String(v);
  if (s.length <= EXCEL_MAX_CELL_CHARS) return s;
  return `${s.slice(0, EXCEL_MAX_CELL_CHARS - 30)}… (trimmed ${s.length - EXCEL_MAX_CELL_CHARS} chars)`;
}

function normalizeAgeCategoryLabel(raw: unknown): string {
  const s = raw == null ? '' : String(raw).trim();
  if (!s || s === '-') return 'Uncategorized';
  return s;
}

function sanitizeExcelSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) name = 'Sheet';
  if (name.length > EXCEL_MAX_SHEET_NAME_LEN) {
    name = name.slice(0, EXCEL_MAX_SHEET_NAME_LEN).trim();
  }
  let candidate = name;
  let n = 1;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    const base = name.slice(0, Math.max(1, EXCEL_MAX_SHEET_NAME_LEN - suffix.length));
    candidate = `${base}${suffix}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function applySheetColumnWidths(ws: XLSX.WorkSheet, headers: string[]) {
  const colWidths = headers.map((h) => ({
    wch: Math.min(
      56,
      Math.max(
        12,
        String(h).length + 2,
        h === 'Selected Sports' || h === 'Fee Breakdown' || h === 'Entry / Pair' ? 28 : 12
      )
    ),
  }));
  (ws as { '!cols'?: { wch: number }[] })['!cols'] = colWidths;
}

function appendDataSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  headers: string[],
  rows: string[][],
  usedSheetNames: Set<string>
) {
  const name = sanitizeExcelSheetName(sheetName, usedSheetNames);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  applySheetColumnWidths(ws, headers);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function orderAgeCategorySheetLabels(
  grouped: Map<string, string[][]>,
  tournamentAgeCategories: { name: string }[]
): string[] {
  const configured = tournamentAgeCategories.map((c) => c.name);
  const configuredSet = new Set(configured);
  const extras = [...grouped.keys()]
    .filter((label) => !configuredSet.has(label) && label !== 'Uncategorized')
    .sort((a, b) => a.localeCompare(b));
  const ordered = [
    ...configured.filter((label) => grouped.has(label)),
    ...extras,
    ...(grouped.has('Uncategorized') ? ['Uncategorized'] : []),
  ];
  return ordered;
}

/** Compress + resize an image in the browser to a small JPEG data URL. */
function compressImage(file: File, callback: (base64: string) => void) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new window.Image();
    img.src = event.target?.result as string;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 800;
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
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
  };
}

/** Thumbnail + optional upload/replace control for a single player's photo. */
function AdminPlayerPhoto({
  player,
  thumbSrc,
  allowEdit,
  onUpdated,
}: {
  player: {
    id?: string;
    name?: string;
    dob?: string | null;
    age?: string | number | null;
    ageCategory?: string | null;
  };
  thumbSrc: string;
  allowEdit: boolean;
  onUpdated: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `admin-photo-${player.id || Math.random().toString(36).slice(2)}`;

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB. Please upload a smaller image.');
      e.target.value = '';
      return;
    }
    compressImage(file, async (dataUrl) => {
      setBusy(true);
      try {
        const res = await adminFetch('/api/admin/players/photo', {
          method: 'POST',
          body: JSON.stringify({ playerId: player.id, dataUrl }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to update photo');
        onUpdated(json.url as string);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update photo');
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    });
  };

  const initial = (player.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.playerPhotoRow}>
      {thumbSrc ? (
        <img src={thumbSrc} alt={player.name || 'Player'} className={styles.playerThumb} />
      ) : (
        <div className={styles.playerThumbEmpty} aria-hidden>
          {initial}
        </div>
      )}
      <div className={styles.playerPhotoInfo}>
        <span className={styles.playerPhotoName}>{player.name || '-'}</span>
        {(player.dob || player.ageCategory || player.age) && (
          <span className={styles.playerPhotoMeta}>
            {[
              player.dob ? `DOB ${player.dob}` : null,
              player.ageCategory || null,
              player.age != null && player.age !== '' ? `Age ${player.age}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
      {allowEdit && player.id && (
        <>
          <input id={inputId} type="file" accept="image/*" hidden onChange={handlePick} disabled={busy} />
          <button
            type="button"
            className={styles.photoBtn}
            onClick={() => document.getElementById(inputId)?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading…' : thumbSrc ? 'Replace' : 'Upload'}
          </button>
        </>
      )}
    </div>
  );
}

type Props = {
  tournamentId: string;
  backHref: string;
  backLabel?: string;
  /** When false, hides the "Preview Form" link (e.g. read-only customer view still allowed). */
  showPreview?: boolean;
  /** When true (superadmin), shows per-player photo upload/replace controls. */
  allowPhotoEdit?: boolean;
};

export default function TournamentRegistrations({
  tournamentId,
  backHref,
  backLabel = 'Back to Dashboard',
  showPreview = true,
  allowPhotoEdit = false,
}: Props) {
  const [tournament, setTournament] = useState<any>({
    id: tournamentId,
    name: '',
    slug: '',
    fee: 0,
    type: 'Team',
    sport: 'Cricket',
    customFields: [],
    teamCustomFields: [],
  });

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // Freshly uploaded/replaced player photos, keyed by player id (shown instantly).
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  // Team-invite share links, keyed by registration id (only set for TeamLink registrations).
  const [inviteLinksByReg, setInviteLinksByReg] = useState<
    Record<string, { inviteId: string; player: string; live: string }>
  >({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState('');

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyLink = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(key);
      setTimeout(() => setCopiedLink(''), 2000);
      toast.success('Link copied');
    } catch {
      window.prompt('Copy link:', url);
    }
  };

  const fetchTournamentAndRegistrations = async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/tournaments/${tournamentId}/registrations`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load registrations');

      const tournamentData = body.tournament;
      const regsData = body.registrations || [];
      const invites = body.invites || [];

      if (tournamentData) {
        const sportsConfig = parseSportsConfig(tournamentData.sports_config);
        const precreatedTeams = parsePrecreatedTeams(tournamentData.precreated_teams);
        setTournament({
          id: tournamentData.id,
          name: tournamentData.name,
          slug: tournamentData.slug,
          fee: tournamentData.fee,
          type: tournamentData.type,
          sport: tournamentData.sport || 'Cricket',
          customFields: tournamentData.custom_fields || [],
          teamCustomFields: tournamentData.team_custom_fields || [],
          formConfig: tournamentData.form_config || {},
          ageCategories: parseAgeCategories(tournamentData.age_categories),
          sportsConfig,
          sports_config: sportsConfig,
          precreatedTeams: flattenTeamsFromSports(sportsConfig, precreatedTeams),
          minPlayers: tournamentData.min_players ?? 1,
          maxPlayers: tournamentData.max_players ?? 11,
          feeMode: tournamentData.fee_mode || 'flat',
        });
      }

      const mappedRegs = (regsData || []).map((r: any) => ({
        id: r.id,
        teamName: r.team_name,
        teamLogoUrl: r.team_logo_url,
        representative: r.representative,
        contact: r.contact,
        paymentStatus: r.payment_status,
        razorpayId: r.razorpay_payment_id || '-',
        selectedSports: Array.isArray(r.selected_sports) ? r.selected_sports : [],
        feeBreakdown: Array.isArray(r.fee_breakdown) ? r.fee_breakdown : [],
        teamsBySport:
          r.teams_by_sport && typeof r.teams_by_sport === 'object' && !Array.isArray(r.teams_by_sport)
            ? r.teams_by_sport
            : {},
        teamCustomValues:
          r.team_custom_values && typeof r.team_custom_values === 'object' && !Array.isArray(r.team_custom_values)
            ? r.team_custom_values
            : {},
        players: (r.players || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          emergencyContact: p.emergency_contact,
          dob: p.dob,
          age: p.age,
          ageCategory: p.age_category || null,
          gender: p.gender,
          aadhar: p.aadhar,
          jerseyName: p.jersey_name,
          jerseyNumber: p.jersey_number,
          jerseySize: p.jersey_size,
          photo: p.photo_url,
          role: p.role,
          battingHand: p.batting_hand,
          bowlingType: p.bowling_type,
          allRounderType: p.all_rounder_type,
          sportProfiles:
            p.sport_profiles && typeof p.sport_profiles === 'object' && !Array.isArray(p.sport_profiles)
              ? p.sport_profiles
              : {},
          customValues: p.custom_values || {},
        })),
      }));

      setRegistrations(mappedRegs);

      if (mappedRegs.length > 0 && tournamentData?.slug) {
        const linkMap: Record<string, { inviteId: string; player: string; live: string }> = {};
        for (const inv of invites) {
          if (!inv.registration_id || !inv.token || !inv.id) continue;
          linkMap[inv.registration_id] = {
            inviteId: inv.id,
            player: teamInvitePlayerPath(tournamentData.slug, inv.token),
            live: teamInviteLivePath(tournamentData.slug, inv.token),
          };
        }
        setInviteLinksByReg(linkMap);
      } else {
        setInviteLinksByReg({});
      }

      const imageRefs: string[] = [];
      mappedRegs.forEach((reg: any) => {
        if (reg.teamLogoUrl) imageRefs.push(reg.teamLogoUrl);
        (reg.players || []).forEach((p: any) => {
          if (p.photo) imageRefs.push(p.photo);
        });
      });
      if (imageRefs.length > 0) {
        const signed = await fetchSignedUrls(imageRefs);
        setSignedUrls(signed);
      }
    } catch (err: any) {
      console.error('Error fetching details:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournamentAndRegistrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const isTeamLinkAdmin = isTeamInviteLinkType(tournament.type);
  const handleExportExcel = async () => {
    const exportImageRefs: string[] = [];
    registrations.forEach((reg) => {
      if (reg.teamLogoUrl) exportImageRefs.push(reg.teamLogoUrl);
      (reg.players || []).forEach((p: any) => {
        if (p.photo) exportImageRefs.push(p.photo);
      });
    });
    const exportSigned = await fetchSignedUrls(exportImageRefs);
    const signFor = (value: unknown): string => {
      const v = value == null ? '' : String(value);
      return (v && exportSigned[v]) || v || '-';
    };

    const defaultExportConfig: Record<string, unknown> = {
      email: { enabled: true },
      phone: { enabled: true },
      emergencyContact: { enabled: true },
      dob: { enabled: true },
      age: { enabled: true },
      ageCategory: { enabled: true },
      gender: { enabled: true },
      jerseyName: { enabled: true },
      jerseyNumber: { enabled: true },
      jerseySize: { enabled: true },
      photo: { enabled: true },
      cricketProfile: { enabled: true, required: false },
    };
    const rawFc =
      tournament.formConfig &&
      typeof tournament.formConfig === 'object' &&
      !Array.isArray(tournament.formConfig)
        ? (tournament.formConfig as Record<string, unknown>)
        : {};
    const merged = { ...defaultExportConfig, ...rawFc };
    const config = {
      ...merged,
      cricketProfile: resolveSportsProfileForTournament(merged, tournament.sport),
    } as Record<string, { enabled?: boolean; required?: boolean } | undefined>;

    const isTeam = isTeamLikeTournamentType(tournament.type);

    const sportsConfigList = Array.isArray(tournament.sportsConfig)
      ? tournament.sportsConfig
      : Array.isArray(tournament.sports_config)
        ? tournament.sports_config
        : [];
    const sportNameById = new Map<string, string>();
    for (const s of sportsConfigList as { id?: string; name?: string }[]) {
      if (s?.id && s?.name) sportNameById.set(s.id, s.name);
    }

    const formatRegSports = (reg: {
      selectedSports?: string[];
      feeBreakdown?: { sportId?: string; name?: string; fee?: number }[];
      teamsBySport?: Record<string, string>;
    }) => {
      const teamMap =
        reg.teamsBySport && typeof reg.teamsBySport === 'object' ? reg.teamsBySport : {};
      const breakdown = Array.isArray(reg.feeBreakdown) ? reg.feeBreakdown : [];
      const selected = Array.isArray(reg.selectedSports) ? reg.selectedSports : [];

      let selectedSportsText = '-';
      if (breakdown.length > 0) {
        selectedSportsText = breakdown
          .map((b) => {
            const tid = b.sportId ? teamMap[b.sportId] : '';
            const teamLabel = tid ? ` → ${tid}` : '';
            return `${b.name || sportNameById.get(b.sportId || '') || 'Sport'}${teamLabel}`;
          })
          .join(', ');
      } else if (selected.length > 0) {
        selectedSportsText = selected
          .map((id) => {
            const base = sportNameById.get(id) || id;
            const tid = teamMap[id];
            return tid ? `${base} → ${tid}` : base;
          })
          .join(', ');
      }

      let feeBreakdownText = '-';
      let totalFee = Number(tournament.fee) || 0;
      if (breakdown.length > 0) {
        feeBreakdownText = breakdown
          .map((b) => `${b.name || 'Sport'} (₹${Number(b.fee) || 0})`)
          .join(', ');
        totalFee = breakdown.reduce((s, b) => s + (Number(b.fee) || 0), 0);
      }

      return {
        selectedSportsText,
        feeBreakdownText,
        totalFeeText: String(totalFee),
      };
    };

    const formatEntryPair = (reg: { players?: { name?: string }[] }) => {
      const names = (reg.players || [])
        .map((p) => String(p?.name || '').trim())
        .filter(Boolean);
      if (names.length >= 2) return names.join(' + ');
      if (names.length === 1) return names[0];
      return '-';
    };

    const allPlayers: any[] = registrations.flatMap((r: any) => r.players || []);
    const hasFieldData = (key: string): boolean =>
      allPlayers.some((p: any) => {
        const v = p?.[key];
        return v != null && String(v).trim() !== '' && String(v).trim() !== '-';
      });
    const show = {
      email: !!config.email?.enabled || hasFieldData('email'),
      phone: !!config.phone?.enabled || hasFieldData('phone'),
      emergencyContact: !!config.emergencyContact?.enabled || hasFieldData('emergencyContact'),
      dob: !!config.dob?.enabled || hasFieldData('dob'),
      age: !!config.age?.enabled || hasFieldData('age'),
      ageCategory: hasFieldData('ageCategory') || !!config.age?.enabled || !!config.dob?.enabled,
      gender: !!config.gender?.enabled || hasFieldData('gender'),
      jerseyName: !!config.jerseyName?.enabled || hasFieldData('jerseyName'),
      jerseyNumber: !!config.jerseyNumber?.enabled || hasFieldData('jerseyNumber'),
      jerseySize: !!config.jerseySize?.enabled || hasFieldData('jerseySize'),
      photo: !!config.photo?.enabled || hasFieldData('photo'),
      sportProfile: !!config.cricketProfile?.enabled || hasFieldData('role'),
    };

    const configuredLabels: string[] = (tournament.customFields || [])
      .map((f: any) => f.label)
      .filter((l: any) => typeof l === 'string' && l.trim() !== '');
    const customLabels: string[] = [...configuredLabels];
    allPlayers.forEach((p: any) => {
      const cv = p?.customValues;
      if (cv && typeof cv === 'object') {
        Object.keys(cv).forEach((k) => {
          const val = cv[k];
          const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== '-';
          if (hasVal && !customLabels.includes(k)) customLabels.push(k);
        });
      }
    });

    const teamCustomFieldsConfig: any[] = tournament.teamCustomFields || [];
    const teamCategoryFieldLabels = new Set(
      teamCustomFieldsConfig.filter((f: any) => f.type === 'category').map((f: any) => f.label)
    );
    const resolveTeamCustomCell = (label: string, raw: unknown): string => {
      const val = raw != null ? String(raw).trim() : '';
      if (!val) return '-';
      if (teamCategoryFieldLabels.has(label)) {
        const cat = findAgeCategoryById(tournament.ageCategories, val);
        return cat ? cat.name : val;
      }
      return val;
    };

    const teamCustomLabels: string[] = teamCustomFieldsConfig
      .map((f: any) => f.label)
      .filter((l: any) => typeof l === 'string' && l.trim() !== '');
    if (isTeam) {
      registrations.forEach((reg: any) => {
        const tcv = reg?.teamCustomValues;
        if (tcv && typeof tcv === 'object') {
          Object.keys(tcv).forEach((k) => {
            const val = tcv[k];
            const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== '-';
            if (hasVal && !teamCustomLabels.includes(k)) teamCustomLabels.push(k);
          });
        }
      });
    }

    const headers = ['Registration ID', isTeam ? 'Team Name' : 'Player Name'];

    if (isTeam) {
      headers.push('Representative', 'Contact Mobile', 'Team Logo URL');
      teamCustomLabels.forEach((label) => headers.push(`Team: ${label}`));
    } else {
      headers.push('Contact Info');
    }

    headers.push(
      'Entry / Pair',
      'Payment Status',
      'Razorpay ID',
      'Selected Sports',
      'Fee Breakdown',
      'Total Fee'
    );

    if (isTeam) {
      headers.push('Roster Player Name');
    }

    if (show.email) headers.push('Player Email');
    if (show.phone) headers.push('Player Phone');
    if (show.emergencyContact) headers.push('Emergency Contact');
    if (show.dob) headers.push('Player DOB');
    if (show.age) headers.push('Player Age');
    if (show.ageCategory) headers.push('Age Category');
    if (show.gender) headers.push('Gender');
    if (show.jerseyName) headers.push('Jersey Name');
    if (show.jerseyNumber) headers.push('Jersey Number');
    if (show.jerseySize) headers.push('Jersey Size');
    if (show.photo) headers.push('Player Photo URL');

    if (show.sportProfile) {
      headers.push(tournament.sport === 'Football' ? 'Position(s)' : 'Sport role(s)');
      headers.push(tournament.sport === 'Football' ? 'Positions (export)' : 'Sport style / details');
    }

    headers.push('Cricket Roles', 'Cricket Details', 'Football Positions');

    headers.push(...customLabels);

    const rows: string[][] = [];
    registrations.forEach((reg) => {
      const sportsCells = formatRegSports(reg);
      const entryPair = formatEntryPair(reg);
      if (!reg.players || reg.players.length === 0) {
        const baseRow = [excelSafeCell(reg.id), excelSafeCell(reg.teamName || '-')];
        if (isTeam) {
          baseRow.push(
            excelSafeCell(reg.representative || '-'),
            excelSafeCell(reg.contact || '-'),
            excelSafeCell(signFor(reg.teamLogoUrl))
          );
        } else {
          baseRow.push(excelSafeCell(reg.contact || '-'));
        }
        baseRow.push(
          excelSafeCell(entryPair),
          excelSafeCell(reg.paymentStatus || '-'),
          excelSafeCell(reg.razorpayId || '-'),
          excelSafeCell(sportsCells.selectedSportsText),
          excelSafeCell(sportsCells.feeBreakdownText),
          excelSafeCell(sportsCells.totalFeeText)
        );

        const remainingLength = headers.length - baseRow.length;
        for (let i = 0; i < remainingLength; i++) {
          baseRow.push('-');
        }
        rows.push(baseRow);
      } else {
        reg.players.forEach((player: any) => {
          const row = [
            excelSafeCell(reg.id),
            excelSafeCell(isTeam ? reg.teamName || '-' : player.name || '-'),
          ];

          if (isTeam) {
            row.push(
              excelSafeCell(reg.representative || '-'),
              excelSafeCell(reg.contact || '-'),
              excelSafeCell(signFor(reg.teamLogoUrl))
            );
            teamCustomLabels.forEach((label) => {
              row.push(excelSafeCell(resolveTeamCustomCell(label, reg.teamCustomValues?.[label])));
            });
          } else {
            row.push(excelSafeCell(reg.contact || '-'));
          }

          row.push(
            excelSafeCell(entryPair),
            excelSafeCell(reg.paymentStatus || '-'),
            excelSafeCell(reg.razorpayId || '-'),
            excelSafeCell(sportsCells.selectedSportsText),
            excelSafeCell(sportsCells.feeBreakdownText),
            excelSafeCell(sportsCells.totalFeeText)
          );

          if (isTeam) {
            row.push(excelSafeCell(player.name || '-'));
          }

          if (show.email) row.push(excelSafeCell(player.email || '-'));
          if (show.phone) row.push(excelSafeCell(player.phone || '-'));
          if (show.emergencyContact) row.push(excelSafeCell(player.emergencyContact || '-'));
          if (show.dob) row.push(excelSafeCell(player.dob || '-'));
          if (show.age) row.push(excelSafeCell(player.age || '-'));
          if (show.ageCategory) row.push(excelSafeCell(player.ageCategory || '-'));
          if (show.gender) row.push(excelSafeCell(player.gender || '-'));
          if (show.jerseyName) row.push(excelSafeCell(player.jerseyName || '-'));
          if (show.jerseyNumber) row.push(excelSafeCell(player.jerseyNumber || '-'));
          if (show.jerseySize) row.push(excelSafeCell(player.jerseySize || '-'));
          if (show.photo) row.push(excelSafeCell(signFor(player.photo)));

          if (show.sportProfile) {
            row.push(excelSafeCell(player.role || '-'));
            row.push(excelSafeCell(formatSportExportStyleSummary(tournament.sport, player)));
          }

          {
            const sp = formatSportProfilesExport(parseSportProfiles(player.sportProfiles));
            row.push(excelSafeCell(sp.cricketRoles));
            row.push(excelSafeCell(sp.cricketDetails));
            row.push(excelSafeCell(sp.footballPositions));
          }

          customLabels.forEach((label: string) => {
            row.push(excelSafeCell(player.customValues?.[label] || '-'));
          });

          rows.push(row);
        });
      }
    });

    const wb = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    const ageCategoryColIndex = headers.indexOf('Age Category');
    const canSplitByAgeCategory = show.ageCategory && ageCategoryColIndex >= 0;

    if (canSplitByAgeCategory) {
      const grouped = new Map<string, string[][]>();
      for (const row of rows) {
        const label = normalizeAgeCategoryLabel(row[ageCategoryColIndex]);
        const bucket = grouped.get(label);
        if (bucket) bucket.push(row);
        else grouped.set(label, [row]);
      }

      const categoryLabels = [...grouped.keys()];
      const onlyUncategorized =
        categoryLabels.length === 1 && categoryLabels[0] === 'Uncategorized';

      appendDataSheet(wb, 'All Players', headers, rows, usedSheetNames);

      if (!onlyUncategorized) {
        const categoryOrder = orderAgeCategorySheetLabels(
          grouped,
          Array.isArray(tournament.ageCategories) ? tournament.ageCategories : []
        );
        for (const label of categoryOrder) {
          const categoryRows = grouped.get(label);
          if (categoryRows && categoryRows.length > 0) {
            appendDataSheet(wb, label, headers, categoryRows, usedSheetNames);
          }
        }
      }
    } else {
      appendDataSheet(wb, 'Players', headers, rows, usedSheetNames);
    }

    const safeName = String(tournament.name || 'tournament')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);

    XLSX.writeFile(wb, `${safeName}_players.xlsx`, { compression: true });
  };

  if (loading) {
    return (
      <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>
        Loading registrations database...
      </div>
    );
  }

  const sportsConfigList: SportEntry[] = Array.isArray(tournament.sportsConfig)
    ? (tournament.sportsConfig as SportEntry[])
    : Array.isArray(tournament.sports_config)
      ? (tournament.sports_config as SportEntry[])
      : [];
  const sportNameById = new Map<string, string>();
  for (const s of sportsConfigList) {
    if (s?.id && s?.name) sportNameById.set(s.id, s.name);
  }

  const paidCollections = registrations
    .filter((r) => r.paymentStatus === 'Paid')
    .reduce((sum, r) => {
      const breakdown = Array.isArray(r.feeBreakdown) ? r.feeBreakdown : [];
      if (breakdown.length > 0) {
        return sum + breakdown.reduce((s: number, b: { fee?: number }) => s + (Number(b.fee) || 0), 0);
      }
      return sum + (Number(tournament.fee) || 0);
    }, 0);

  /** Per sport-entry: how many registrations selected it + how many players those regs include. */
  const sportWiseCounts = sportsConfigList.map((sport) => {
    const matching = registrations.filter((r) => {
      const ids = Array.isArray(r.selectedSports) ? r.selectedSports : [];
      return ids.includes(sport.id);
    });
    const playerTotal = matching.reduce((acc, r) => acc + (r.players?.length || 0), 0);
    const label =
      sport.formatLabel?.trim() ||
      (sport.sportFamily && sport.name.startsWith(`${sport.sportFamily} —`)
        ? sport.name.slice(sport.sportFamily.length + 3).trim()
        : sport.name);
    return {
      id: sport.id,
      name: sport.name,
      label,
      family: sport.sportFamily?.trim() || sport.name,
      entryType: sport.entryType,
      registrations: matching.length,
      players: playerTotal,
    };
  });
  const sportWiseGroups = groupSportsForDisplay(
    sportsConfigList.length > 0 ? sportsConfigList : []
  ).map((group) => ({
    family: group.family,
    rows: sportWiseCounts.filter((row) => group.entries.some((e) => e.id === row.id)),
  }));

  // Best available image URL for a player's thumbnail (override → signed → raw).
  const thumbFor = (player: any): string => {
    if (player?.id && photoOverrides[player.id]) return photoOverrides[player.id];
    const raw = player?.photo;
    if (!raw || raw === '-') return '';
    if (signedUrls[raw]) return signedUrls[raw];
    return raw.startsWith('data:') ? '' : raw;
  };

  const handlePhotoUpdated = (playerId: string, url: string) => {
    setPhotoOverrides((prev) => ({ ...prev, [playerId]: url }));
  };

  const registrationFeeLabel = (reg: any): string | null => {
    if (Array.isArray(reg.feeBreakdown) && reg.feeBreakdown.length > 0) {
      const total = reg.feeBreakdown.reduce(
        (sum: number, b: { fee?: number }) => sum + (Number(b.fee) || 0),
        0
      );
      if (total > 0) return `Registration fee (₹${total.toLocaleString()})`;
      const parts = reg.feeBreakdown
        .map((b: { name?: string; fee?: number }) =>
          b.name ? `${b.name}${b.fee != null ? ` (₹${Number(b.fee) || 0})` : ''}` : null
        )
        .filter(Boolean);
      return parts.length ? parts.join(', ') : null;
    }
    return null;
  };

  const renderTeamLinkRoster = (reg: any) => (
    <div className={styles.teamLinkRoster}>
      <div className={styles.teamLinkRosterHead}>
        <span className={styles.teamLinkRosterLabel}>
          Roster · {reg.players?.length || 0}
        </span>
        <span
          className={`${styles.badge} ${
            reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning
          }`}
        >
          {reg.paymentStatus}
        </span>
      </div>
      <div className={styles.teamLinkPlayerList}>
        {(reg.players || []).length === 0 ? (
          <p className={styles.teamLinkEmpty}>No players on this roster yet.</p>
        ) : (
          (reg.players || []).map((p: any, pIdx: number) => (
            <div key={p.id || pIdx} className={styles.teamLinkPlayerRow}>
              <div className={styles.teamLinkPlayerMain}>
                <AdminPlayerPhoto
                  player={p}
                  thumbSrc={thumbFor(p)}
                  allowEdit={allowPhotoEdit}
                  onUpdated={(url) => handlePhotoUpdated(p.id, url)}
                />
              </div>
              <AdminTeamLinkPlayerActions
                mode={{ kind: 'registration', registrationId: reg.id }}
                player={p}
                onChanged={fetchTournamentAndRegistrations}
                formConfig={tournament.formConfig}
                customFields={tournament.customFields}
                teamCustomFields={tournament.teamCustomFields}
                teamCustomValues={reg.teamCustomValues}
                sport={tournament.sport}
              />
            </div>
          ))
        )}
        <AdminTeamLinkPlayerActions
          mode={{ kind: 'registration', registrationId: reg.id }}
          addButton
          onChanged={fetchTournamentAndRegistrations}
          formConfig={tournament.formConfig}
          customFields={tournament.customFields}
          teamCustomFields={tournament.teamCustomFields}
          teamCustomValues={reg.teamCustomValues}
          sport={tournament.sport}
        />
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <Link href={backHref} className={styles.backLink}>
        <ArrowLeft size={18} />
        {backLabel}
      </Link>

      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className="gradient-text">{tournament.name}</h1>
          <div className={styles.titleMeta}>
            {tournament.type && (
              <span className={styles.typePill}>{tournament.type}</span>
            )}
            {tournament.id && (
              <span className={styles.idMeta} title={tournament.id}>
                ID {String(tournament.id).slice(0, 8)}…
              </span>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          {showPreview && tournament.slug && (
            <Link href={`/register/${tournament.slug}`} target="_blank" className={styles.headerBtnSecondary}>
              Preview form
            </Link>
          )}
          <button type="button" className={styles.headerBtnPrimary} onClick={handleExportExcel}>
            <Download size={16} aria-hidden />
            Export Excel
          </button>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>
            {isTeamLikeTournamentType(tournament.type) ? 'Teams' : 'Entries'}
          </p>
          <div className={styles.statValueRow}>
            <Users size={18} color="var(--primary)" aria-hidden />
            <span className={styles.statValue}>{registrations.length}</span>
          </div>
        </div>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>Players</p>
          <div className={styles.statValueRow}>
            <Users size={18} color="var(--primary)" aria-hidden />
            <span className={styles.statValue}>
              {registrations.reduce((acc, reg) => acc + (reg.players?.length || 0), 0)}
            </span>
          </div>
        </div>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>Collections</p>
          <div className={styles.statValueRow}>
            <IndianRupee size={18} color="var(--success)" aria-hidden />
            <span className={styles.statValue}>{paidCollections.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {sportWiseGroups.length > 0 && (
        <section className={styles.sportWiseSection} aria-label="Sport-wise registrations">
          <h2 className={styles.sportWiseHeading}>Sport-wise registrations</h2>
          <div className={styles.sportWiseGroups}>
            {sportWiseGroups.map((group) => (
              <div key={group.family} className={styles.sportWiseFamily}>
                <h3 className={styles.sportWiseFamilyTitle}>{group.family}</h3>
                <div className={styles.sportWiseGrid}>
                  {group.rows.map((row) => (
                    <div key={row.id} className={styles.sportWiseCard}>
                      <p className={styles.sportWiseCardLabel} title={row.name}>
                        {row.label}
                      </p>
                      <p className={styles.sportWiseCardValue}>{row.registrations}</p>
                      <p className={styles.sportWiseCardMeta}>
                        {row.entryType === 'team'
                          ? `${row.registrations} team${row.registrations === 1 ? '' : 's'} · ${row.players} player${row.players === 1 ? '' : 's'}`
                          : row.entryType === 'doubles'
                            ? `${row.registrations} entr${row.registrations === 1 ? 'y' : 'ies'} · ${row.players} player${row.players === 1 ? '' : 's'}`
                            : `${row.registrations} entr${row.registrations === 1 ? 'y' : 'ies'}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Team Link: compact team + roster cards (no wide empty table gap) ── */}
      {isTeamLinkAdmin ? (
        <>
        <TeamInvitePanel
          tournamentId={tournamentId}
          tournamentType={tournament.type}
          minPlayers={Number(tournament.minPlayers) || 1}
          maxPlayers={Number(tournament.maxPlayers) || 11}
          legacyFee={Number(tournament.fee) || 0}
          feeMode={tournament.feeMode || 'flat'}
          sportsConfig={Array.isArray(tournament.sportsConfig) ? tournament.sportsConfig : []}
          ageCategories={Array.isArray(tournament.ageCategories) ? tournament.ageCategories : []}
          teamCustomFields={Array.isArray(tournament.teamCustomFields) ? tournament.teamCustomFields : []}
          formConfig={tournament.formConfig}
          playerCustomFields={tournament.customFields}
          sport={tournament.sport}
          onChanged={fetchTournamentAndRegistrations}
        />
        <div className={styles.teamLinkGrid}>
          {registrations.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
              No registrations found for this tournament.
            </p>
          )}
          {registrations.map((reg) => {
            const fee = registrationFeeLabel(reg);
            const links = inviteLinksByReg[reg.id];
            return (
              <article key={reg.id} className={styles.teamLinkCard}>
                <div className={styles.teamLinkSide}>
                  <div className={styles.teamLinkIdentity}>
                    {reg.teamLogoUrl ? (
                      <img
                        src={signedUrls[reg.teamLogoUrl] || reg.teamLogoUrl}
                        alt=""
                        className={styles.teamLinkLogo}
                      />
                    ) : (
                      <div className={styles.teamLinkLogo} aria-hidden style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                      }}>
                        {(reg.teamName || '?').trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h3 className={styles.teamLinkName}>{reg.teamName || 'Untitled team'}</h3>
                      <p className={styles.teamLinkMeta}>
                        {[reg.representative, reg.contact].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {fee && <p className={styles.teamLinkFee}>{fee}</p>}
                    </div>
                  </div>
                  {links && (
                    <div className={styles.teamLinkSideActions}>
                      <button
                        type="button"
                        className={styles.photoBtn}
                        onClick={() =>
                          copyLink(
                            `${window.location.origin}${links.player}`,
                            `${reg.id}-card-player`
                          )
                        }
                      >
                        <Copy size={12} aria-hidden style={{ marginRight: '0.25rem' }} />
                        {copiedLink === `${reg.id}-card-player` ? 'Copied' : 'Player link'}
                      </button>
                      <button
                        type="button"
                        className={styles.photoBtn}
                        onClick={() =>
                          copyLink(
                            `${window.location.origin}${links.live}`,
                            `${reg.id}-card-live`
                          )
                        }
                      >
                        <Copy size={12} aria-hidden style={{ marginRight: '0.25rem' }} />
                        {copiedLink === `${reg.id}-card-live` ? 'Copied' : 'Live'}
                      </button>
                    </div>
                  )}
                </div>
                {renderTeamLinkRoster(reg)}
              </article>
            );
          })}
        </div>
        </>
      ) : (
        <>
      {/* ── Desktop table ── */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{isTeamLikeTournamentType(tournament.type) ? 'Team Name' : 'Player Name'}</th>
              {isTeamLikeTournamentType(tournament.type) && <th>Representative</th>}
              <th>Contact Info</th>
              <th>Sports</th>
              {isTeamLikeTournamentType(tournament.type) && <th>Roster Details</th>}
              <th>Payment Status</th>
              <th>Razorpay ID</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg) => (
              <tr key={reg.id}>
                <td style={{ fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {reg.teamLogoUrl && (
                      <img
                        src={signedUrls[reg.teamLogoUrl] || reg.teamLogoUrl}
                        alt="Logo"
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      />
                    )}
                    {!isTeamLikeTournamentType(tournament.type) && reg.players?.[0] ? (
                      <AdminPlayerPhoto
                        player={reg.players[0]}
                        thumbSrc={thumbFor(reg.players[0])}
                        allowEdit={allowPhotoEdit}
                        onUpdated={(url) => handlePhotoUpdated(reg.players[0].id, url)}
                      />
                    ) : (
                      <span>{reg.teamName}</span>
                    )}
                  </div>
                </td>
                {isTeamLikeTournamentType(tournament.type) && <td>{reg.representative}</td>}
                <td>{reg.contact}</td>
                <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  {(() => {
                    const breakdown =
                      Array.isArray(reg.feeBreakdown) && reg.feeBreakdown.length > 0
                        ? reg.feeBreakdown
                        : null;
                    const teamMap =
                      reg.teamsBySport && typeof reg.teamsBySport === 'object'
                        ? (reg.teamsBySport as Record<string, string>)
                        : {};
                    const teamsList = Array.isArray(tournament.precreatedTeams)
                      ? tournament.precreatedTeams
                      : [];
                    const teamName = (ref: string) => {
                      if (!ref) return '';
                      const fromList = teamsList.find((t: { id: string }) => t.id === ref)?.name;
                      return fromList || ref;
                    };

                    if (breakdown) {
                      return breakdown
                        .map((b: { sportId?: string; name?: string; fee?: number }) => {
                          const tid = b.sportId ? teamMap[b.sportId] : '';
                          const teamLabel = tid ? ` → ${teamName(tid)}` : '';
                          return `${b.name || 'Sport'}${teamLabel} (₹${Number(b.fee) || 0})`;
                        })
                        .join(', ');
                    }
                    if (Array.isArray(reg.selectedSports) && reg.selectedSports.length > 0) {
                      return reg.selectedSports
                        .map((id: string) => {
                          const base = sportNameById.get(id) || id;
                          const tid = teamMap[id];
                          return tid ? `${base} → ${teamName(tid)}` : base;
                        })
                        .join(', ');
                    }
                    return '—';
                  })()}
                </td>
                {isTeamLikeTournamentType(tournament.type) && (
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0', minWidth: '13rem' }}>
                      {inviteLinksByReg[reg.id] && (
                        <button
                          type="button"
                          className={styles.photoBtn}
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() =>
                            copyLink(
                              `${window.location.origin}${inviteLinksByReg[reg.id].player}`,
                              `${reg.id}-table-player`
                            )
                          }
                        >
                          <Copy size={12} aria-hidden style={{ marginRight: '0.25rem' }} />
                          {copiedLink === `${reg.id}-table-player` ? 'Copied' : 'Player link'}
                        </button>
                      )}
                      {reg.players?.map((p: any, pIdx: number) => (
                        <AdminPlayerPhoto
                          key={p.id || pIdx}
                          player={p}
                          thumbSrc={thumbFor(p)}
                          allowEdit={allowPhotoEdit}
                          onUpdated={(url) => handlePhotoUpdated(p.id, url)}
                        />
                      ))}
                    </div>
                  </td>
                )}
                <td>
                  <span
                    className={`${styles.badge} ${
                      reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning
                    }`}
                  >
                    {reg.paymentStatus}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{reg.razorpayId}</td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={isTeamLikeTournamentType(tournament.type) ? 6 : 4}
                  style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}
                >
                  No registrations found for this tournament.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (hidden on desktop via CSS) ── */}
      <div className={styles.mobileCards}>
        {registrations.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
            No registrations found for this tournament.
          </p>
        )}
        {registrations.map((reg) => {
          const isTeamCard = isTeamLikeTournamentType(tournament.type);
          const expanded = expandedIds.has(reg.id);
          const links = inviteLinksByReg[reg.id];
          return (
          <div key={reg.id} className={styles.regCard}>
            <div
              className={styles.regCardHeader}
              onClick={isTeamCard ? () => toggleExpanded(reg.id) : undefined}
              style={isTeamCard ? { cursor: 'pointer' } : undefined}
              role={isTeamCard ? 'button' : undefined}
              tabIndex={isTeamCard ? 0 : undefined}
              onKeyDown={
                isTeamCard
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded(reg.id);
                      }
                    }
                  : undefined
              }
            >
              {reg.teamLogoUrl && (
                <img
                  src={signedUrls[reg.teamLogoUrl] || reg.teamLogoUrl}
                  alt="Logo"
                  className={styles.regCardLogo}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className={styles.regCardName}>{reg.teamName || '-'}</p>
                {reg.representative && <p className={styles.regCardSub}>{reg.representative}</p>}
              </div>
              <span
                className={`${styles.badge} ${
                  reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning
                }`}
              >
                {reg.paymentStatus}
              </span>
              {isTeamCard &&
                (expanded ? (
                  <ChevronUp size={16} color="#64748b" aria-hidden />
                ) : (
                  <ChevronDown size={16} color="#64748b" aria-hidden />
                ))}
            </div>
            <div className={styles.regCardBody}>
              {reg.contact && (
                <div className={styles.regCardRow}>
                  <span className={styles.regCardLabel}>Contact</span>
                  <span className={styles.regCardValue}>{reg.contact}</span>
                </div>
              )}
              {reg.razorpayId && reg.razorpayId !== '-' && (
                <div className={styles.regCardRow}>
                  <span className={styles.regCardLabel}>Razorpay ID</span>
                  <span
                    className={styles.regCardValue}
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}
                  >
                    {reg.razorpayId}
                  </span>
                </div>
              )}
              {isTeamCard && links && (
                <div className={styles.regCardRow}>
                  <span className={styles.regCardLabel}>Player link</span>
                  <button
                    type="button"
                    className={styles.photoBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyLink(`${window.location.origin}${links.player}`, `${reg.id}-quick-player`);
                    }}
                  >
                    <Copy size={12} aria-hidden style={{ marginRight: '0.25rem' }} />
                    {copiedLink === `${reg.id}-quick-player` ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
              {isTeamCard && !expanded && (
                <button
                  type="button"
                  className={styles.regCardToggle}
                  onClick={() => toggleExpanded(reg.id)}
                >
                  Show {reg.players?.length || 0} team member{reg.players?.length === 1 ? '' : 's'}
                  {links ? ' & share links' : ''}
                  <ChevronDown size={14} aria-hidden />
                </button>
              )}
              {isTeamCard && expanded && (
                <div className={styles.regCardRoster}>
                  <span className={styles.regCardLabel}>
                    Roster · {reg.players?.length || 0}
                  </span>
                  <div className={styles.regCardRosterList}>
                    {(reg.players || []).map((p: any, pIdx: number) => (
                      <div
                        key={p.id || pIdx}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <AdminPlayerPhoto
                            player={p}
                            thumbSrc={thumbFor(p)}
                            allowEdit={allowPhotoEdit}
                            onUpdated={(url) => handlePhotoUpdated(p.id, url)}
                          />
                        </div>
                        {isTeamLinkAdmin && (
                          <AdminTeamLinkPlayerActions
                            mode={{ kind: 'registration', registrationId: reg.id }}
                            player={p}
                            onChanged={fetchTournamentAndRegistrations}
                            formConfig={tournament.formConfig}
                            customFields={tournament.customFields}
                            teamCustomFields={tournament.teamCustomFields}
                            teamCustomValues={reg.teamCustomValues}
                            sport={tournament.sport}
                          />
                        )}
                      </div>
                    ))}
                    {isTeamLinkAdmin && (
                      <AdminTeamLinkPlayerActions
                        mode={{ kind: 'registration', registrationId: reg.id }}
                        addButton
                        onChanged={fetchTournamentAndRegistrations}
                        formConfig={tournament.formConfig}
                        customFields={tournament.customFields}
                        teamCustomFields={tournament.teamCustomFields}
                        teamCustomValues={reg.teamCustomValues}
                        sport={tournament.sport}
                      />
                    )}
                  </div>
                </div>
              )}
              {isTeamCard && expanded && links && (
                <div className={styles.regCardRoster}>
                  <span className={styles.regCardLabel}>Share links</span>
                  <div className={styles.regCardRosterList}>
                    {([
                      ['Player register', links.player, `${reg.id}-player`],
                      ['Live roster', links.live, `${reg.id}-live`],
                    ] as const).map(([label, path, key]) => (
                      <div key={key} className={styles.linkRow}>
                        <span className={styles.linkRowLabel}>{label}</span>
                        <code className={styles.linkRowPath}>
                          {typeof window !== 'undefined' ? `${window.location.origin}${path}` : path}
                        </code>
                        <button
                          type="button"
                          className={styles.photoBtn}
                          onClick={() =>
                            copyLink(
                              `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`,
                              key
                            )
                          }
                        >
                          <Copy size={12} aria-hidden style={{ marginRight: '0.25rem' }} />
                          {copiedLink === key ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!isTeamCard && reg.players?.[0] && (
                <div className={styles.regCardRow} style={{ alignItems: 'flex-start' }}>
                  <span className={styles.regCardLabel}>Photo</span>
                  <AdminPlayerPhoto
                    player={reg.players[0]}
                    thumbSrc={thumbFor(reg.players[0])}
                    allowEdit={allowPhotoEdit}
                    onUpdated={(url) => handlePhotoUpdated(reg.players[0].id, url)}
                  />
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>
        </>
      )}
    </div>
  );
}
