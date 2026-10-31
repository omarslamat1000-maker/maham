// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '@/data/db';
import { getStore } from '@/data/store';
import { keyring } from '@/data/keyring';
import { ensureSetup } from '@/services/setupService';
import { authService, lockoutMs, MAX_FREE_ATTEMPTS, profileStatus } from '@/services/authService';
import { activityService, actor } from '@/services/core';
import { taskService } from '@/services/taskService';
import { userService } from '@/services/settingsService';
import { deliverableService } from '@/services/deliverableService';
import { notificationService } from '@/services/notificationService';
import { exportBackup, importBackup, readBackupFile } from '@/services/backupService';
import { addDaysStr, todayStr } from '@/utils/date';
import { bytesToBase64 } from '@/utils/crypto';

let u1: string;
let u2: string;
const P1 = 'abcd1234';
const P2 = 'zzzz9999';

beforeEach(async () => {
  keyring.lock();
  await resetDbForTests();
  await ensureSetup();
  [u1, u2] = (await userService.list()).map((u) => u.id);
});

/** يفعّل الملف الأول ثم يعيّن للثاني كلمة مؤقتة ويغيّرها — مسار التشغيل الكامل */
async function setupBoth() {
  await authService.createPassword(u1, P1, P1);
  await authService.setTemporaryPassword(u2, 'temp1234', 'temp1234');
  await authService.logout();
  const r = await authService.login(u2, 'temp1234');
  expect(r.mustChangePassword).toBe(true);
  await authService.completeForcedChange(P2, P2);
  await authService.logout();
}

