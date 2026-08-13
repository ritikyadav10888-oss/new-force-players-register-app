import type { getServiceSupabase } from '@/lib/supabase/service';
import {
  formatSupabaseError,
  isDataImageUrl,
} from '@/lib/registrations/create';
import { parseAgeCategories, resolveAgeCategoryName } from '@/lib/age-categories';

type Db = ReturnType<typeof getServiceSupabase>;

const SIGNED_URL_TTL_SECONDS = 120 * 24 * 60 * 60;

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data URL.');
  return { mime: m[1], base64: m[2] };
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

async function uploadImageDataUrl(db: Db, dataUrl: string, path: string): Promise<string> {
  const { mime, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2_500_000) {
    throw new Error('Photo is too large. Please upload a smaller image.');
  }

  const { error } = await db.storage.from('uploads').upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;

  const { data, error: signError } = await db.storage
    .from('uploads')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    throw signError || new Error('Failed to generate photo URL.');
  }
  return data.signedUrl;
}

export async function insertTeamInvitePlayer(
  db: Db,
  inviteId: string,
  player: Record<string, unknown>,
  tournamentAgeCategories: unknown
): Promise<{ ok: true; player: Record<string, unknown> } | { ok: false; error: string }> {
  let photoUrl: string | null =
    typeof player.photo === 'string' && player.photo.trim() ? player.photo.trim() : null;

  if (isDataImageUrl(player.photo)) {
    const { mime } = parseDataUrl(player.photo as string);
    const ext = extForMime(mime);
    photoUrl = await uploadImageDataUrl(
      db,
      player.photo as string,
      `team-invites/${inviteId}/p${Date.now()}.${ext}`
    );
  }

  const ageCats = parseAgeCategories(tournamentAgeCategories);
  const fromPayload =
    typeof player.ageCategory === 'string' && player.ageCategory.trim()
      ? player.ageCategory.trim()
      : typeof player.age_category === 'string' && player.age_category.trim()
        ? player.age_category.trim()
        : null;
  const dobStr = typeof player.dob === 'string' ? player.dob : '';
  const ageCategory = fromPayload || resolveAgeCategoryName(dobStr, ageCats);

  const row = {
    team_invite_id: inviteId,
    name: player.name,
    email: player.email || null,
    phone: player.phone || null,
    emergency_contact: player.emergencyContact || null,
    dob: player.dob || null,
    age: player.age != null ? String(player.age) : null,
    age_category: ageCategory,
    gender: player.gender || null,
    aadhar: player.aadhar || null,
    jersey_name: player.jerseyName || null,
    jersey_number: player.jerseyNumber != null ? String(player.jerseyNumber) : null,
    jersey_size: player.jerseySize || null,
    photo_url: photoUrl,
    role: player.role || null,
    batting_hand: player.battingHand || null,
    bowling_type: player.bowlingType || null,
    all_rounder_type: player.allRounderType || null,
    sport_profiles:
      player.sportProfiles && typeof player.sportProfiles === 'object'
        ? player.sportProfiles
        : {},
    custom_values:
      player.customValues && typeof player.customValues === 'object' ? player.customValues : {},
  };

  const { data, error } = await db.from('team_invite_players').insert([row]).select().single();

  if (error) {
    return { ok: false, error: formatSupabaseError(error, 'Failed to add player') };
  }

  return { ok: true, player: data as Record<string, unknown> };
}

/** After team is paid: also append the player onto the confirmed registration roster. */
export async function appendPlayerToRegistration(
  db: Db,
  registrationId: string,
  invitePlayer: Record<string, unknown>
): Promise<{ ok: true; player: Record<string, unknown> } | { ok: false; error: string }> {
  const row = {
    registration_id: registrationId,
    name: invitePlayer.name,
    email: invitePlayer.email || null,
    phone: invitePlayer.phone || null,
    emergency_contact: invitePlayer.emergency_contact || null,
    dob: invitePlayer.dob || null,
    age: invitePlayer.age != null ? String(invitePlayer.age) : null,
    age_category: invitePlayer.age_category || null,
    gender: invitePlayer.gender || null,
    aadhar: invitePlayer.aadhar || null,
    jersey_name: invitePlayer.jersey_name || null,
    jersey_number: invitePlayer.jersey_number != null ? String(invitePlayer.jersey_number) : null,
    jersey_size: invitePlayer.jersey_size || null,
    photo_url: invitePlayer.photo_url || null,
    role: invitePlayer.role || null,
    batting_hand: invitePlayer.batting_hand || null,
    bowling_type: invitePlayer.bowling_type || null,
    all_rounder_type: invitePlayer.all_rounder_type || null,
    sport_profiles:
      invitePlayer.sport_profiles && typeof invitePlayer.sport_profiles === 'object'
        ? invitePlayer.sport_profiles
        : {},
    custom_values:
      invitePlayer.custom_values && typeof invitePlayer.custom_values === 'object'
        ? invitePlayer.custom_values
        : {},
  };

  let result = await db.from('players').insert([row]).select().single();
  if (result.error) {
    const msg = String((result.error as { message?: string }).message || '');
    if (msg.toLowerCase().includes('sport_profiles')) {
      const { sport_profiles: _ignored, ...rest } = row;
      result = await db.from('players').insert([rest]).select().single();
    }
  }

  if (result.error) {
    return { ok: false, error: formatSupabaseError(result.error, 'Failed to add player to registration') };
  }
  return { ok: true, player: result.data as Record<string, unknown> };
}
