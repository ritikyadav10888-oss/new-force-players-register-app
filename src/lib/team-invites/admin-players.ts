import { query } from '@/lib/db/pool';
import { formatDbError } from '@/lib/registrations/create';
import { isTeamInviteLinkType } from '@/lib/multi-sport';
import {
  appendPlayerToRegistration,
  insertTeamInvitePlayer,
} from '@/lib/team-invites/insert-player';
import { loadInvitePlayers } from '@/lib/team-invites/finalize';
import { resolveTeamInviteRosterLimits } from '@/lib/team-invites/token';

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

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function updateByMap(
  table: string,
  id: string,
  row: Record<string, unknown>,
  extraWhere?: { col: string; value: string }
) {
  const keys = Object.keys(row);
  if (!keys.length) return null;
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const key of keys) {
    const v = row[key];
    if (key === 'sport_profiles' || key === 'custom_values') {
      sets.push(`${key} = $${i}::jsonb`);
      vals.push(jsonb(v));
    } else {
      sets.push(`${key} = $${i}`);
      vals.push(v);
    }
    i += 1;
  }
  vals.push(id);
  let sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${i}`;
  if (extraWhere) {
    i += 1;
    vals.push(extraWhere.value);
    sql += ` AND ${extraWhere.col} = $${i}`;
  }
  sql += ' RETURNING *';
  const { rows } = await query(sql, vals);
  return (rows[0] as Record<string, unknown> | undefined) ?? undefined;
}

export async function loadTeamLinkInviteContext(inviteId: string) {
  const { rows: invites } = await query(`SELECT * FROM team_invites WHERE id = $1 LIMIT 1`, [
    inviteId,
  ]);
  const invite = invites[0];
  if (!invite) return { ok: false as const, status: 404 as const, error: 'Team link not found' };

  const { rows: trns } = await query<{
    id: string;
    type: string;
    status: string;
    form_config: unknown;
    age_categories: unknown;
    min_players: number | null;
    max_players: number | null;
  }>(
    `SELECT id, type, status, form_config, age_categories, min_players, max_players
     FROM tournaments WHERE id = $1 LIMIT 1`,
    [invite.tournament_id]
  );
  const trn = trns[0];
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
    inviteMin: invite.min_players as number,
    inviteMax: invite.max_players as number,
  });

  return { ok: true as const, invite, tournament: trn, limits };
}

export async function loadTeamLinkInviteByRegistration(registrationId: string) {
  const { rows } = await query(`SELECT * FROM team_invites WHERE registration_id = $1 LIMIT 1`, [
    registrationId,
  ]);
  const invite = rows[0];
  if (!invite) {
    return {
      ok: false as const,
      status: 400 as const,
      error: 'This registration is not a Team Link roster.',
    };
  }
  return loadTeamLinkInviteContext(invite.id as string);
}

function invitePlayerUpdateRow(input: AdminPlayerInput) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = str(input.name);
  if (input.email !== undefined) row.email = str(input.email);
  if (input.phone !== undefined) row.phone = str(input.phone);
  if (input.emergencyContact !== undefined) row.emergency_contact = str(input.emergencyContact);
  if (input.dob !== undefined) row.dob = str(input.dob);
  if (input.age !== undefined)
    row.age = input.age != null && String(input.age).trim() ? String(input.age) : null;
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
  return invitePlayerUpdateRow(input);
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
  inviteId: string,
  player: { name?: unknown; phone?: unknown; dob?: unknown },
  excludeId?: string
) {
  const existing = await loadInvitePlayers(inviteId);
  return (
    existing.find((p) => {
      if (excludeId && p.id === excludeId) return false;
      return playersMatch(p, player);
    }) || null
  );
}

async function findMatchingRegistrationPlayer(
  registrationId: string,
  player: { name?: unknown; phone?: unknown; dob?: unknown },
  excludeId?: string
) {
  const { rows } = await query(`SELECT * FROM players WHERE registration_id = $1`, [
    registrationId,
  ]);
  return (
    rows.find((p) => {
      if (excludeId && p.id === excludeId) return false;
      return playersMatch(p, player);
    }) || null
  );
}

export async function adminAddTeamLinkPlayer(inviteId: string, input: AdminPlayerInput) {
  const ctx = await loadTeamLinkInviteContext(inviteId);
  if (!ctx.ok) return ctx;

  const name = str(input.name);
  if (!name) return { ok: false as const, status: 400 as const, error: 'Player name is required.' };

  const existing = await loadInvitePlayers(inviteId);
  if (existing.length >= ctx.limits.maxPlayers) {
    return {
      ok: false as const,
      status: 409 as const,
      error: `Team roster is full (${ctx.limits.maxPlayers} players max).`,
    };
  }

  const inserted = await insertTeamInvitePlayer(
    inviteId,
    { ...input, name } as Record<string, unknown>,
    ctx.tournament.age_categories
  );
  if (inserted.ok === false) return { ok: false as const, status: 500 as const, error: inserted.error };

  let registrationPlayer: Record<string, unknown> | null = null;
  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const appended = await appendPlayerToRegistration(registrationId, inserted.player);
    if (appended.ok === false) {
      await query(`DELETE FROM team_invite_players WHERE id = $1`, [inserted.player.id]);
      return { ok: false as const, status: 500 as const, error: appended.error };
    }
    registrationPlayer = appended.player;
  }

  const updated = await loadInvitePlayers(inviteId);
  return {
    ok: true as const,
    invitePlayer: inserted.player,
    registrationPlayer,
    playerCount: updated.length,
    maxPlayers: ctx.limits.maxPlayers,
  };
}

export async function adminUpdateInvitePlayer(
  inviteId: string,
  invitePlayerId: string,
  input: AdminPlayerInput
) {
  const ctx = await loadTeamLinkInviteContext(inviteId);
  if (!ctx.ok) return ctx;

  const { rows: beforeRows } = await query(
    `SELECT * FROM team_invite_players WHERE id = $1 AND team_invite_id = $2 LIMIT 1`,
    [invitePlayerId, inviteId]
  );
  const before = beforeRows[0];
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const row = invitePlayerUpdateRow(input);
  if (row.name === null) return { ok: false as const, status: 400 as const, error: 'Player name is required.' };
  if (Object.keys(row).length === 0) {
    return { ok: true as const, invitePlayer: before as Record<string, unknown>, registrationPlayer: null };
  }

  let updated: Record<string, unknown> | undefined;
  try {
    updated = (await updateByMap('team_invite_players', invitePlayerId, row, {
      col: 'team_invite_id',
      value: inviteId,
    })) ?? undefined;
  } catch (error) {
    return { ok: false as const, status: 500 as const, error: formatDbError(error, 'Failed to update player') };
  }

  let registrationPlayer: Record<string, unknown> | null = null;
  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const match = await findMatchingRegistrationPlayer(registrationId, before);
    if (match) {
      try {
        const synced = await updateByMap('players', match.id as string, registrationPlayerUpdateRow(input), {
          col: 'registration_id',
          value: registrationId,
        });
        registrationPlayer = synced ?? null;
      } catch (regErr) {
        return {
          ok: false as const,
          status: 500 as const,
          error: formatDbError(regErr, 'Updated invite player but failed to sync registration'),
        };
      }
    }
  }

  return {
    ok: true as const,
    invitePlayer: (updated || before) as Record<string, unknown>,
    registrationPlayer,
  };
}

export async function adminDeleteInvitePlayer(inviteId: string, invitePlayerId: string) {
  const ctx = await loadTeamLinkInviteContext(inviteId);
  if (!ctx.ok) return ctx;

  const { rows: beforeRows } = await query(
    `SELECT * FROM team_invite_players WHERE id = $1 AND team_invite_id = $2 LIMIT 1`,
    [invitePlayerId, inviteId]
  );
  const before = beforeRows[0];
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  await query(`DELETE FROM team_invite_players WHERE id = $1 AND team_invite_id = $2`, [
    invitePlayerId,
    inviteId,
  ]);

  const registrationId = ctx.invite.registration_id as string | null;
  if (registrationId) {
    const match = await findMatchingRegistrationPlayer(registrationId, before);
    if (match) {
      await query(`DELETE FROM players WHERE id = $1`, [match.id]);
    }
  }

  const remaining = await loadInvitePlayers(inviteId);
  return { ok: true as const, playerCount: remaining.length };
}

export async function adminUpdateRegistrationPlayer(
  registrationId: string,
  playerId: string,
  input: AdminPlayerInput
) {
  const ctx = await loadTeamLinkInviteByRegistration(registrationId);
  if (!ctx.ok) return ctx;

  const { rows: beforeRows } = await query(
    `SELECT * FROM players WHERE id = $1 AND registration_id = $2 LIMIT 1`,
    [playerId, registrationId]
  );
  const before = beforeRows[0];
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  const row = registrationPlayerUpdateRow(input);
  if (row.name === null) return { ok: false as const, status: 400 as const, error: 'Player name is required.' };
  if (Object.keys(row).length === 0) {
    return { ok: true as const, registrationPlayer: before as Record<string, unknown> };
  }

  let updated: Record<string, unknown> | undefined;
  try {
    updated = (await updateByMap('players', playerId, row, {
      col: 'registration_id',
      value: registrationId,
    })) ?? undefined;
  } catch (error) {
    return { ok: false as const, status: 500 as const, error: formatDbError(error, 'Failed to update player') };
  }

  const match = await findMatchingInvitePlayer(ctx.invite.id as string, before);
  if (match) {
    await updateByMap('team_invite_players', match.id as string, invitePlayerUpdateRow(input));
  }

  return { ok: true as const, registrationPlayer: (updated || before) as Record<string, unknown> };
}

export async function adminDeleteRegistrationPlayer(registrationId: string, playerId: string) {
  const ctx = await loadTeamLinkInviteByRegistration(registrationId);
  if (!ctx.ok) return ctx;

  const { rows: beforeRows } = await query(
    `SELECT * FROM players WHERE id = $1 AND registration_id = $2 LIMIT 1`,
    [playerId, registrationId]
  );
  const before = beforeRows[0];
  if (!before) return { ok: false as const, status: 404 as const, error: 'Player not found' };

  await query(`DELETE FROM players WHERE id = $1 AND registration_id = $2`, [
    playerId,
    registrationId,
  ]);

  const match = await findMatchingInvitePlayer(ctx.invite.id as string, before);
  if (match) {
    await query(`DELETE FROM team_invite_players WHERE id = $1`, [match.id]);
  }

  const { rows: countRows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM players WHERE registration_id = $1`,
    [registrationId]
  );

  return { ok: true as const, playerCount: countRows[0]?.n || 0 };
}

export async function adminDeleteTeamInvite(inviteId: string) {
  const ctx = await loadTeamLinkInviteContext(inviteId);
  if (!ctx.ok) return ctx;

  const registrationId = ctx.invite.registration_id as string | null;
  const teamName = String(ctx.invite.team_name || 'Team');

  await query(`UPDATE payment_orders SET team_invite_id = NULL WHERE team_invite_id = $1`, [
    inviteId,
  ]);

  try {
    await query(`DELETE FROM team_invites WHERE id = $1`, [inviteId]);
  } catch (inviteErr) {
    return {
      ok: false as const,
      status: 500 as const,
      error: formatDbError(inviteErr, 'Failed to delete team link'),
    };
  }

  if (registrationId) {
    try {
      await query(`DELETE FROM registrations WHERE id = $1`, [registrationId]);
    } catch (regErr) {
      return {
        ok: false as const,
        status: 500 as const,
        error: formatDbError(regErr, 'Team link deleted, but failed to delete the paid registration'),
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
