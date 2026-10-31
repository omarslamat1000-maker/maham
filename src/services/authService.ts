import Dexie from 'dexie';
import { getStore } from '@/data/store';
import { DB_NAME, getDb } from '@/data/db';
import type { ID, User } from '@/types/entities';
import { hashPassword, verifyPassword } from '@/utils/crypto';
import { nowIso } from '@/utils/date';
import { actor, logActivity, ServiceError, setActor, touched } from './core';

/**
 * تسجيل الدخول المحلي (قفل الجهاز).
 *
 * ما يوفره: منع فتح التطبيق دون كلمة مرور الملف، بصمات PBKDF2 بدل كلمات المرور،
 * إبطاء محاولات التخمين، وقفل تلقائي عند عدم النشاط.
 * ما لا يوفره: ليس مصادقة خادمية، والبيانات في IndexedDB غير مشفّرة على القرص؛
 * شخص يملك وصولًا تقنيًا لملفات المتصفح يمكنه قراءتها. (انظر docs/SECURITY.md)
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_FREE_ATTEMPTS = 5;
const SESSION_KEY = 'maham.session';

export class AuthError extends ServiceError {
  constructor(
    message: string,
    readonly lockedUntil: string | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface Session {
  userId: ID;
  /** آخر نشاط (ms) — يُستخدم للقفل التلقائي عند إعادة التحميل */
  lastActive: number;
}

// ───────────── الجلسة (لكل تبويب فقط عبر sessionStorage) ─────────────

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return typeof s.userId === 'string' && typeof s.lastActive === 'number' ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* التخزين غير متاح — تبقى الجلسة في الذاكرة */
  }
}

export function touchSession(): void {
  const s = readSession();
  if (s) writeSession({ ...s, lastActive: Date.now() });
}

/** مدة القفل بعد تجاوز المحاولات المسموحة: 30 ثانية تتضاعف حتى 15 دقيقة */
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < MAX_FREE_ATTEMPTS) return 0;
  return Math.min(15 * 60_000, 30_000 * 2 ** (failedAttempts - MAX_FREE_ATTEMPTS));
}

export function hasPassword(u: Pick<User, 'passwordHash'>): boolean {
  return !!u.passwordHash;
}

