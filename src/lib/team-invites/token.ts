import { randomBytes } from 'crypto';

/** URL-safe token for /register/[slug]/team/[token] */
export function generateTeamInviteToken(teamName?: string): string {
  const slug = String(teamName || 'team')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 24);
  const suffix = randomBytes(5).toString('hex');
  return slug ? `${slug}-${suffix}` : suffix;
}

export function teamInvitePlayerPath(slug: string, token: string): string {
  return `/register/${slug}/team/${token}`;
}

export function teamInvitePayPath(slug: string, token: string): string {
  return `/register/${slug}/team/${token}/pay`;
}

export function teamInviteLivePath(slug: string, token: string): string {
  return `/register/${slug}/team/${token}/live`;
}

export function isTeamInvitePaid(status: unknown): boolean {
  return String(status || '').toLowerCase() === 'paid';
}

/**
 * Team invite roster size is always bounded by the tournament min/max.
 * Optional invite overrides may only tighten within that range (never expand).
 */
export function resolveTeamInviteRosterLimits(opts: {
  tournamentMin?: unknown;
  tournamentMax?: unknown;
  inviteMin?: unknown;
  inviteMax?: unknown;
}): { minPlayers: number; maxPlayers: number } {
  const tMin = Math.max(1, Number(opts.tournamentMin) || 1);
  const tMax = Math.max(tMin, Number(opts.tournamentMax) || tMin);

  const hasInviteMin = opts.inviteMin != null && opts.inviteMin !== '';
  const hasInviteMax = opts.inviteMax != null && opts.inviteMax !== '';

  let minPlayers = hasInviteMin ? Number(opts.inviteMin) : tMin;
  let maxPlayers = hasInviteMax ? Number(opts.inviteMax) : tMax;

  if (!Number.isFinite(minPlayers) || minPlayers < 1) minPlayers = tMin;
  if (!Number.isFinite(maxPlayers) || maxPlayers < 1) maxPlayers = tMax;

  // Clamp inside tournament window
  minPlayers = Math.min(tMax, Math.max(tMin, minPlayers));
  maxPlayers = Math.min(tMax, Math.max(tMin, maxPlayers));
  if (minPlayers > maxPlayers) {
    minPlayers = tMin;
    maxPlayers = tMax;
  }

  return { minPlayers, maxPlayers };
}
