import type { getServiceSupabase } from '@/lib/supabase/service';
import { consumePaymentOrder } from '@/lib/payments/orders';
import { parseAgeCategories, resolveAgeCategoryName } from '@/lib/age-categories';

type Db = ReturnType<typeof getServiceSupabase>;

type PlayerInsertRow = Record<string, unknown>;

function isMissingSportProfilesColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === 'PGRST204' &&
    String(e.message || '')
      .toLowerCase()
      .includes('sport_profiles')
  );
}

async function insertPlayers(db: Db, rows: PlayerInsertRow[]) {
  let result = await db.from('players').insert(rows);
  if (result.error && isMissingSportProfilesColumn(result.error)) {
    const withoutProfiles = rows.map(({ sport_profiles: _ignored, ...rest }) => rest);
    result = await db.from('players').insert(withoutProfiles);
  }
  return result.error;
}

export function formatSupabaseError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const SIGNED_URL_TTL_SECONDS = 120 * 24 * 60 * 60; // 120 days

export function isDataImageUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.includes(';base64,');
}

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
  // Guard: keep uploads reasonably small (2.5MB decoded)
  if (bytes.length > 2_500_000) {
    throw new Error('Photo is too large. Please upload a smaller image.');
  }

  const { error } = await db.storage.from('uploads').upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(formatSupabaseError(error, 'Failed to upload image.'));

  const { data, error: signError } = await db.storage
    .from('uploads')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) {
    throw new Error(formatSupabaseError(signError, 'Failed to generate photo URL.'));
  }
  return data.signedUrl;
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
 * Persists a registration and its players from a payload, uploading any base64
 * images to storage, and (optionally) marks the payment order consumed. Shared
 * by the public /api/register flow, the admin manual-create flow, and the
 * webhook-driven auto-recovery flow so all three behave identically.
 */
export async function createRegistrationFromPayload(
  db: Db,
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
      db,
      payload.teamLogoUrl,
      `teams/${String(payload.tournamentId || 't')}/${Date.now()}.${ext}`
    );
  }

  const { data: regData, error: regError } = await db
    .from('registrations')
    .insert([
      {
        tournament_id: payload.tournamentId,
        team_name: payload.teamName,
        representative: payload.representative,
        contact: payload.contact,
        payment_status: opts.paymentStatus,
        razorpay_order_id: opts.razorpayOrderId,
        razorpay_payment_id: opts.razorpayPaymentId,
        team_logo_url: teamLogoUrl,
        selected_sports: Array.isArray(payload.selectedSports) ? payload.selectedSports : [],
        fee_breakdown: Array.isArray(payload.feeBreakdown) ? payload.feeBreakdown : [],
        precreated_team_id: payload.precreatedTeamId || null,
        teams_by_sport:
          payload.teamsBySport && typeof payload.teamsBySport === 'object'
            ? payload.teamsBySport
            : {},
        team_custom_values:
          payload.teamCustomValues && typeof payload.teamCustomValues === 'object'
            ? payload.teamCustomValues
            : {},
      },
    ])
    .select()
    .single();

  if (regError) {
    // Unique violation on razorpay_payment_id = concurrent replay attempt.
    if ((regError as { code?: string }).code === '23505') {
      return { ok: false, status: 409, error: 'This payment has already been used to register.' };
    }
    throw new Error(formatSupabaseError(regError, 'Failed to create registration.'));
  }

  if (opts.paymentOrder) {
    await consumePaymentOrder(db, {
      id: opts.paymentOrder.id,
      razorpayPaymentId: opts.razorpayPaymentId,
      registrationId: regData.id as string,
    });
  }

  if (payload.players && Array.isArray(payload.players)) {
    const { data: tournamentRow } = await db
      .from('tournaments')
      .select('age_categories')
      .eq('id', payload.tournamentId)
      .maybeSingle();
    const tournamentAgeCategories = parseAgeCategories(tournamentRow?.age_categories);

    const playersToInsert = await Promise.all(
      payload.players.map(async (p: Record<string, unknown>, idx: number) => {
        let photoUrl: string | null = (p.photo as string) || null;
        if (isDataImageUrl(p.photo)) {
          const { mime } = parseDataUrl(p.photo);
          const ext = extForMime(mime);
          photoUrl = await uploadImageDataUrl(
            db,
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
              : p.sport_profiles && typeof p.sport_profiles === 'object' && !Array.isArray(p.sport_profiles)
                ? p.sport_profiles
                : {},
          custom_values: p.customValues || {},
        };
      })
    );

    const playersError = await insertPlayers(db, playersToInsert);
    if (playersError) {
      // Hit the DB unique index (tournament_id + phone + name + dob). Roll back
      // the just-created registration so no orphan row remains.
      if ((playersError as { code?: string }).code === '23505') {
        await db.from('registrations').delete().eq('id', regData.id);
        return {
          ok: false,
          status: 409,
          duplicate: true,
          error:
            'This player (same name, date of birth and contact number) is already registered for this tournament.',
        };
      }
      throw new Error(formatSupabaseError(playersError, 'Failed to insert players.'));
    }
  }

  return { ok: true, registration: regData };
}
