/** Normalize phone for wa.me (default India +91). */
export function toWhatsAppE164(
  phone: string | null | undefined,
  defaultCountry = '91'
): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    return `${defaultCountry}${digits.slice(1)}`;
  }
  if (digits.startsWith(defaultCountry) && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export function buildWhatsAppShareUrl(opts: {
  phone?: string | null;
  text: string;
}): string {
  const e164 = opts.phone ? toWhatsAppE164(opts.phone) : null;
  const q = `text=${encodeURIComponent(opts.text)}`;
  return e164 ? `https://wa.me/${e164}?${q}` : `https://wa.me/?${q}`;
}

export function teamInviteWhatsAppMessage(opts: {
  teamName: string;
  tournamentName?: string;
  playerUrl: string;
  liveUrl: string;
  maxPlayers?: number | null;
}): string {
  const title = opts.tournamentName
    ? `${opts.teamName} — ${opts.tournamentName}`
    : opts.teamName;
  const roster =
    opts.maxPlayers && opts.maxPlayers > 0
      ? `\nRoster closes at ${opts.maxPlayers} players.`
      : '';
  return [
    `Team paid & confirmed: ${title}`,
    '',
    `Player register (join free):`,
    opts.playerUrl,
    '',
    `Live roster:`,
    opts.liveUrl,
    roster,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim();
}
