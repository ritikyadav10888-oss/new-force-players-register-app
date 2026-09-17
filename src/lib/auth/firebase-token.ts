import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/** Verify a Firebase Auth ID token without loading firebase-admin (Vercel-safe). */
export async function verifyFirebaseIdToken(
  token: string
): Promise<{ userId: string; email?: string } | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) return null;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    if (!userId) return null;
    return {
      userId,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}
