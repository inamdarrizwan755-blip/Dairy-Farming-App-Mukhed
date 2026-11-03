export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPinPBKDF2(
  pin: string,
  existingSaltHex?: string
): Promise<{ hashHex: string; saltHex: string }> {
  const encoder = new TextEncoder();
  let saltBytes: Uint8Array<ArrayBuffer>;
  if (existingSaltHex) {
    const buf = new ArrayBuffer(existingSaltHex.length / 2);
    saltBytes = new Uint8Array(buf);
    for (let i = 0; i < saltBytes.length; i++) {
      saltBytes[i] = parseInt(existingSaltHex.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    const buf = new ArrayBuffer(16);
    saltBytes = new Uint8Array(buf);
    crypto.getRandomValues(saltBytes);
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const saltHex = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hashHex, saltHex };
}

export async function verifyPinPBKDF2(
  pin: string,
  expectedHashHex: string,
  saltHex: string
): Promise<boolean> {
  const { hashHex } = await hashPinPBKDF2(pin, saltHex);
  return hashHex === expectedHashHex;
}

export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buf;
}

export async function registerPlatformBiometric(ownerName: string): Promise<string | null> {
  if (!(await isPlatformBiometricAvailable())) return null;
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'DairyTrack Local Vault' },
        user: {
          id: userId,
          name: ownerName || 'farmer@dairytrack.local',
          displayName: ownerName || 'Farm Owner',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 45000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return null;
    return bufferToBase64Url(credential.rawId);
  } catch {
    return null;
  }
}

export async function authenticatePlatformBiometric(credentialIdBase64: string): Promise<boolean> {
  if (!(await isPlatformBiometricAvailable())) return false;
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: base64UrlToBuffer(credentialIdBase64),
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        timeout: 45000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

// Optional Cloud Sync Provider Abstraction (dormant by default for 100% offline privacy)
export interface CloudSyncAdapter {
  readonly providerName: string;
  isConfigured(): boolean;
  pushPendingChanges(): Promise<{ pushedCount: number }>;
  pullRemoteChanges(): Promise<{ pulledCount: number; conflicts: number }>;
}

export class OfflineOnlyCloudAdapter implements CloudSyncAdapter {
  readonly providerName = 'Local Offline Vault (Cloud Disabled)';
  isConfigured(): boolean {
    return false;
  }
  async pushPendingChanges(): Promise<{ pushedCount: number }> {
    return { pushedCount: 0 };
  }
  async pullRemoteChanges(): Promise<{ pulledCount: number; conflicts: number }> {
    return { pulledCount: 0, conflicts: 0 };
  }
}