describe('تسجيل الدخول', () => {
  it('أول دخول ينشئ كلمة مرور بشروطها ويفعّل التشفير', async () => {
    await expect(authService.createPassword(u1, 'short1', 'short1')).rejects.toThrow(/8 أحرف/);
    await expect(authService.createPassword(u1, 'onlyletters', 'onlyletters')).rejects.toThrow(/الحروف والأرقام/);
    await expect(authService.createPassword(u1, P1, 'abcd12345')).rejects.toThrow(/غير متطابقتين/);
    await authService.createPassword(u1, P1, P1);
    const u = await getStore().users.get(u1);
    expect(u?.passwordHash).toBeTruthy();
    expect(u?.wrappedKey).toBeTruthy();
    expect(JSON.stringify(u)).not.toContain(P1);
    expect(actor()).toBe(u1);
    expect(keyring.isUnlocked()).toBe(true);
    expect((await getStore().settings.get('app'))?.encryption).toBeTruthy();
    expect(await getStore().categories.count()).toBe(4);
  });

  it('الملف الثاني بانتظار التفعيل حتى تُعيَّن له كلمة مؤقتة، ثم يُلزم بتغييرها', async () => {
    await authService.createPassword(u1, P1, P1);
    const second = (await getStore().users.get(u2))!;
    expect(profileStatus(second, true)).toBe('pending_activation');
    await expect(authService.createPassword(u2, P2, P2)).rejects.toThrow(/بانتظار التفعيل/);
    await expect(authService.setTemporaryPassword(u1, 'x1234567', 'x1234567')).rejects.toThrow(/لملفك/);
    await authService.logout();
    expect(keyring.isUnlocked()).toBe(false);

    // تسجيل الدخول لملف لم يُفعَّل بعد مرفوض
    await authService.login(u1, P1);
    await authService.setTemporaryPassword(u2, 'temp1234', 'temp1234');
    await authService.logout();
    const r = await authService.login(u2, 'temp1234');
    expect(r.mustChangePassword).toBe(true);
    await authService.completeForcedChange(P2, P2);
    expect((await getStore().users.get(u2))?.mustChangePassword).toBe(false);
  });

  it('يرفض كلمة المرور الخاطئة ويوقف المحاولات مؤقتًا', async () => {
    await authService.createPassword(u1, P1, P1);
    await authService.logout();
    const now = Date.now();
    for (let i = 1; i < MAX_FREE_ATTEMPTS; i++) await expect(authService.login(u1, 'wrong999', now)).rejects.toThrow(/غير صحيحة/);
    await expect(authService.login(u1, 'wrong999', now)).rejects.toMatchObject({ lockedUntil: expect.any(String) });
    await expect(authService.login(u1, P1, now + 1000)).rejects.toThrow(/مؤقتًا/);
    expect(keyring.isUnlocked()).toBe(false);
    await authService.login(u1, P1, now + lockoutMs(MAX_FREE_ATTEMPTS) + 1000);
    expect((await getStore().users.get(u1))?.failedAttempts).toBe(0);
    expect((await activityService.recent(5)).some((a) => a.action === 'login')).toBe(true);
  });

  it('مدة الإيقاف تتضاعف بحد أقصى 15 دقيقة', () => {
    expect(lockoutMs(MAX_FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(MAX_FREE_ATTEMPTS)).toBe(30_000);
    expect(lockoutMs(MAX_FREE_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutMs(MAX_FREE_ATTEMPTS + 20)).toBe(15 * 60_000);
  });

  it('تغيير كلمة المرور يتطلب الحالية ويحافظ على الوصول للبيانات', async () => {
    await authService.createPassword(u1, P1, P1);
    await taskService.create({ title: 'مهمة قبل التغيير' });
    await expect(authService.changePassword('wrong123', 'newpass12', 'newpass12')).rejects.toThrow(/الحالية/);
    await authService.changePassword(P1, 'newpass12', 'newpass12');
    await authService.logout();
    await expect(authService.login(u1, P1)).rejects.toThrow();
    await authService.login(u1, 'newpass12');
    expect((await taskService.listActive()).map((t) => t.title)).toEqual(['مهمة قبل التغيير']);
  });
});

describe('التشفير على القرص', () => {
  it('المحتوى غير مقروء في IndexedDB الخام، ومقروء للمستخدمين الاثنين بعد الدخول', async () => {
    await setupBoth();
    await authService.login(u1, P1);
    const t = await taskService.create({ title: 'خطة سرية للغاية', description: 'تفاصيل حساسة' });
    const file = new File(['محتوى الملف السري'], 'secret.pdf', { type: 'application/pdf' });
    await deliverableService.create(t.id, { name: 'مستند سري', kind: 'pdf' }, { file });

    const db = getDb();
    const rawTasks = JSON.stringify(await db.tasks.toArray());
    expect(rawTasks).not.toContain('سرية');
    expect(rawTasks).not.toContain('تفاصيل');
    const rawBlobs = await db.blobs.toArray();
    const rawBytes = JSON.stringify(rawBlobs, (_k, v) => (v instanceof Uint8Array ? bytesToBase64(v) : v));
    expect(rawBytes).not.toContain(bytesToBase64(new TextEncoder().encode('محتوى الملف السري')));
    expect(JSON.stringify(await db.activity.toArray())).not.toContain('سرية');

    await authService.logout();
    await expect(taskService.listActive()).rejects.toThrow(/مقفلة/);

    await authService.login(u2, P2);
    expect((await taskService.listActive())[0].title).toBe('خطة سرية للغاية');
    const [v] = await deliverableService.versionsForTask(t.id);
    const blob = await deliverableService.getBlob(v.blobId!);
    expect(await blob!.text()).toBe('محتوى الملف السري');
  });

  it('مفتاح خاطئ لا يفك التشفير', async () => {
    await authService.createPassword(u1, P1, P1);
    await taskService.create({ title: 'سري' });
    keyring.unlock(keyring.generateMaster());
    await expect(taskService.listActive()).rejects.toThrow(/فك تشفير/);
  });

  it('يرحّل بيانات الإصدار السابق غير المشفّرة عند أول دخول، ويرقّي بصمة كلمة المرور', async () => {
    const db = getDb();
    // محاكاة بيانات v1.1: مهمة صريحة وبصمة كلمة مرور قديمة (ناتج PBKDF2 مباشرة)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(P1), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, base, 256));
    const u = (await db.users.get(u1))!;
    await db.users.put({ ...u, passwordHash: bytesToBase64(bits), passwordSalt: bytesToBase64(salt), passwordIterations: 1000 });
    await db.tasks.put({ id: 'legacy-1', title: 'مهمة قديمة صريحة', deletedAt: null } as never);

    await authService.login(u1, P1);
    expect(JSON.stringify(await db.tasks.toArray())).not.toContain('مهمة قديمة');
    expect((await taskService.get('legacy-1'))?.title).toBe('مهمة قديمة صريحة');
    const upgraded = (await db.users.get(u1))!;
    expect(upgraded.passwordVersion).toBe(2);
    expect(upgraded.passwordHash).not.toBe(bytesToBase64(bits));
    await authService.logout();
    await authService.login(u1, P1);
  });

  it('الفهرس الأعمى يمنع تكرار التنبيهات دون كشف مفتاحها', async () => {
    await authService.createPassword(u1, P1, P1);
    await taskService.create({ title: 'x', dueDate: addDaysStr(todayStr(), -1), startDate: addDaysStr(todayStr(), -5) });
    expect(await notificationService.generate()).toBe(1);
    expect(await notificationService.generate()).toBe(0);
    expect(JSON.stringify(await getDb().notifications.toArray())).not.toContain('overdue:');
  });

  it('النسخة الاحتياطية لا تتضمن بيانات الاعتماد، والاستيراد يربط الملفات بملفات الجهاز', async () => {
    await authService.createPassword(u1, P1, P1);
    const t = await taskService.create({ title: 'مهمة منقولة', assigneeId: u1 });
    const { blob } = await exportBackup({ includeFiles: true });
    const text = await blob.text();
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('wrappedKey');

    // جهاز جديد: معرّفات مستخدمين مختلفة
    keyring.lock();
    await resetDbForTests();
    await ensureSetup();
    const [n1, n2] = (await userService.list()).map((u) => u.id);
    await authService.createPassword(n1, P1, P1);
    const parsed = await readBackupFile(new Blob([text]));
    if (parsed.kind !== 'plain') throw new Error();
    await importBackup(parsed.backup, 'merge');
    expect(await getStore().users.count()).toBe(2);
    const imported = await taskService.get(t.id);
    expect(imported?.assigneeId).toBe(n1);
    expect(imported?.createdBy).toBe(n1);
    expect([n1, n2]).not.toContain(u1);
  });
});
