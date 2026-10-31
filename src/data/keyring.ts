import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * حلقة المفاتيح — تشفير البيانات على القرص (at-rest).
 *
 * التصميم (تشفير مغلّف / envelope encryption):
 * - مفتاح رئيسي عشوائي 256-bit يُنشأ مرة واحدة (Master Key).
 * - يُشتق منه عبر HKDF-SHA-256 مفتاحان: تشفير السجلات (AES-256-GCM) وفهرسة أعمى (HMAC-SHA-256).
 * - المفتاح الرئيسي محفوظ على القرص فقط مغلّفًا (مشفّرًا) بمفتاح مشتق من كلمة مرور كل ملف عمل.
 * - المفاتيح غير المغلّفة تبقى في الذاكرة فقط أثناء الجلسة، وتُمسح عند الخروج.
 *
 * نستخدم @noble/ciphers و@noble/hashes (مكتبات مدققة أمنيًا) لأنها متزامنة:
 * عمليات Web Crypto غير المتزامنة تُغلق معاملات IndexedDB قبل اكتمالها.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const NONCE_LEN = 12;

export interface Sealed {
  iv: Uint8Array;
  ct: Uint8Array;
}

export interface WrappedKey {
  iv: string;
  ct: string;
}

let master: Uint8Array | null = null;
let encKey: Uint8Array | null = null;
let macKey: Uint8Array | null = null;

export class LockedError extends Error {
  constructor() {
    super('البيانات مقفلة. سجّل الدخول للمتابعة.');
    this.name = 'LockedError';
  }
}

function need(k: Uint8Array | null): Uint8Array {
  if (!k) throw new LockedError();
  return k;
}

export const keyring = {
  isUnlocked(): boolean {
    return master !== null;
  },

  generateMaster(): Uint8Array {
    return randomBytes(32);
  },

  /** فتح الحلقة بالمفتاح الرئيسي (يُنسخ داخليًا) */
  unlock(masterKey: Uint8Array): void {
    if (masterKey.length !== 32) throw new Error('invalid master key');
    keyring.lock();
    master = new Uint8Array(masterKey);
    encKey = hkdf(sha256, master, undefined, enc.encode('maham/v1/records'), 32);
    macKey = hkdf(sha256, master, undefined, enc.encode('maham/v1/blind-index'), 32);
  },

  /** مسح المفاتيح من الذاكرة */
  lock(): void {
    master?.fill(0);
    encKey?.fill(0);
    macKey?.fill(0);
    master = encKey = macKey = null;
  },

  sealBytes(data: Uint8Array): Sealed {
    const iv = randomBytes(NONCE_LEN);
    return { iv, ct: gcm(need(encKey), iv).encrypt(data) };
  },

  openBytes(s: Sealed): Uint8Array {
    try {
      return gcm(need(encKey), new Uint8Array(s.iv)).decrypt(new Uint8Array(s.ct));
    } catch (e) {
      if (e instanceof LockedError) throw e;
      throw new Error('تعذّر فك تشفير سجل (مفتاح غير مطابق أو بيانات تالفة)');
    }
  },

  sealJson(value: unknown): Sealed {
    return keyring.sealBytes(enc.encode(JSON.stringify(value)));
  },

  openJson<T>(s: Sealed): T {
    return JSON.parse(dec.decode(keyring.openBytes(s))) as T;
  },

  /** فهرس أعمى حتمي لقيمة حساسة (للبحث بالمساواة دون كشف القيمة) */
  blindIndex(value: string): string {
    const mac = hmac(sha256, need(macKey), enc.encode(value));
    return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  },

  /** تغليف المفتاح الرئيسي بمفتاح مشتق من كلمة المرور */
  wrapMaster(kek: Uint8Array): WrappedKey {
    const iv = randomBytes(NONCE_LEN);
    const ct = gcm(kek, iv).encrypt(need(master));
    return { iv: toB64(iv), ct: toB64(ct) };
  },

  /** فك تغليف المفتاح الرئيسي — يرمي خطأ إذا كان المفتاح المشتق غير صحيح */
  unwrapMaster(kek: Uint8Array, w: WrappedKey): Uint8Array {
    return gcm(kek, fromB64(w.iv)).decrypt(fromB64(w.ct));
  },
};

function toB64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** اشتقاق مفتاحي التحقق والتغليف من ناتج PBKDF2 لكلمة المرور (فصل الأدوار) */
export function splitPasswordKey(pbkdf2Output: Uint8Array): { verifier: Uint8Array; kek: Uint8Array } {
  return {
    verifier: hkdf(sha256, pbkdf2Output, undefined, enc.encode('maham/v2/verifier'), 32),
    kek: hkdf(sha256, pbkdf2Output, undefined, enc.encode('maham/v2/kek'), 32),
  };
}