function validateNewPassword(pw: string): void {
  if (pw.length < MIN_PASSWORD_LENGTH) throw new AuthError(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} أحرف`);
  if (pw.length > 256) throw new AuthError('كلمة المرور طويلة جدًا');
  if (!/[^\d]/.test(pw) || !/\d/.test(pw)) throw new AuthError('استخدم مزيجًا من الحروف والأرقام');
}

async function getUser(userId: ID): Promise<User> {
  const u = await getStore().users.get(userId);
  if (!u) throw new AuthError('ملف العمل غير موجود');
  return u;
}

async function storePassword(u: User, pw: string, by: ID): Promise<void> {
  const h = await hashPassword(pw);
  await getStore().users.put({
    ...u,
    passwordHash: h.hash,
    passwordSalt: h.salt,
    passwordIterations: h.iterations,
    passwordUpdatedAt: nowIso(),
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
    updatedBy: by,
  });
}

async function startSession(u: User): Promise<void> {
  const store = getStore();
  setActor(u.id);
  await store.users.put({ ...u, failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso() });
  const settings = await store.settings.get('app');
  if (settings) await store.settings.put({ ...settings, currentUserId: u.id, updatedAt: nowIso() });
  writeSession({ userId: u.id, lastActive: Date.now() });
  await logActivity('user', u.id, 'login', `تسجيل دخول «${u.name}»`);
}

export const authService = {
  /** إنشاء كلمة مرور لأول مرة لملف ليس له كلمة مرور، ثم الدخول */
  async createPassword(userId: ID, password: string, confirm: string): Promise<User> {
    const u = await getUser(userId);
    if (hasPassword(u)) throw new AuthError('لهذا الملف كلمة مرور بالفعل');
    if (password !== confirm) throw new AuthError('كلمتا المرور غير متطابقتين');
    validateNewPassword(password);
    await storePassword(u, password, u.id);
    const fresh = await getUser(userId);
    await startSession(fresh);
    return fresh;
  },

  async login(userId: ID, password: string, now = Date.now()): Promise<User> {
    const u = await getUser(userId);
    if (!hasPassword(u)) throw new AuthError('لم تُنشأ كلمة مرور لهذا الملف بعد');
    if (u.lockedUntil && new Date(u.lockedUntil).getTime() > now) {
      throw new AuthError('تم إيقاف المحاولات مؤقتًا بسبب كثرة المحاولات الخاطئة', u.lockedUntil);
    }
    const ok = await verifyPassword(password, {
      hash: u.passwordHash!,
      salt: u.passwordSalt!,
      iterations: u.passwordIterations ?? 600_000,
    });
    if (!ok) {
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
    await startSession(u);
    return u;
  },

  /** استعادة جلسة التبويب بعد إعادة التحميل إن لم تنتهِ مدة القفل التلقائي */
  async restore(autoLockMinutes: number, now = Date.now()): Promise<ID | null> {
    const s = readSession();
    if (!s) return null;
    if (autoLockMinutes > 0 && now - s.lastActive > autoLockMinutes * 60_000) {
      writeSession(null);
      return null;
    }
    const u = await getStore().users.get(s.userId);
    if (!u || !hasPassword(u)) {
      writeSession(null);
      return null;
    }
    setActor(u.id);
    writeSession({ ...s, lastActive: now });
    return u.id;
  },

  async logout(reason: 'manual' | 'idle' = 'manual'): Promise<void> {
    try {
      await logActivity('user', actor(), reason === 'idle' ? 'auto_lock' : 'logout', reason === 'idle' ? 'قفل تلقائي بسبب عدم النشاط' : 'تسجيل خروج');
    } catch {
      /* لا يوجد ملف نشط */
    }
    writeSession(null);
    setActor(null);
  },

  async changePassword(current: string, next: string, confirm: string): Promise<void> {
    const u = await getUser(actor());
    const ok = await verifyPassword(current, { hash: u.passwordHash ?? '', salt: u.passwordSalt ?? '', iterations: u.passwordIterations ?? 600_000 });
    if (!ok) throw new AuthError('كلمة المرور الحالية غير صحيحة');
    if (next !== confirm) throw new AuthError('كلمتا المرور الجديدتان غير متطابقتين');
    if (next === current) throw new AuthError('اختر كلمة مرور مختلفة عن الحالية');
    validateNewPassword(next);
    await storePassword(u, next, u.id);
    await logActivity('user', u.id, 'password_changed', 'تغيير كلمة المرور');
  },

  /**
   * إعادة تعيين كلمة مرور الملف الآخر (المستخدمان بالصلاحيات نفسها).
   * يُطلب من صاحب الملف إنشاء كلمة مرور جديدة عند دخوله التالي.
   */
  async resetOtherPassword(targetId: ID): Promise<void> {
    const me = actor();
    if (targetId === me) throw new AuthError('استخدم «تغيير كلمة المرور» لملفك');
    const u = await getUser(targetId);
    await getStore().users.put({
      ...u,
      passwordHash: null,
      passwordSalt: null,
      passwordIterations: null,
      passwordUpdatedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      ...touched(),
    });
    await logActivity('user', targetId, 'password_reset', `إعادة تعيين كلمة مرور «${u.name}»`);
  },

  /**
   * الملاذ الأخير عند نسيان كلمتي المرور: حذف جميع بيانات التطبيق من هذا المتصفح.
   * يمكن بعدها استيراد نسخة احتياطية.
   */
  async wipeAllData(): Promise<void> {
    writeSession(null);
    setActor(null);
    getDb().close();
    await Dexie.delete(DB_NAME);
  },
};
