import type { getServiceSupabase } from '@/lib/supabase/service';
import { formatSupabaseError } from '@/lib/registrations/create';
import { isTeamInviteLinkType } from '@/lib/multi-sport';
import {
  appendPlayerToRegistration,
  insertTeamInvitePlayer,
} from '@/lib/team-invites/insert-player';
import { loadInvitePlayers } from '@/lib/team-invites/finalize';
import { resolveTeamInviteRosterLimits } from '@/lib/team-invites/token';

type Db = ReturnType<typeof getServiceSupabase>;

export type AdminPlayerInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  emergencyContact?: unknown;
  dob?: unknown;
  age?: unknown;
  ageCategory?: unknown;
  gender?: unknown;
  aadhar?: unknown;
  jerseyName?: unknown;
  jerseyNumber?: unknown;
  jerseySize?: unknown;
  photo?: unknown;
  role?: unknown;
  battingHand?: unknown;
  bowlingType?: unknown;
  allRounderType?: unknown;
  sportProfiles?: unknown;
  customValues?: unknown;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function normName(v: unknown) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function normText(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Load invite + tournament and ensure the tournament is Team Link / Player Link. */
export async function loadTeamLinkInviteContext(db: Db, inviteId: string) {
  const { data: invite, error } = await db
    .from('team_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error, 'Failed to load team invite'));
  if (!invite) return { ok: false as const, status: 404 as const, error: 'Team link not found' };

  const { data: trn, error: tErr } = await db
    .from('tournaments')
    .select('id, type, status, form_config, age_categories, min_players, max_players')
    .eq('id', invite.tournament_id)
    .maybeSingle();

  if (tErr) throw new Error(formatSupabaseError(tErr, 'Failed to load tournament'));
  if (!trn) return { ok: false as const, status: 404 as const, error: 'Tournament not found' };

  if (!isTeamInviteLinkType(trn.type)) {
    return {
      ok: false as const,
      status: 400 as const,
      error: 'Admin roster edit is only available for Team Link tournaments.',
    };
  }

  const limits = resolveTeamInviteRosterLimits({
    tournamentMin: trn.min_players,
    tournamentMax: trn.max_players,
    inviteMin: invite.min_players,
    inviteMax: invite.max_players,
  });

  return { ok: true as const, invite, tournament: trn, limits };
}

export async function loadTeamLinkInviteByRegistration(db: Db, registrationId: string) {
  const { data: invite, error } = await db
    .from('team_invites')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error, 'Failed to load team invite'));
  if (!invite) {
    return {
      ok: false as const,
      status: 400 as const,
      error: 'This registration is not a Team Link roster.',
    };
  }
  return loadTeamLinkInviteContext(db, invite.id as string);
}

function invitePlayerUpdateRow(input: AdminPlayerInput) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = str(input.name);
  if (input.email !== undefined) row.email = str(input.email);
  if (input.phone !== undefined) row.phone = str(input.phone);
  if (input.emergencyContact !== undefined) row.emergency_contact = str(input.emergencyContact);
  if (input.dob !== undefined) row.dob = str(input.dob);
  if (input.age !== undefined) row.age = input.age != null && String(input.age).trim() ? String(input.age) : null;
  if (input.ageCategory !== undefined) row.age_category = str(input.ageCategory);
  if (input.gender !== undefined) row.gender = str(input.gender);
  if (input.aadhar !== undefined) row.aadhar = str(input.aadhar);
  if (input.jerseyName !== undefined) row.jersey_name = str(input.jerseyName);
  if (input.jerseyNumber !== undefined) {
    row.jersey_number =
      input.jerseyNumber != null && String(input.jerseyNumber).trim()
        ? String(input.jerseyNumber)
        : null;
  }
  if (input.jerseySize !== undefined) row.jersey_size = str(input.jerseySize);
  if (input.photo !== undefined && typeof input.photo === 'string' && !input.photo.startsWith('data:')) {
    row.photo_url = str(input.photo);
  }
  if (input.role !== undefined) row.role = str(input.role);
  if (input.battingHand !== undefined) row.batting_hand = str(input.battingHand);
  if (input.bowlingType !== undefined) row.bowling_type = str(input.bowlingType);
  if (input.allRounderType !== undefined) row.all_rounder_type = str(input.allRounderType);
  if (input.sportProfiles !== undefined && input.sportProfiles && typeof input.sportProfiles === 'object') {
    row.sport_profiles = input.sportProfiles;
  }
  if (input.customValues !== undefined && input.customValues && typeof input.customValues === 'object') {
    row.custom_values = input.customValues;
  }
  return row;
}

function registrationPlayerUpdateRow(input: AdminPlayerInput) {
  const row = invitePlayerUpdateRow(input);
  return row;
}

