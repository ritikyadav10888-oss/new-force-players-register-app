export type SponsorEntry = {
  name: string;
  logo: string;
};

export const MAX_SPONSORS = 12;

/** Parse sponsors from a tournament row (JSONB column or legacy `sponsor_name`). */
export function parseSponsorsFromTournament(data: {
  sponsors?: unknown;
  sponsor_name?: unknown;
}): SponsorEntry[] {
  const parsed = parseSponsorsFromApi(data.sponsors);
  if (parsed.length > 0) return parsed;
  const legacy = data.sponsor_name;
  if (legacy != null && String(legacy).trim()) {
    return [{ name: String(legacy).trim(), logo: '' }];
  }
  return [];
}

/** Parse DB/API `sponsors` JSONB (strings or `{ name, logo }` objects). */
export function parseSponsorsFromApi(raw: unknown): SponsorEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SponsorEntry[] = [];
  for (const item of raw.slice(0, MAX_SPONSORS)) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) out.push({ name, logo: '' });
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? o.sponsor_name ?? '').trim();
      const logo = String(o.logo ?? o.logo_url ?? o.logoUrl ?? '').trim();
      if (name || logo) out.push({ name, logo });
    }
  }
  return out;
}

export function normalizeSponsorsForSave(entries: SponsorEntry[]): SponsorEntry[] {
  return entries
    .map((e) => ({ name: e.name.trim(), logo: e.logo.trim() }))
    .filter((e) => e.name || e.logo)
    .slice(0, MAX_SPONSORS);
}

export function sponsorHasDisplay(entry: SponsorEntry): boolean {
  return Boolean(entry.name.trim() || entry.logo.trim());
}

export function sponsorDisplayName(entry: SponsorEntry): string {
  return entry.name.trim() || 'Sponsor';
}
