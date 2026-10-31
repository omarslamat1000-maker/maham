import Dexie from 'dexie';
import { getStore, encryptedRepos } from '@/data/store';
import { DB_NAME, getDb } from '@/data/db';
import { keyring, splitPasswordKey } from '@/data/keyring';
import type { ID, User } from '@/types/entities';
import { base64ToBytes, bytesToBase64, constantTimeEqual, PBKDF2_ITERATIONS } from '@/utils/crypto';
import { nowIso } from '@/utils/date';
import { actor, logActivity, ServiceError, setActor, touched } from './core';
import { seedDefaultCategories } from './setupService';

/**
 * تسجيل الدخول + تشفير البيانات على القرص.
 *
 * - كلمة المرور ← PBKDF2-SHA-256 (600,000 تكرار، ملح عشوائي) ← HKDF إلى:
 *   (1) بصمة تحقق تُخزَّن، (2) مفتاح تغليف (KEK) لا يُخزَّن أبدًا.
 * - المفتاح الرئيسي للبيانات يُخزَّن مغلّفًا بـ KEK لكل ملف عمل؛ يُفك عند الدخول ويبقى في الذاكرة فقط.
 * - المحتوى مشفّر AES-256-GCM. دون كلمة مرور صحيحة لا يمكن قراءة البيانات حتى من ملفات المتصفح.
 * - المستخدم الثاني يحصل على المفتاح عبر كلمة مرور مؤقتة يعيّنها المستخدم الذي سجّل دخوله.
 * - إعادة تحميل الصفحة أو القفل التلقائي يمسحان المفتاح من الذاكرة ← يلزم دخول جديد.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_FREE_ATTEMPTS = 5;

export class AuthError extends ServiceError {
  constructor(
    message: string,
    readonly lockedUntil: string | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type ProfileStatus = 'ready' | 'create' | 'pending_activation';

/** حالة ملف العمل في شاشة الدخول */
export function profileStatus(u: User, encryptionEnabled: boolean): ProfileStatus {
  if (!encryptionEnabled) return u.passwordHash ? 'ready' : 'create';
  return u.passwordHash && u.wrappedKey ? 'ready' : 'pending_activation';
}

export function hasPassword(u: Pick<User, 'passwordHash'>): boolean {
  return !!u.passwordHash;
}

/** مدة القفل بعد تجاوز المحاولات المسموحة: 30 ثانية تتضاعف حتى 15 دقيقة */
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < MAX_FREE_ATTEMPTS) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (failedAttempts - MAX_FREE_ATTEMPTS));
}

