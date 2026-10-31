import { getStore } from '@/data/store';
import type { AppSettings, ID, Settings, User } from '@/types/entities';
import { nowIso } from '@/utils/date';
import { logActivity, ServiceError, touched } from './core';
import { DEFAULT_SETTINGS } from './setupService';

export const settingsService = {
  async get(): Promise<Settings> {
    const s = await getStore().settings.get('app');
    return s ?? { ...DEFAULT_SETTINGS, updatedAt: nowIso() };
  },

  async update(patch: Partial<Omit<AppSettings, 'id'>>): Promise<Settings> {
    const store = getStore();
    const current = await this.get();
    if (patch.dueSoonDays !== undefined && (patch.dueSoonDays < 0 || patch.dueSoonDays > 60)) {
      throw new ServiceError('عدد أيام الاستحقاق القريب يجب أن يكون بين 0 و60');
    }
    if (patch.staleDays !== undefined && (patch.staleDays < 1 || patch.staleDays > 365)) {
      throw new ServiceError('عدد أيام الركود يجب أن يكون بين 1 و365');
    }
    if (patch.maxFileSizeMb !== undefined && (patch.maxFileSizeMb < 1 || patch.maxFileSizeMb > 200)) {
      throw new ServiceError('الحد الأقصى لحجم الملف يجب أن يكون بين 1 و200 ميغابايت');
    }
    if (patch.autoLockMinutes !== undefined && (patch.autoLockMinutes < 0 || patch.autoLockMinutes > 240)) {
      throw new ServiceError('مدة القفل التلقائي يجب أن تكون بين 0 و240 دقيقة');
    }
    const next: Settings = { ...current, ...patch, id: 'app', updatedAt: nowIso() };
    await store.settings.put(next);
    return next;
  },
};

export const userService = {
  async list(): Promise<User[]> {
    const rows = await getStore().users.list();
    // مدير النظام أولًا دائمًا (حتى لو أُنشئ الملفان في اللحظة نفسها)
    const rank = (u: User) => (u.title === 'System Administrator' ? 0 : 1);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || rank(a) - rank(b));
  },

  async update(id: ID, patch: Partial<Pick<User, 'name' | 'title' | 'color'>>): Promise<void> {
    const store = getStore();
    const u = await store.users.get(id);
    if (!u) throw new ServiceError('ملف العمل غير موجود');
    const name = patch.name?.trim();
    if (patch.name !== undefined && (!name || name.length > 60)) throw new ServiceError('الاسم مطلوب (60 حرفًا كحد أقصى)');
    await store.users.put({ ...u, ...patch, ...(name ? { name } : {}), ...touched() });
    await logActivity('user', id, 'updated', `تحديث ملف العمل «${name ?? u.name}»`);
  },
};