function playersMatch(
  a: { name?: unknown; phone?: unknown; dob?: unknown },
  b: { name?: unknown; phone?: unknown; dob?: unknown }
) {
  const nameOk = normName(a.name) && normName(a.name) === normName(b.name);
  if (!nameOk) return false;
  const aPhone = normText(a.phone);
  const bPhone = normText(b.phone);
  if (aPhone && bPhone) return aPhone === bPhone;
  const aDob = normText(a.dob);
  const bDob = normText(b.dob);
  if (aDob && bDob) return aDob === bDob;
  return !aPhone && !bPhone && !aDob && !bDob;
}

async function findMatchingInvitePlayer(
  db: Db,
  inviteId: string,
  player: { name?: unknown; phone?: unknown; dob?: unknown },
  excludeId?: string
) {
  const existing = await loadInvitePlayers(db, inviteId);
  return (
    existing.find((p) => {
      if (excludeId && p.id === excludeId) return false;
      return playersMatch(p, player);
    }) || null
  );
}

async function findMatchingRegistrationPlayer(
  db: Db,
  registrationId: string,
  player: { name?: unknown; phone?: unknown; dob?: unknown },
  excludeId?: string
) {
  const { data, error } = await db
    .from('players')
    .select('*')
    .eq('registration_id', registrationId);
  if (error) throw new Error(formatSupabaseError(error, 'Failed to load registration players'));
  return (
    (data || []).find((p) => {
      if (excludeId && p.id === excludeId) return false;
      return playersMatch(p, player);
    }) || null
  );
}

export async function adminAddTeamLinkPlayer(
  db: Db,
  inviteId: string,
  input: AdminPlayerInput
): Promise<{ ok: true; invitePlayer: Record<string, unknown>; registrationPlayer: Record<string, unknown> | null; playerCount: number; maxPlayers: number } | { ok: false; status: number; error: string }> {
  const ctx = await loadTeamLinkInviteContext(db, inviteId);
  if (!ctx.ok) return ctx;

  const name = str(input.name);
  if (!name) return { ok: false, status: 400, error: 'Player name is required.' };

  const existing = await loadInvitePlayers(db, inviteId);
  if (existing.length >= ctx.limits.maxPlayers) {
    return {
      ok: false,
      status: 409,
      error: `Team roster is full (${ctx.limits.maxPlayers} players max).`,
    };
  }

  const inserted = await insertTeamInvitePlayer(
    db,
    inviteId,
    { ...input, name } as Record<string, unknown>,
    ctx.tournament.age_categories
  );
  if (inserted.ok === false) return { ok: false, status: 500, error: inserted.error };

  let registrationPlayer: Record<string, unknown> | null = null;
  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const appended = await appendPlayerToRegistration(db, registrationId, inserted.player);
    if (appended.ok === false) {
      await db.from('team_invite_players').delete().eq('id', inserted.player.id);
      return { ok: false, status: 500, error: appended.error };
    }
    registrationPlayer = appended.player;
  }

  const updated = await loadInvitePlayers(db, inviteId);
  return {
    ok: true,
    invitePlayer: inserted.player,
    registrationPlayer,
    playerCount: updated.length,
    maxPlayers: ctx.limits.maxPlayers,
  };
}

export async function adminUpdateInvitePlayer(
  db: Db,
  inviteId: string,
  invitePlayerId: string,
  input: AdminPlayerInput
) {
  const ctx = await loadTeamLinkInviteContext(db, inviteId);
  if (!ctx.ok) return ctx;

  const { data: before, error: loadErr } = await db
    .from('team_invite_players')
    .select('*')
    .eq('id', invitePlayerId)
    .eq('team_invite_id', inviteId)
    .maybeSingle();
  if (loadErr) throw new Error(formatSupabaseError(loadErr, 'Failed to load player'));
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const row = invitePlayerUpdateRow(input);
  if (row.name === null) return { ok: false as const, status: 400 as const, error: 'Player name is required.' };
  if (Object.keys(row).length === 0) {
    return { ok: true as const, invitePlayer: before as Record<string, unknown>, registrationPlayer: null };
  }

  const { data: updated, error } = await db
    .from('team_invite_players')
    .update(row)
    .eq('id', invitePlayerId)
    .eq('team_invite_id', inviteId)
    .select()
    .single();
  if (error) return { ok: false as const, status: 500 as const, error: formatSupabaseError(error, 'Failed to update player') };

  let registrationPlayer: Record<string, unknown> | null = null;
  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const match = await findMatchingRegistrationPlayer(db, registrationId, before);
    if (match) {
      const regRow = registrationPlayerUpdateRow(input);
      const { data: regUpdated, error: regErr } = await db
        .from('players')
        .update(regRow)
        .eq('id', match.id)
        .select()
        .single();
      if (regErr) {
        return {
          ok: false as const,
          status: 500 as const,
          error: formatSupabaseError(regErr, 'Updated invite player but failed to sync registration'),
        };
      }
      registrationPlayer = regUpdated as Record<string, unknown>;
    }
  }

  return {
    ok: true as const,
    invitePlayer: updated as Record<string, unknown>,
    registrationPlayer,
  };
}

