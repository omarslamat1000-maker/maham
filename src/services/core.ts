import { getStore } from '@/data/store';
import type { ActivityLog, EntityType, ID } from '@/types/entities';
import { uuid } from '@/utils/id';
import { nowIso } from '@/utils/date';

/** خطأ أعمال برسالة عربية آمنة للعرض للمستخدم */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** اكتشاف تجاوز مساحة التخزين في IndexedDB (Dexie يغلّف الخطأ الأصلي) */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; inner?: { name?: string }; message?: string };
  return (
    err.name === 'QuotaExceededError' ||
    err.inner?.name === 'QuotaExceededError' ||
    /quota/i.test(err.message ?? '')
  );
}

/** تحويل أي خطأ إلى رسالة عربية آمنة — لا تُعرض تفاصيل داخلية أو بيانات خاصة */
export function toUserMessage(e: unknown): string {
  if (isQuotaError(e)) return 'مساحة التخزين في المتصفح ممتلئة. احذف بعض المرفقات أو صدّر نسخة احتياطية ثم نظّف البيانات.';
  if (e instanceof ServiceError) return e.message;
  if (e instanceof Error && ['LifecycleError', 'BackupError', 'LockedError'].includes(e.name)) return e.message;
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

// ───────────── الجلسة المحلية ─────────────

/**
 * ملف العمل النشط. ليس مصادقة: يحدد فقط من يُنسب إليه الإجراء في سجل التدقيق.
 */
let currentActor: ID | null = null;

export function setActor(id: ID | null): void {
  currentActor = id;
}

export function actor(): ID {
  if (!currentActor) throw new ServiceError('لم يتم اختيار ملف العمل الحالي');
  return currentActor;
}

export function audit(): { createdAt: string; updatedAt: string; createdBy: ID; updatedBy: ID } {
  const ts = nowIso();
  const by = actor();
  return { createdAt: ts, updatedAt: ts, createdBy: by, updatedBy: by };
}

export function touched(): { updatedAt: string; updatedBy: ID } {
  return { updatedAt: nowIso(), updatedBy: actor() };
}

// ───────────── سجل النشاط ─────────────

export async function logActivity(
  entityType: EntityType,
  entityId: ID,
  action: string,
  details: string,
  taskId: ID | null = null,
): Promise<void> {
  const entry: ActivityLog = {
    id: uuid(),
    entityType,
    entityId,
    taskId,
    action,
    userId: actor(),
    details,
    at: nowIso(),
  };
  await getStore().activity.put(entry);
}

export const activityService = {
  async forTask(taskId: ID): Promise<ActivityLog[]> {
    const rows = await getStore().activity.where('taskId', taskId);
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  },
  async recent(limit = 20): Promise<ActivityLog[]> {
    const rows = await getStore().activity.list();
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },
};
