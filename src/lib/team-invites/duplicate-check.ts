import { query } from '@/lib/db/pool';

function normName(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function normText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function identityKey(phone: string, name: string, dob: string): string {
  return `${phone}|${name}|${dob}`;
}

type IncomingPlayer = { phone?: unknown; name?: unknown; dob?: unknown };

/**
 * Block duplicate player (phone + name + dob) within the same tournament,
 * including paid registrations and pending team-invite rosters.
 */
export async function findDuplicatePlayerInTournament(
  tournamentId: string,
  player: IncomingPlayer,
  opts?: { excludeInviteId?: string }
): Promise<{ duplicate: true; name: string | null; teamName: string | null } | { duplicate: false }> {
  const phone = normText(player.phone);
  const name = normName(player.name);
  const dob = normText(player.dob);
  if (!phone || !name || !dob) return { duplicate: false };

  const key = identityKey(phone, name, dob);

  const { rows: regs } = await query<{ id: string; team_name: string | null }>(
    `SELECT id, team_name FROM registrations WHERE tournament_id = $1`,
    [tournamentId]
  );

  if (regs.length) {
    const regIds = regs.map((r) => r.id);
    const regTeam = new Map(regs.map((r) => [r.id, r.team_name]));

    const { rows: existingPlayers } = await query<{
      registration_id: string;
      phone: string | null;
      name: string | null;
      dob: string | null;
    }>(
      `SELECT registration_id, phone, name, dob
       FROM players WHERE registration_id = ANY($1::uuid[])`,
      [regIds]
    );

    const match = existingPlayers.find((p) => {
      const pPhone = normText(p.phone);
      const pName = normName(p.name);
      const pDob = normText(p.dob);
      if (!pPhone || !pName || !pDob) return false;
      return identityKey(pPhone, pName, pDob) === key;
    });

    if (match) {
      return {
        duplicate: true,
        name: normText(player.name) || null,
        teamName: regTeam.get(match.registration_id) || null,
      };
    }
  }

  const { rows: invites } = await query<{ id: string; team_name: string }>(
    opts?.excludeInviteId
      ? `SELECT id, team_name FROM team_invites
         WHERE tournament_id = $1 AND payment_status <> 'Paid' AND id <> $2`
      : `SELECT id, team_name FROM team_invites
         WHERE tournament_id = $1 AND payment_status <> 'Paid'`,
    opts?.excludeInviteId ? [tournamentId, opts.excludeInviteId] : [tournamentId]
  );

  const inviteIds = invites.map((i) => i.id);
  if (!inviteIds.length) return { duplicate: false };

  const inviteTeam = new Map(invites.map((i) => [i.id, i.team_name]));

  const { rows: pendingPlayers } = await query<{
    team_invite_id: string;
    phone: string | null;
    name: string | null;
    dob: string | null;
  }>(
    `SELECT team_invite_id, phone, name, dob
     FROM team_invite_players WHERE team_invite_id = ANY($1::uuid[])`,
    [inviteIds]
  );

  const pendingMatch = pendingPlayers.find((p) => {
    const pPhone = normText(p.phone);
    const pName = normName(p.name);
    const pDob = normText(p.dob);
    if (!pPhone || !pName || !pDob) return false;
    return identityKey(pPhone, pName, pDob) === key;
  });

  if (pendingMatch) {
    return {
      duplicate: true,
      name: normText(player.name) || null,
      teamName: inviteTeam.get(pendingMatch.team_invite_id) || null,
    };
  }

  return { duplicate: false };
}
