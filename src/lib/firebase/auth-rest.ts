import { SignJWT, importPKCS8 } from 'jose';
import { loadServiceAccountJson } from '@/lib/gcp/credentials';

type CreateUserInput = {
  email: string;
  password: string;
  displayName?: string;
  emailVerified?: boolean;
};

/**
 * Firebase Auth admin ops via Identity Toolkit REST — avoids firebase-admin/auth
 * (jwks-rsa → jose ERR_REQUIRE_ESM on Vercel).
 */
async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const sa = loadServiceAccountJson();
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('Service account JSON is missing project_id / client_email / private_key');
  }

  const key = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope:
      'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(
      tokenBody.error_description ||
        tokenBody.error ||
        'Failed to obtain Google access token for Firebase Auth.'
    );
  }

  return { token: tokenBody.access_token, projectId: sa.project_id };
}

function authErrorMessage(body: Record<string, unknown>, fallback: string): string {
  const err = body.error;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      if (message.includes('EMAIL_EXISTS')) return 'An account with this email already exists.';
      if (message.includes('WEAK_PASSWORD')) return 'Password is too weak.';
      if (message.includes('INVALID_EMAIL')) return 'Enter a valid email address.';
      return message;
    }
  }
  return fallback;
}

export async function createFirebaseAuthUser(
  input: CreateUserInput
): Promise<{ uid: string }> {
  const { token, projectId } = await getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        displayName: input.displayName || undefined,
        emailVerified: input.emailVerified !== false,
      }),
    }
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(authErrorMessage(body, 'Failed to create customer account.'));
  }
  const uid = typeof body.localId === 'string' ? body.localId : '';
  if (!uid) throw new Error('Firebase Auth did not return a user id.');
  return { uid };
}

export async function deleteFirebaseAuthUser(uid: string): Promise<void> {
  if (!uid) return;
  const { token, projectId } = await getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:delete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localId: uid }),
    }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(authErrorMessage(body, 'Failed to delete Firebase Auth user.'));
  }
}
