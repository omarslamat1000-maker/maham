import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { activityService, toUserMessage } from '@/services/core';
import { taskService } from '@/services/taskService';
import { stepService } from '@/services/stepService';
import { updateService } from '@/services/updateService';
import { deliverableService } from '@/services/deliverableService';
import { approvalService, checklistService } from '@/services/approvalService';
import { categoryService, ideaService } from '@/services/ideaService';
import { notificationService } from '@/services/notificationService';
import { settingsService, userService } from '@/services/settingsService';
import type { ID } from '@/types/entities';

/**
 * خطافات البيانات التفاعلية: تستدعي طبقة الخدمات فقط، ويُعاد الرسم تلقائيًا عند تغير IndexedDB.
 * القيمة undefined تعني "جارٍ التحميل".
 */

export const useTasks = () => useLiveQuery(() => taskService.listActive(), []);
export const useDeletedTasks = () => useLiveQuery(() => taskService.listDeleted(), []);
export const useTask = (id: ID | undefined) => useLiveQuery(() => (id ? taskService.get(id) : undefined), [id]);
export const useSteps = (taskId: ID) => useLiveQuery(() => stepService.list(taskId), [taskId]);
export const useUpdates = (taskId: ID) => useLiveQuery(() => updateService.list(taskId), [taskId]);
export const useRecentUpdates = (limit = 6) => useLiveQuery(() => updateService.recent(limit), [limit]);
export const useRecentChallenges = (limit = 6) => useLiveQuery(() => updateService.recentWithChallenges(limit), [limit]);
export const useDeliverables = (taskId: ID) => useLiveQuery(() => deliverableService.list(taskId), [taskId]);
export const useDeliverableVersions = (taskId: ID) => useLiveQuery(() => deliverableService.versionsForTask(taskId), [taskId]);
export const useChecklist = (taskId: ID) => useLiveQuery(() => checklistService.evaluate(taskId), [taskId]);
export const useApprovals = (taskId: ID) => useLiveQuery(() => approvalService.history(taskId), [taskId]);
export const useActivity = (taskId: ID) => useLiveQuery(() => activityService.forTask(taskId), [taskId]);
export const useIdeas = () => useLiveQuery(() => ideaService.list(), []);
export const useNotifications = () => useLiveQuery(() => notificationService.list(), []);
export const useUnreadCount = () => useLiveQuery(() => notificationService.unreadCount(), []) ?? 0;
export const useSettings = () => useLiveQuery(() => settingsService.get(), []);
export const useUsers = () => useLiveQuery(() => userService.list(), []);
export const useCategories = (includeDeleted = false) => useLiveQuery(() => categoryService.list(includeDeleted), [includeDeleted]);

/** جداول بحث مشتركة للأسماء والألوان */
export function useLookups() {
  const users = useUsers();
  const categories = useCategories(true);
  return useMemo(() => {
    const u = users ?? [];
    const c = categories ?? [];
    return {
      ready: users !== undefined && categories !== undefined,
      users: u,
      categories: c,
      activeCategories: c.filter((x) => !x.deletedAt),
      userName: (id: ID | null | undefined) => (id ? (u.find((x) => x.id === id)?.name ?? '—') : 'غير مسندة'),
      user: (id: ID | null | undefined) => u.find((x) => x.id === id),
      category: (id: ID | null | undefined) => c.find((x) => x.id === id),
    };
  }, [users, categories]);
}

export function useCurrentUser() {
  const settings = useSettings();
  const users = useUsers();
  return users?.find((u) => u.id === settings?.currentUserId);
}

/**
 * يغلّف إجراءً غير متزامن: حالة انتظار، ورسالة نجاح، وتحويل الأخطاء لرسائل عربية آمنة.
 */
export function useAction() {
  const [pending, setPending] = useState(false);
  /** يعيد نتيجة الدالة عند النجاح، أو false عند الفشل */
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | false> => {
    setPending(true);
    try {
      const r = await fn();
      if (success) toast.success(success);
      return r;
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
      toast.error(toUserMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending };
}
