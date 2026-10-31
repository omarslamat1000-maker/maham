/**
 * تشفير النسخ الاحتياطية عبر Web Crypto API القياسية (لا خوارزميات مخترعة):
 * - اشتقاق المفتاح: PBKDF2-SHA-256 بعدد تكرارات مرتفع وملح عشوائي 16 بايت.
 * - التشفير: AES-GCM 256-bit مع IV عشوائي 12 بايت (يوفر السرية والتحقق من السلامة).
 */

export const PBKDF2_ITERATIONS = 600_000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export async function encryptText(plain: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    data: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function decryptText(enc: EncryptedBlob, password: string): Promise<string> {
  const key = await deriveKey(password, base64ToBytes(enc.kdf.salt), enc.kdf.iterations);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(enc.cipher.iv) }, key, base64ToBytes(enc.data));
  return new TextDecoder().decode(pt);
}
