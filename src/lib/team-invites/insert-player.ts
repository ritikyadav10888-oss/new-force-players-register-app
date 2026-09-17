import { query } from '@/lib/db/pool';
import { formatDbError, isDataImageUrl } from '@/lib/registrations/create';
import { uploadDataImage, imageExtFromDataUrl } from '@/lib/firebase/upload';
import { parseAgeCategories, resolveAgeCategoryName } from '@/lib/age-categories';

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

export async function insertTeamInvitePlayer(
  inviteId: string,
  player: Record<string, unknown>,
  tournamentAgeCategories: unknown
): Promise<{ ok: true; player: Record<string, unknown> } | { ok: false; error: string }> {
  let photoUrl: string | null =
    typeof player.photo === 'string' && player.photo.trim() ? player.photo.trim() : null;

  if (isDataImageUrl(player.photo)) {
    const ext = imageExtFromDataUrl(player.photo);
    photoUrl = await uploadDataImage(
      player.photo,
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

  try {
    const { rows } = await query(
      `INSERT INTO team_invite_players (
         team_invite_id, name, email, phone, emergency_contact, dob, age, age_category,
         gender, aadhar, jersey_name, jersey_number, jersey_size, photo_url, role,
         batting_hand, bowling_type, all_rounder_type, sport_profiles, custom_values
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb
       )
       RETURNING *`,
      [
        inviteId,
        player.name,
        player.email || null,
        player.phone || null,
        player.emergencyContact || null,
        player.dob || null,
        player.age != null ? String(player.age) : null,
        ageCategory,
        player.gender || null,
        player.aadhar || null,
        player.jerseyName || null,
        player.jerseyNumber != null ? String(player.jerseyNumber) : null,
        player.jerseySize || null,
        photoUrl,
        player.role || null,
        player.battingHand || null,
        player.bowlingType || null,
        player.allRounderType || null,
        jsonb(
          player.sportProfiles && typeof player.sportProfiles === 'object'
            ? player.sportProfiles
            : {}
        ),
        jsonb(
          player.customValues && typeof player.customValues === 'object'
            ? player.customValues
            : {}
        ),
      ]
    );
    return { ok: true, player: rows[0] as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: formatDbError(error, 'Failed to add player') };
  }
}

/** After team is paid: also append the player onto the confirmed registration roster. */
export async function appendPlayerToRegistration(
  registrationId: string,
  invitePlayer: Record<string, unknown>
): Promise<{ ok: true; player: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const { rows } = await query(
      `INSERT INTO players (
         registration_id, tournament_id, name, email, phone, emergency_contact,
         dob, age, age_category, gender, aadhar, jersey_name, jersey_number, jersey_size,
         photo_url, role, batting_hand, bowling_type, all_rounder_type,
         sport_profiles, custom_values
       ) VALUES (
         $1,
         (SELECT tournament_id FROM registrations WHERE id = $1),
         $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb
       )
       RETURNING *`,
      [
        registrationId,
        invitePlayer.name,
        invitePlayer.email || null,
        invitePlayer.phone || null,
        invitePlayer.emergency_contact || null,
        invitePlayer.dob || null,
        invitePlayer.age != null ? String(invitePlayer.age) : null,
        invitePlayer.age_category || null,
        invitePlayer.gender || null,
        invitePlayer.aadhar || null,
        invitePlayer.jersey_name || null,
        invitePlayer.jersey_number != null ? String(invitePlayer.jersey_number) : null,
        invitePlayer.jersey_size || null,
        invitePlayer.photo_url || null,
        invitePlayer.role || null,
        invitePlayer.batting_hand || null,
        invitePlayer.bowling_type || null,
        invitePlayer.all_rounder_type || null,
        jsonb(
          invitePlayer.sport_profiles && typeof invitePlayer.sport_profiles === 'object'
            ? invitePlayer.sport_profiles
            : {}
        ),
        jsonb(
          invitePlayer.custom_values && typeof invitePlayer.custom_values === 'object'
            ? invitePlayer.custom_values
            : {}
        ),
      ]
    );
    return { ok: true, player: rows[0] as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: formatDbError(error, 'Failed to add player to registration') };
  }
}
