import { getStore } from '@/data/store';
import type { Category, Settings, User } from '@/types/entities';
import { CATEGORY_COLORS } from '@/utils/labels';
import { uuid } from '@/utils/id';
import { nowIso } from '@/utils/date';
import { setActor } from './core';

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  id: 'app',
  currentUserId: null,
  dueSoonDays: 3,
  staleDays: 7,
  weekStartsOn: 0,
  browserNotifications: false,
  lastBackupAt: null,
  maxFileSizeMb: 25,
  onboardingDismissed: false,
  autoLockMinutes: 15,
};

const SYSTEM = 'system';

/** التصنيفات الافتراضية — تُنشأ عند تفعيل التشفير (تتطلب مفتاح البيانات) */
export async function seedDefaultCategories(): Promise<void> {
  const store = getStore();
  if ((await store.categories.count()) > 0) return;
  const ts = nowIso();
  const cats: Category[] = ['عمل', 'شخصي', 'مشاريع', 'إداري'].map((name, i) => ({
    id: uuid(),
    name,
    color: CATEGORY_COLORS[i],
    deletedAt: null,
    createdAt: ts,
    updatedAt: ts,
    createdBy: SYSTEM,
    updatedBy: SYSTEM,
  }));
  await store.categories.bulkPut(cats);
}

/**
 * تهيئة أول تشغيل: ملفا العمل والإعدادات (غير مشفّرة لأنها مطلوبة قبل الدخول).
 * لا تُنشأ أي مهام أو أرقام وهمية.
 */
export async function ensureSetup(): Promise<Settings> {
  const store = getStore();
  return store.transaction(async () => {
    let users = await store.users.list();
    if (users.length === 0) {
      const ts = nowIso();
      const mk = (name: string, title: string, color: string): User => ({
        id: uuid(),
        name,
        title,
        role: 'admin',
        color,
        authProviderId: null,
        createdAt: ts,
        updatedAt: ts,
        createdBy: SYSTEM,
        updatedBy: SYSTEM,
      });
      users = [mk('مدير النظام', 'System Administrator', '#047857'), mk('المدير الثاني', 'Second Administrator', '#0f766e')];
      await store.users.bulkPut(users);

    }

    let settings = await store.settings.get('app');
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS, currentUserId: users[0].id, updatedAt: nowIso() };
      await store.settings.put(settings);
    } else if (!settings.currentUserId || !users.some((u) => u.id === settings!.currentUserId)) {
      settings = { ...settings, currentUserId: users[0].id, updatedAt: nowIso() };
      await store.settings.put(settings);
    }
    setActor(settings.currentUserId);
    return settings;
  });
}