export async function adminDeleteInvitePlayer(db: Db, inviteId: string, invitePlayerId: string) {
  const ctx = await loadTeamLinkInviteContext(db, inviteId);
  if (!ctx.ok) return ctx;

  const { data: before, error: loadErr } = await db
    .from('team_invite_players')
    .select('*')
    .eq('id', invitePlayerId)
    .eq('team_invite_id', inviteId)
    .maybeSingle();
  if (loadErr) throw new Error(formatSupabaseError(loadErr, 'Failed to load player'));
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const { error } = await db
    .from('team_invite_players')
    .delete()
    .eq('id', invitePlayerId)
    .eq('team_invite_id', inviteId);
  if (error) return { ok: false as const, status: 500 as const, error: formatSupabaseError(error, 'Failed to delete player') };

  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const match = await findMatchingRegistrationPlayer(db, registrationId, before);
    if (match) {
      await db.from('players').delete().eq('id', match.id);
    }
  }

  const remaining = await loadInvitePlayers(db, inviteId);
  return { ok: true as const, playerCount: remaining.length };
}

export async function adminUpdateRegistrationPlayer(
  db: Db,
  registrationId: string,
  playerId: string,
  input: AdminPlayerInput
) {
  const ctx = await loadTeamLinkInviteByRegistration(db, registrationId);
  if (!ctx.ok) return ctx;

  const { data: before, error: loadErr } = await db
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (loadErr) throw new Error(formatSupabaseError(loadErr, 'Failed to load player'));
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const row = registrationPlayerUpdateRow(input);
  if (row.name === null) return { ok: false as const, status: 400 as const, error: 'Player name is required.' };
  if (Object.keys(row).length === 0) {
    return { ok: true as const, registrationPlayer: before as Record<string, unknown> };
  }

  const { data: updated, error } = await db
    .from('players')
    .update(row)
    .eq('id', playerId)
    .eq('registration_id', registrationId)
    .select()
    .single();
  if (error) return { ok: false as const, status: 500 as const, error: formatSupabaseError(error, 'Failed to update player') };

  const match = await findMatchingInvitePlayer(db, ctx.invite.id as string, before);
  if (match) {
    const inviteRow = invitePlayerUpdateRow(input);
    await db.from('team_invite_players').update(inviteRow).eq('id', match.id);
  }

  return { ok: true as const, registrationPlayer: updated as Record<string, unknown> };
}

export async function adminDeleteRegistrationPlayer(
  db: Db,
  registrationId: string,
  playerId: string
) {
  const ctx = await loadTeamLinkInviteByRegistration(db, registrationId);
  if (!ctx.ok) return ctx;

  const { data: before, error: loadErr } = await db
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (loadErr) throw new Error(formatSupabaseError(loadErr, 'Failed to load player'));
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const { error } = await db
    .from('players')
    .delete()
    .eq('id', playerId)
    .eq('registration_id', registrationId);
  if (error) return { ok: false as const, status: 500 as const, error: formatSupabaseError(error, 'Failed to delete player') };

  const match = await findMatchingInvitePlayer(db, ctx.invite.id as string, before);
  if (match) {
    await db.from('team_invite_players').delete().eq('id', match.id);
  }

  const { count } = await db
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('registration_id', registrationId);

  return { ok: true as const, playerCount: count || 0 };
}

export async function adminDeleteTeamInvite(db: Db, inviteId: string) {
  const ctx = await loadTeamLinkInviteContext(db, inviteId);
  if (!ctx.ok) return ctx;

  const registrationId = ctx.invite.registration_id as string | null;
  const teamName = String(ctx.invite.team_name || 'Team');

  // Clear ledger pointer first (no FK constraint on payment_orders.team_invite_id).
  await db.from('payment_orders').update({ team_invite_id: null }).eq('team_invite_id', inviteId);

  // Delete invite (cascades team_invite_players).
  const { error: inviteErr } = await db.from('team_invites').delete().eq('id', inviteId);
  if (inviteErr) {
    return {
      ok: false as const,
      status: 500 as const,
      error: formatSupabaseError(inviteErr, 'Failed to delete team link'),
    };
  }

  // If paid, also remove the confirmed registration + its players.
  if (registrationId) {
    const { error: regErr } = await db.from('registrations').delete().eq('id', registrationId);
    if (regErr) {
      return {
        ok: false as const,
        status: 500 as const,
        error: formatSupabaseError(
          regErr,
          'Team link deleted, but failed to delete the paid registration'
        ),
      };
    }
  }

  return {
    ok: true as const,
    teamName,
    deletedRegistration: Boolean(registrationId),
  };
}

export function mapInvitePlayerForAdmin(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    emergencyContact: p.emergency_contact,
    dob: p.dob,
    age: p.age,
    ageCategory: p.age_category,
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
    customValues: p.custom_values || {},
    createdAt: p.created_at,
  };
}

export function mapRegistrationPlayerForAdmin(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    emergencyContact: p.emergency_contact,
    dob: p.dob,
    age: p.age,
    ageCategory: p.age_category,
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
    customValues: p.custom_values || {},
  };
}