function validateNewPassword(pw: string): void {
  if (pw.length < MIN_PASSWORD_LENGTH) throw new AuthError(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} أحرف`);
  if (pw.length > 256) throw new AuthError('كلمة المرور طويلة جدًا');
  if (!/[^\d]/.test(pw) || !/\d/.test(pw)) throw new AuthError('استخدم مزيجًا من الحروف والأرقام');
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
}

interface Verified {
  ok: boolean;
  /** مفتاح التغليف (null لبصمات الإصدار 1 القديمة) */
  kek: Uint8Array | null;
}

async function verify(u: User, password: string): Promise<Verified> {
  if (!u.passwordHash || !u.passwordSalt) return { ok: false, kek: null };
  const p = await pbkdf2(password, base64ToBytes(u.passwordSalt), u.passwordIterations ?? PBKDF2_ITERATIONS);
  if ((u.passwordVersion ?? 1) >= 2) {
    const { verifier, kek } = splitPasswordKey(p);
    return constantTimeEqual(bytesToBase64(verifier), u.passwordHash) ? { ok: true, kek } : { ok: false, kek: null };
  }
  // الإصدار 1: البصمة كانت ناتج PBKDF2 نفسه — تُرقّى عند أول دخول ناجح
  return { ok: constantTimeEqual(bytesToBase64(p), u.passwordHash), kek: null };
}

/** يحفظ بيانات اعتماد جديدة ويغلّف المفتاح الرئيسي (يتطلب حلقة مفاتيح مفتوحة) */
async function setCredentials(u: User, password: string, opts: { mustChange: boolean; by: ID }): Promise<User> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { verifier, kek } = splitPasswordKey(await pbkdf2(password, salt, PBKDF2_ITERATIONS));
  const next: User = {
    ...u,
    passwordHash: bytesToBase64(verifier),
    passwordSalt: bytesToBase64(salt),
    passwordIterations: PBKDF2_ITERATIONS,
    passwordVersion: 2,
    passwordUpdatedAt: nowIso(),
    wrappedKey: keyring.wrapMaster(kek),
    mustChangePassword: opts.mustChange,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
    updatedBy: opts.by,
  };
  kek.fill(0);
  await getStore().users.put(next);
  return next;
}

async function getUser(userId: ID): Promise<User> {
  const u = await getStore().users.get(userId);
  if (!u) throw new AuthError('ملف العمل غير موجود');
  return u;
}

async function encryptionEnabled(): Promise<boolean> {
  return !!(await getStore().settings.get('app'))?.encryption;
}

/**
 * أول فتح على هذا الجهاز: إنشاء المفتاح الرئيسي، وتشفير أي بيانات قديمة غير مشفّرة،
 * وإنشاء التصنيفات الافتراضية.
 */
async function enableEncryption(): Promise<void> {
  keyring.unlock(keyring.generateMaster());
  for (const repo of encryptedRepos()) await repo.encryptLegacyRows();
  await seedDefaultCategories();
  const store = getStore();
  const s = await store.settings.get('app');
  if (s) await store.settings.put({ ...s, encryption: { version: 1, enabledAt: nowIso() }, updatedAt: nowIso() });
}

async function startSession(u: User): Promise<void> {
  const store = getStore();
  setActor(u.id);
  const fresh = (await store.users.get(u.id)) ?? u;
  await store.users.put({ ...fresh, failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso() });
  const settings = await store.settings.get('app');
  if (settings) await store.settings.put({ ...settings, currentUserId: u.id, updatedAt: nowIso() });
  await logActivity('user', u.id, 'login', `تسجيل دخول «${u.name}»`);
}

const pendingMessage = 'هذا الملف بانتظار التفعيل: يجب أن يعيّن له المستخدم الآخر كلمة مرور مؤقتة من الإعدادات ← الأمان وتسجيل الدخول.';

export interface LoginResult {
  user: User;
  /** يجب تعيين كلمة مرور جديدة قبل الدخول (كلمة مؤقتة) */
  mustChangePassword: boolean;
}

export const authService = {
  isUnlocked: () => keyring.isUnlocked(),

  /** أول دخول على الجهاز: إنشاء كلمة المرور وتفعيل التشفير */
  async createPassword(userId: ID, password: string, confirm: string): Promise<User> {
    const u = await getUser(userId);
    if (hasPassword(u)) throw new AuthError('لهذا الملف كلمة مرور بالفعل');
    if (await encryptionEnabled()) throw new AuthError(pendingMessage);
    if (password !== confirm) throw new AuthError('كلمتا المرور غير متطابقتين');
    validateNewPassword(password);
    await enableEncryption();
    const fresh = await setCredentials(u, password, { mustChange: false, by: u.id });
    await startSession(fresh);
    return fresh;
  },

  async login(userId: ID, password: string, now = Date.now()): Promise<LoginResult> {
    const u = await getUser(userId);
    if (!hasPassword(u)) throw new AuthError((await encryptionEnabled()) ? pendingMessage : 'لم تُنشأ كلمة مرور لهذا الملف بعد');
    if (u.lockedUntil && new Date(u.lockedUntil).getTime() > now) {
      throw new AuthError('تم إيقاف المحاولات مؤقتًا بسبب كثرة المحاولات الخاطئة', u.lockedUntil);
    }
    const v = await verify(u, password);
    if (!v.ok) {
      const failed = (u.failedAttempts ?? 0) + 1;
      const wait = lockoutMs(failed);
      const lockedUntil = wait ? new Date(now + wait).toISOString() : null;
      await getStore().users.put({ ...u, failedAttempts: failed, lockedUntil });
      const left = MAX_FREE_ATTEMPTS - failed;
      throw new AuthError(
        lockedUntil ? 'كلمة المرور غير صحيحة. تم إيقاف المحاولات مؤقتًا.' : `كلمة المرور غير صحيحة. المحاولات المتبقية قبل الإيقاف المؤقت: ${left}`,
        lockedUntil,
      );
    }

    let user = u;
    if (await encryptionEnabled()) {
      if (!v.kek || !u.wrappedKey) throw new AuthError(pendingMessage);
      try {
        keyring.unlock(keyring.unwrapMaster(v.kek, u.wrappedKey));
      } catch {
        throw new AuthError('تعذّر فتح مفتاح البيانات لهذا الملف. اطلب من المستخدم الآخر تعيين كلمة مرور مؤقتة لك.');
      } finally {
        v.kek.fill(0);
      }
    } else {
      // ترقية من إصدار دون تشفير: هذا الدخول يفعّل التشفير ويشفّر البيانات الموجودة
      await enableEncryption();
      user = await setCredentials(u, password, { mustChange: false, by: u.id });
    }
    await startSession(user);
    return { user, mustChangePassword: !!user.mustChangePassword };
  },

  /** تعيين كلمة المرور الدائمة بعد الدخول بكلمة مؤقتة */
  async completeForcedChange(password: string, confirm: string): Promise<void> {
    const u = await getUser(actor());
    if (!u.mustChangePassword) throw new AuthError('لا يوجد تغيير مطلوب');
    if (password !== confirm) throw new AuthError('كلمتا المرور غير متطابقتين');
    validateNewPassword(password);
    await setCredentials(u, password, { mustChange: false, by: u.id });
    await logActivity('user', u.id, 'password_changed', 'تعيين كلمة مرور دائمة بعد كلمة مؤقتة');
  },

  logout(reason: 'manual' | 'idle' = 'manual'): Promise<void> {
    return (async () => {
      try {
        if (keyring.isUnlocked()) {
          await logActivity('user', actor(), reason === 'idle' ? 'auto_lock' : 'logout', reason === 'idle' ? 'قفل تلقائي بسبب عدم النشاط' : 'تسجيل خروج');
        }
      } catch {
        /* لا يوجد ملف نشط */
      }
      keyring.lock();
      setActor(null);
    })();
  },

  async changePassword(current: string, next: string, confirm: string): Promise<void> {
    const u = await getUser(actor());
    if (!(await verify(u, current)).ok) throw new AuthError('كلمة المرور الحالية غير صحيحة');
    if (next !== confirm) throw new AuthError('كلمتا المرور الجديدتان غير متطابقتين');
    if (next === current) throw new AuthError('اختر كلمة مرور مختلفة عن الحالية');
    validateNewPassword(next);
    await setCredentials(u, next, { mustChange: false, by: u.id });
    await logActivity('user', u.id, 'password_changed', 'تغيير كلمة المرور');
  },

  /**
   * تعيين كلمة مرور مؤقتة للملف الآخر: تفعيل ملف جديد أو استعادة كلمة منسية.
   * يُغلَّف المفتاح الرئيسي بها، ويُلزم صاحب الملف بتغييرها عند دخوله.
   */
  async setTemporaryPassword(targetId: ID, temp: string, confirm: string): Promise<void> {
    const me = actor();
    if (targetId === me) throw new AuthError('استخدم «تغيير كلمة المرور» لملفك');
    if (temp !== confirm) throw new AuthError('كلمتا المرور غير متطابقتين');
    validateNewPassword(temp);
    const u = await getUser(targetId);
    await setCredentials(u, temp, { mustChange: true, by: me });
    await getStore().users.put({ ...(await getUser(targetId)), ...touched() });
    await logActivity('user', targetId, 'temp_password', `تعيين كلمة مرور مؤقتة لـ«${u.name}»`);
  },

  /**
   * الملاذ الأخير عند نسيان كلمتي المرور: حذف جميع بيانات التطبيق من هذا المتصفح.
   * البيانات المشفّرة لا يمكن استعادتها دون كلمة مرور؛ يمكن بعدها استيراد نسخة احتياطية.
   */
  async wipeAllData(): Promise<void> {
    keyring.lock();
    setActor(null);
    getDb().close();
    await Dexie.delete(DB_NAME);
  },
};
