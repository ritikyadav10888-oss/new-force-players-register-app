import type { getServiceSupabase } from '@/lib/supabase/service';

type Db = ReturnType<typeof getServiceSupabase>;

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
  db: Db,
  tournamentId: string,
  player: IncomingPlayer,
  opts?: { excludeInviteId?: string }
): Promise<{ duplicate: true; name: string | null; teamName: string | null } | { duplicate: false }> {
  const phone = normText(player.phone);
  const name = normName(player.name);
  const dob = normText(player.dob);
  if (!phone || !name || !dob) return { duplicate: false };

  const key = identityKey(phone, name, dob);

  const { data: regs } = await db
    .from('registrations')
    .select('id, team_name')
    .eq('tournament_id', tournamentId);

  if (regs?.length) {
    const regIds = regs.map((r) => r.id);
    const regTeam = new Map(regs.map((r) => [r.id, r.team_name as string | null]));

    const { data: existingPlayers } = await db
      .from('players')
      .select('registration_id, phone, name, dob')
      .in('registration_id', regIds);

    const match = existingPlayers?.find((p) => {
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

  let inviteQuery = db
    .from('team_invites')
    .select('id, team_name, payment_status')
    .eq('tournament_id', tournamentId)
    .neq('payment_status', 'Paid');

  if (opts?.excludeInviteId) {
    inviteQuery = inviteQuery.neq('id', opts.excludeInviteId);
  }

  const { data: invites } = await inviteQuery;
  const inviteIds = (invites || []).map((i) => i.id);
  if (!inviteIds.length) return { duplicate: false };

  const inviteTeam = new Map(invites!.map((i) => [i.id, i.team_name as string]));

  const { data: pendingPlayers } = await db
    .from('team_invite_players')
    .select('team_invite_id, phone, name, dob')
    .in('team_invite_id', inviteIds);

  const pendingMatch = pendingPlayers?.find((p) => {
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
