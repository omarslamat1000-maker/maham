import { getStore } from '@/data/store';
import { isDueSoon, isOpen, isOverdue } from '@/domain/urgency';
import type { AppNotification, Approval, ID, NotificationType, Task } from '@/types/entities';
import { nowIso, relativeDue } from '@/utils/date';
import { uuid } from '@/utils/id';
import { DEFAULT_SETTINGS } from './setupService';

type Draft = Omit<AppNotification, 'id' | 'read' | 'createdAt'>;

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function showBrowserNotification(n: Draft): void {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return;
  try {
    // tag يمنع تكرار نفس التنبيه في مركز تنبيهات النظام
    new Notification(n.title, { body: n.message, tag: n.dedupeKey, lang: 'ar', dir: 'rtl', icon: './pwa-192x192.png' });
  } catch {
    // بعض المتصفحات (مثل Android Chrome) تتطلب Service Worker لإظهار التنبيه — نتجاهل بهدوء
  }
}

async function upsert(drafts: Draft[], notifyBrowser: boolean): Promise<number> {
  const store = getStore();
  let created = 0;
  for (const d of drafts) {
    const existing = await store.notifications.where('dedupeKey', d.dedupeKey);
    if (existing.length) continue;
    await store.notifications.put({ ...d, id: uuid(), read: false, createdAt: nowIso() });
    created++;
    if (notifyBrowser) showBrowserNotification(d);
  }
  return created;
}

/** يبني مسودات التنبيهات الزمنية من حالة المهام (دالة نقية قابلة للاختبار) */
export function scheduledDrafts(tasks: readonly Task[], dueSoonDays: number, now = new Date()): Draft[] {
  const drafts: Draft[] = [];
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (isOverdue(t, now)) {
      drafts.push({
        type: 'overdue',
        taskId: t.id,
        userId: t.assigneeId,
        title: 'مهمة متأخرة',
        message: `«${t.title}» تجاوزت تاريخ الاستحقاق (${relativeDue(t.dueDate!, now)})`,
        dedupeKey: `overdue:${t.id}:${t.dueDate}`,
      });
    } else if (isDueSoon(t, dueSoonDays, now)) {
      drafts.push({
        type: 'due_soon',
        taskId: t.id,
        userId: t.assigneeId,
        title: 'مهمة مستحقة قريبًا',
        message: `«${t.title}» تستحق ${relativeDue(t.dueDate!, now)}`,
        dedupeKey: `due_soon:${t.id}:${t.dueDate}`,
      });
    }
    if (t.priority === 'urgent') {
      drafts.push({
        type: 'urgent',
        taskId: t.id,
        userId: t.assigneeId,
        title: 'مهمة عاجلة',
        message: `«${t.title}» مصنفة بأولوية عاجلة`,
        dedupeKey: `urgent:${t.id}`,
      });
    }
  }
  return drafts;
}

export const notificationService = {
  async list(): Promise<AppNotification[]> {
    const rows = await getStore().notifications.list();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async unreadCount(): Promise<number> {
    const rows = await getStore().notifications.list();
    return rows.filter((n) => !n.read).length;
  },

  /** فحص دوري: يولّد تنبيهات الاستحقاق والتأخير والعاجلة دون تكرار */
  async generate(now = new Date()): Promise<number> {
    const store = getStore();
    const settings = (await store.settings.get('app')) ?? { ...DEFAULT_SETTINGS };
    const tasks = (await store.tasks.list()).filter((t) => !t.deletedAt);
    const created = await upsert(scheduledDrafts(tasks, settings.dueSoonDays, now), settings.browserNotifications);

    // إغلاق التنبيهات الزمنية للمهام التي اكتملت أو حُذفت
    const closed = new Set((await store.tasks.list()).filter((t) => !isOpen(t)).map((t) => t.id));
    const timeTypes: NotificationType[] = ['overdue', 'due_soon', 'urgent'];
    for (const n of await store.notifications.list()) {
      if (!n.read && n.taskId && closed.has(n.taskId) && timeTypes.includes(n.type)) {
        await store.notifications.update(n.id, { read: true });
      }
    }
    return created;
  },

  /** تنبيهات أحداث المراجعة */
  async onApproval(task: Task, approval: Approval): Promise<void> {
    const settings = (await getStore().settings.get('app')) ?? { ...DEFAULT_SETTINGS };
    const drafts: Draft[] = [];
    if (approval.action === 'submitted') {
      drafts.push({
        type: 'needs_review',
        taskId: task.id,
        userId: null,
        title: 'مهمة تحتاج مراجعة',
        message: `قُدّمت «${task.title}» للمراجعة والاعتماد`,
        dedupeKey: `needs_review:${approval.id}`,
      });
    }
    if (approval.action === 'changes_requested') {
      drafts.push({
        type: 'changes_requested',
        taskId: task.id,
        userId: task.assigneeId,
        title: 'أعيدت مهمة للتعديل',
        message: `«${task.title}»: ${approval.reason}`,
        dedupeKey: `changes:${approval.id}`,
      });
    }
    if (approval.action === 'approved' || approval.action === 'changes_requested') {
      // إغلاق تنبيه "تحتاج مراجعة" السابق
      const store = getStore();
      for (const n of await store.notifications.where('taskId', task.id)) {
        if (n.type === 'needs_review' && !n.read) await store.notifications.update(n.id, { read: true });
      }
    }
    await upsert(drafts, settings.browserNotifications);
  },

  async markRead(id: ID): Promise<void> {
    await getStore().notifications.update(id, { read: true });
  },

  async markAllRead(): Promise<void> {
    const store = getStore();
    for (const n of await store.notifications.list()) if (!n.read) await store.notifications.update(n.id, { read: true });
  },

  async clearRead(): Promise<void> {
    const store = getStore();
    const read = (await store.notifications.list()).filter((n) => n.read);
    // نحتفظ بمفاتيح منع التكرار للتنبيهات الزمنية حتى لا تعود بعد الحذف
    await store.notifications.bulkDelete(read.filter((n) => n.type === 'needs_review' || n.type === 'changes_requested').map((n) => n.id));
  },

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!browserNotificationsSupported()) return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
    return Notification.requestPermission();
  },
};
