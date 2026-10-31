// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/data/db';
import { getStore } from '@/data/store';
import { ensureSetup } from '@/services/setupService';
import { authService, lockoutMs, MAX_FREE_ATTEMPTS } from '@/services/authService';
import { activityService, actor } from '@/services/core';
import { hashPassword, verifyPassword } from '@/utils/crypto';

const store = new Map<string, string>();
globalThis.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

let u1: string;
let u2: string;

beforeEach(async () => {
  store.clear();
  await resetDbForTests();
  await ensureSetup();
  [u1, u2] = (await getStore().users.list()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((u) => u.id);
});

describe('بصمات كلمات المرور', () => {
  it('لا تحفظ كلمة المرور ويتحقق منها بصمتها فقط', async () => {
    const h = await hashPassword('secret123', undefined, 1000);
    expect(h.hash).not.toContain('secret');
    expect(await verifyPassword('secret123', h)).toBe(true);
    expect(await verifyPassword('secret124', h)).toBe(false);
  });
});

describe('تسجيل الدخول المحلي', () => {
  it('أول دخول ينشئ كلمة مرور بشروطها ثم يبدأ الجلسة', async () => {
    await expect(authService.createPassword(u1, 'short1', 'short1')).rejects.toThrow(/8 أحرف/);
    await expect(authService.createPassword(u1, 'onlyletters', 'onlyletters')).rejects.toThrow(/الحروف والأرقام/);
    await expect(authService.createPassword(u1, 'abcd1234', 'abcd12345')).rejects.toThrow(/غير متطابقتين/);
    await authService.createPassword(u1, 'abcd1234', 'abcd1234');
    const u = await getStore().users.get(u1);
    expect(u?.passwordHash).toBeTruthy();
    expect(JSON.stringify(u)).not.toContain('abcd1234');
    expect(actor()).toBe(u1);
    expect((await authService.restore(15))).toBe(u1);
    await expect(authService.createPassword(u1, 'other1234', 'other1234')).rejects.toThrow(/بالفعل/);
  });

  it('يرفض كلمة المرور الخاطئة ويوقف المحاولات مؤقتًا بعد التكرار', async () => {
    await authService.createPassword(u1, 'abcd1234', 'abcd1234');
    await authService.logout();
    const now = Date.now();
    for (let i = 1; i < MAX_FREE_ATTEMPTS; i++) {
      await expect(authService.login(u1, 'wrong999', now)).rejects.toThrow(/غير صحيحة/);
    }
    await expect(authService.login(u1, 'wrong999', now)).rejects.toMatchObject({ lockedUntil: expect.any(String) });
    // حتى كلمة المرور الصحيحة مرفوضة أثناء الإيقاف
    await expect(authService.login(u1, 'abcd1234', now + 1000)).rejects.toThrow(/مؤقتًا/);
    // بعد انتهاء مدة الإيقاف ينجح الدخول ويُصفَّر العداد
    await authService.login(u1, 'abcd1234', now + lockoutMs(MAX_FREE_ATTEMPTS) + 1000);
    expect((await getStore().users.get(u1))?.failedAttempts).toBe(0);
    expect((await activityService.recent(5)).some((a) => a.action === 'login')).toBe(true);
  });

  it('مدة الإيقاف تتضاعف بحد أقصى 15 دقيقة', () => {
    expect(lockoutMs(MAX_FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(MAX_FREE_ATTEMPTS)).toBe(30_000);
    expect(lockoutMs(MAX_FREE_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutMs(MAX_FREE_ATTEMPTS + 20)).toBe(15 * 60_000);
  });

  it('القفل التلقائي: لا تُستعاد الجلسة بعد انتهاء مدة عدم النشاط', async () => {
    await authService.createPassword(u1, 'abcd1234', 'abcd1234');
    expect(await authService.restore(15, Date.now() + 16 * 60_000)).toBeNull();
    expect(await authService.restore(15)).toBeNull();
  });

  it('تغيير كلمة المرور يتطلب الحالية', async () => {
    await authService.createPassword(u1, 'abcd1234', 'abcd1234');
    await expect(authService.changePassword('wrong123', 'newpass12', 'newpass12')).rejects.toThrow(/الحالية/);
    await authService.changePassword('abcd1234', 'newpass12', 'newpass12');
    await authService.logout();
    await expect(authService.login(u1, 'abcd1234')).rejects.toThrow();
    await authService.login(u1, 'newpass12');
  });

  it('المستخدم يستطيع إعادة تعيين كلمة مرور الملف الآخر فقط', async () => {
    await authService.createPassword(u2, 'zzzz9999', 'zzzz9999');
    await authService.logout();
    await authService.createPassword(u1, 'abcd1234', 'abcd1234');
    await expect(authService.resetOtherPassword(u1)).rejects.toThrow(/لملفك/);
    await authService.resetOtherPassword(u2);
    expect((await getStore().users.get(u2))?.passwordHash).toBeNull();
  });
});
