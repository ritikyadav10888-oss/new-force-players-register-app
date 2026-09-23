import { query } from '@/lib/db/pool';
import { consumePaymentOrder } from '@/lib/payments/orders';
import { parseAgeCategories, resolveAgeCategoryName } from '@/lib/age-categories';
import { formatDbError, isDataImageUrl } from '@/lib/images/data-url';

export { formatDbError, isDataImageUrl } from '@/lib/images/data-url';

/** @deprecated use formatDbError */
export const formatSupabaseError = formatDbError;

type PlayerInsertRow = Record<string, unknown>;

const SIGNED_URL_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

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

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function storeCustomImageValues(values: unknown, pathPrefix: string): Promise<Record<string, string>> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const value = typeof raw === 'string' ? raw : '';
    if (isDataImageUrl(value)) {
      n += 1;
      const { mime } = parseDataUrl(value);
      out[key] = await uploadImageDataUrl(value, `${pathPrefix}/custom-${n}.${extForMime(mime)}`);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function uploadImageDataUrl(dataUrl: string, path: string): Promise<string> {
  const { mime, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2_500_000) {
    throw new Error('Photo is too large. Please upload a smaller image.');
  }

  // Dynamic import: static firebase-admin load crashes public API routes on Vercel.
  const { getAdminStorage } = await import('@/lib/firebase/admin');
  const bucket = (await getAdminStorage()).bucket();
  const file = bucket.file(path);
  await file.save(bytes, {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: 'public,max-age=31536000' },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return signedUrl;
}

async function insertPlayers(rows: PlayerInsertRow[]) {
  for (const row of rows) {
    await query(
      `INSERT INTO players (
         registration_id, tournament_id, name, email, phone, emergency_contact,
         dob, age, age_category, gender, aadhar, jersey_name, jersey_number, jersey_size,
         photo_url, role, batting_hand, bowling_type, all_rounder_type,
         sport_profiles, custom_values
       ) VALUES (
         $1,
         (SELECT tournament_id FROM registrations WHERE id = $1),
         $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb
       )`,
      [
        row.registration_id,
        row.name ?? null,
        row.email ?? null,
        row.phone ?? null,
        row.emergency_contact ?? null,
        row.dob ?? null,
        row.age ?? null,
        row.age_category ?? null,
        row.gender ?? null,
        row.aadhar ?? null,
        row.jersey_name ?? null,
        row.jersey_number ?? null,
        row.jersey_size ?? null,
        row.photo_url ?? null,
        row.role ?? null,
        row.batting_hand ?? null,
        row.bowling_type ?? null,
        row.all_rounder_type ?? null,
        jsonb(row.sport_profiles ?? {}),
        jsonb(row.custom_values ?? {}),
      ]
    );
  }
}

export type RegistrationPayload = {
  tournamentId: string;
  teamName?: string | null;
  representative?: string | null;
  contact?: string | null;
  teamLogoUrl?: string | null;
  players?: Array<Record<string, unknown>>;
  selectedSports?: string[];
  feeBreakdown?: Array<{ sportId: string; name: string; fee: number }>;
  precreatedTeamId?: string | null;
  teamsBySport?: Record<string, string>;
  teamCustomValues?: Record<string, string> | null;
};

export type CreateRegistrationResult =
  | { ok: true; registration: Record<string, unknown> }
  | { ok: false; status: number; error: string; duplicate?: boolean };

/**
 * Persists registration + players. Uploads images to Firebase Storage.
 * Shared by /api/register, admin manual-create, and webhook recovery.
 */
export async function createRegistrationFromPayload(
  payload: RegistrationPayload,
  opts: {
    paymentStatus: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    paymentOrder?: { id: string } | null;
  }
): Promise<CreateRegistrationResult> {
  let teamLogoUrl: string | null = payload.teamLogoUrl || null;
  if (isDataImageUrl(payload.teamLogoUrl)) {
    const { mime } = parseDataUrl(payload.teamLogoUrl);
    const ext = extForMime(mime);
    teamLogoUrl = await uploadImageDataUrl(
      payload.teamLogoUrl,
      `teams/${String(payload.tournamentId || 't')}/${Date.now()}.${ext}`
    );
  }

  let regData: Record<string, unknown>;
  try {
    const { rows } = await query(
      `INSERT INTO registrations (
         tournament_id, team_name, representative, contact, payment_status,
         razorpay_order_id, razorpay_payment_id, team_logo_url,
         selected_sports, fee_breakdown, precreated_team_id, teams_by_sport, team_custom_values
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13::jsonb
       )
       RETURNING *`,
      [
        payload.tournamentId,
        payload.teamName ?? null,
        payload.representative ?? null,
        payload.contact ?? null,
        opts.paymentStatus,
        opts.razorpayOrderId,
        opts.razorpayPaymentId,
        teamLogoUrl,
        jsonb(Array.isArray(payload.selectedSports) ? payload.selectedSports : []),
        jsonb(Array.isArray(payload.feeBreakdown) ? payload.feeBreakdown : []),
        payload.precreatedTeamId || null,
        jsonb(
          payload.teamsBySport && typeof payload.teamsBySport === 'object'
            ? payload.teamsBySport
            : {}
        ),
        jsonb(
          payload.teamCustomValues && typeof payload.teamCustomValues === 'object'
            ? payload.teamCustomValues
            : {}
        ),
      ]
    );
    regData = rows[0] as Record<string, unknown>;
  } catch (regError: unknown) {
    const code = (regError as { code?: string }).code;
    if (code === '23505') {
      return { ok: false, status: 409, error: 'This payment has already been used to register.' };
    }
    throw new Error(formatDbError(regError, 'Failed to create registration.'));
  }

  if (opts.paymentOrder) {
    await consumePaymentOrder({
      id: opts.paymentOrder.id,
      razorpayPaymentId: opts.razorpayPaymentId,
      registrationId: regData.id as string,
    });
  }

  if (payload.players && Array.isArray(payload.players)) {
    const { rows: tournamentRows } = await query<{ age_categories: unknown }>(
      `SELECT age_categories FROM tournaments WHERE id = $1 LIMIT 1`,
      [payload.tournamentId]
    );
    const tournamentAgeCategories = parseAgeCategories(tournamentRows[0]?.age_categories);

    const playersToInsert = await Promise.all(
      payload.players.map(async (p: Record<string, unknown>, idx: number) => {
        let photoUrl: string | null = (p.photo as string) || null;
        if (isDataImageUrl(p.photo)) {
          const { mime } = parseDataUrl(p.photo);
          const ext = extForMime(mime);
          photoUrl = await uploadImageDataUrl(
            p.photo,
            `players/${regData.id}/p${idx + 1}.${ext}`
          );
        }

        const fromPayload =
          typeof p.ageCategory === 'string' && p.ageCategory.trim()
            ? p.ageCategory.trim()
            : typeof p.age_category === 'string' && p.age_category.trim()
              ? p.age_category.trim()
              : null;
        const dobStr = typeof p.dob === 'string' ? p.dob : '';
        const ageCategory =
          fromPayload || resolveAgeCategoryName(dobStr, tournamentAgeCategories);

        return {
          registration_id: regData.id,
          name: p.name,
          email: p.email || null,
          phone: p.phone || null,
          emergency_contact: p.emergencyContact || null,
          dob: p.dob || null,
          age: p.age != null ? String(p.age) : null,
          age_category: ageCategory,
          gender: p.gender || null,
          aadhar: p.aadhar || null,
          jersey_name: p.jerseyName || null,
          jersey_number: p.jerseyNumber != null ? String(p.jerseyNumber) : null,
          jersey_size: p.jerseySize || null,
          photo_url: photoUrl,
          role: p.role || null,
          batting_hand: p.battingHand || null,
          bowling_type: p.bowlingType || null,
          all_rounder_type: p.allRounderType || null,
          sport_profiles:
            p.sportProfiles && typeof p.sportProfiles === 'object' && !Array.isArray(p.sportProfiles)
              ? p.sportProfiles
              : p.sport_profiles &&
                  typeof p.sport_profiles === 'object' &&
                  !Array.isArray(p.sport_profiles)
                ? p.sport_profiles
                : {},
          custom_values: await storeCustomImageValues(
            p.customValues,
            `players/${regData.id}/p${idx + 1}`
          ),
        };
      })
    );

    try {
      await insertPlayers(playersToInsert);
    } catch (playersError: unknown) {
      const code = (playersError as { code?: string }).code;
      if (code === '23505') {
        await query(`DELETE FROM registrations WHERE id = $1`, [regData.id]);
        return {
          ok: false,
          status: 409,
          duplicate: true,
          error:
            'This player (same name, date of birth and contact number) is already registered for this tournament.',
        };
      }
      throw new Error(formatDbError(playersError, 'Failed to insert players.'));
    }
  }

  return { ok: true, registration: regData };
}
