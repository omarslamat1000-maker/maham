import { getStore } from '@/data/store';
import { DEFAULT_CHECKLIST } from '@/domain/checklist';
import { canSetStatusManually, autoStartStatus } from '@/domain/lifecycle';
import { computeWeightedProgress, effectiveProgress } from '@/domain/progress';
import {
  firstError,
  manualProgressSchema,
  taskInputSchema,
  taskPatchSchema,
  type TaskInput,
  type TaskPatch,
} from '@/domain/schemas';
import type { ChecklistItem, ID, Task, TaskStatus } from '@/types/entities';
import { formatDate, nowIso } from '@/utils/date';
import { uuid } from '@/utils/id';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/utils/labels';
import { audit, actor, logActivity, ServiceError, touched } from './core';

const FIELD_LABEL: Record<string, string> = {
  title: 'العنوان',
  description: 'الوصف',
  categoryId: 'التصنيف',
  project: 'المشروع',
  entity: 'الجهة',
  assigneeId: 'المسؤول',
  priority: 'الأولوية',
  startDate: 'تاريخ البداية',
  dueDate: 'تاريخ النهاية',
};

async function describeChange(key: string, from: unknown, to: unknown): Promise<string> {
  const store = getStore();
  const label = FIELD_LABEL[key] ?? key;
  const show = async (v: unknown): Promise<string> => {
    if (v === null || v === undefined || v === '') return '—';
    if (key === 'priority') return PRIORITY_LABEL[v as Task['priority']];
    if (key === 'startDate' || key === 'dueDate') return formatDate(v as string);
    if (key === 'assigneeId') return (await store.users.get(v as string))?.name ?? '—';
    if (key === 'categoryId') return (await store.categories.get(v as string))?.name ?? '—';
    return String(v);
  };
  if (key === 'description') return `تعديل ${label}`;
  return `تغيير ${label} من «${await show(from)}» إلى «${await show(to)}»`;
}

export function newChecklistItems(taskId: ID): ChecklistItem[] {
  const a = audit();
  return DEFAULT_CHECKLIST.map((c, i) => ({
    id: uuid(),
    taskId,
    label: c.label,
    required: c.required,
    done: false,
    doneBy: null,
    doneAt: null,
    autoRule: c.autoRule,
    order: i,
    ...a,
  }));
}

export const taskService = {
  // ───────── استعلامات ─────────

  async get(id: ID): Promise<Task | undefined> {
    return getStore().tasks.get(id);
  },

  /** جميع المهام غير المحذوفة */
  async listActive(): Promise<Task[]> {
    const rows = await getStore().tasks.list();
    return rows.filter((t) => !t.deletedAt);
  },

  async listDeleted(): Promise<Task[]> {
    const rows = await getStore().tasks.list();
    return rows.filter((t) => !!t.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  },

  // ───────── أوامر ─────────

  async create(input: TaskInput, extra: Partial<Pick<Task, 'sourceIdeaId'>> = {}): Promise<Task> {
    const parsed = taskInputSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const store = getStore();
    const a = audit();
    const task: Task = {
      id: uuid(),
      ...parsed.data,
      status: 'new',
      submissionStatus: 'not_submitted',
      computedProgress: null,
      manualProgress: null,
      manualProgressReason: null,
      manualProgressBy: null,
      manualProgressAt: null,
      startedAt: null,
      completedAt: null,
      submittedBy: null,
      submittedAt: null,
      reviewedBy: null,
      approvedBy: null,
      reviewNotes: null,
      lastActivityAt: a.createdAt,
      sourceIdeaId: extra.sourceIdeaId ?? null,
      deletedAt: null,
      ...a,
    };
    await store.transaction(async () => {
      await store.tasks.put(task);
      await store.checklist.bulkPut(newChecklistItems(task.id));
      await logActivity('task', task.id, 'created', `إنشاء المهمة «${task.title}»`, task.id);
    });
    return task;
  },

  async update(id: ID, patch: TaskPatch): Promise<Task> {
    const parsed = taskPatchSchema.safeParse(patch);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const store = getStore();
    return store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      const changes: Partial<Task> = {};
      const notes: string[] = [];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === undefined) continue;
        const key = k as keyof Task;
        if (task[key] !== v) {
          (changes as Record<string, unknown>)[k] = v;
          notes.push(await describeChange(k, task[key], v));
        }
      }
      const startDate = (changes.startDate !== undefined ? changes.startDate : task.startDate) ?? null;
      const dueDate = (changes.dueDate !== undefined ? changes.dueDate : task.dueDate) ?? null;
      if (startDate && dueDate && dueDate < startDate) {
        throw new ServiceError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      }
      if (notes.length === 0) return task;
      const t = touched();
      const next: Task = { ...task, ...changes, ...t, lastActivityAt: t.updatedAt };
      await store.tasks.put(next);
      for (const n of notes) await logActivity('task', id, 'updated', n, id);
      return next;
    });
  },

  /** تغيير الحالة يدويًا بين "جديدة" و"قيد التنفيذ" — الإكمال عبر الاعتماد فقط */
  async setStatus(id: ID, status: TaskStatus): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      if (task.status === status) return;
      if (!canSetStatusManually(task.status, status)) {
        throw new ServiceError(
          status === 'completed'
            ? 'لا يمكن إكمال المهمة مباشرة. قدّمها للمراجعة ثم اعتمدها.'
            : 'المهمة مكتملة. استخدم "إعادة فتح" مع ذكر السبب.',
        );
      }
      const t = touched();
      await store.tasks.put({
        ...task,
        status,
        startedAt: status === 'in_progress' ? (task.startedAt ?? t.updatedAt) : task.startedAt,
        ...t,
        lastActivityAt: t.updatedAt,
      });
      await logActivity('task', id, 'status', `تغيير الحالة من «${STATUS_LABEL[task.status]}» إلى «${STATUS_LABEL[status]}»`, id);
    });
  },

  /** تعديل يدوي لنسبة الإنجاز — يُحفظ منفصلًا عن القيمة المحسوبة مع السبب والمنفذ والتاريخ */
  async setManualProgress(id: ID, value: number, reason: string): Promise<void> {
    const parsed = manualProgressSchema.safeParse({ value, reason });
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const store = getStore();
    await store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      const t = touched();
      const v = Math.round(parsed.data.value);
      await store.tasks.put({
        ...task,
        manualProgress: v,
        manualProgressReason: parsed.data.reason,
        manualProgressBy: actor(),
        manualProgressAt: t.updatedAt,
        status: autoStartStatus(task.status, v),
        startedAt: task.startedAt ?? (v > 0 ? t.updatedAt : null),
        ...t,
        lastActivityAt: t.updatedAt,
      });
      await logActivity('task', id, 'manual_progress', `تعديل يدوي لنسبة الإنجاز إلى ${v}% — السبب: ${parsed.data.reason}`, id);
    });
  },

  async clearManualProgress(id: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task) throw new ServiceError('المهمة غير موجودة');
      if (task.manualProgress === null) return;
      const t = touched();
      await store.tasks.put({
        ...task,
        manualProgress: null,
        manualProgressReason: null,
        manualProgressBy: null,
        manualProgressAt: null,
        ...t,
        lastActivityAt: t.updatedAt,
      });
      await logActivity('task', id, 'manual_progress_cleared', 'إلغاء التعديل اليدوي والعودة للنسبة المحسوبة من الخطوات', id);
    });
  },

  /**
   * يعيد حساب نسبة الإنجاز المرجّحة من الخطوات ويحدّث آخر نشاط.
   * يُستدعى داخل معاملة من خدمة الخطوات.
   */
  async recompute(taskId: ID): Promise<void> {
    const store = getStore();
    const task = await store.tasks.get(taskId);
    if (!task) return;
    const steps = await store.steps.where('taskId', taskId);
    const computed = computeWeightedProgress(steps);
    const t = touched();
    const next: Task = { ...task, computedProgress: computed, ...t, lastActivityAt: t.updatedAt };
    next.status = autoStartStatus(task.status, effectiveProgress(next));
    if (next.status === 'in_progress' && !next.startedAt) next.startedAt = t.updatedAt;
    await store.tasks.put(next);
  },

  /** تسجيل نشاط على المهمة (يمنع اعتبارها راكدة) */
  async touch(taskId: ID): Promise<void> {
    const store = getStore();
    const task = await store.tasks.get(taskId);
    if (!task) return;
    const t = touched();
    await store.tasks.put({ ...task, ...t, lastActivityAt: t.updatedAt });
  },

  /** حذف منطقي — يمكن الاسترجاع من الإعدادات */
  async softDelete(id: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task || task.deletedAt) return;
      await store.tasks.put({ ...task, deletedAt: nowIso(), ...touched() });
      await logActivity('task', id, 'deleted', `حذف المهمة «${task.title}» (قابل للاسترجاع)`, id);
    });
  },

  async restore(id: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const task = await store.tasks.get(id);
      if (!task || !task.deletedAt) return;
      await store.tasks.put({ ...task, deletedAt: null, ...touched() });
      await logActivity('task', id, 'restored', `استرجاع المهمة «${task.title}»`, id);
    });
  },

  /** حذف نهائي للمهمة وجميع بياناتها التابعة وملفاتها */
  async purge(id: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const [steps, updates, delivs, versions, checklist, approvals, notifs, activity] = await Promise.all([
        store.steps.where('taskId', id),
        store.updates.where('taskId', id),
        store.deliverables.where('taskId', id),
        store.deliverableVersions.where('taskId', id),
        store.checklist.where('taskId', id),
        store.approvals.where('taskId', id),
        store.notifications.where('taskId', id),
        store.activity.where('taskId', id),
      ]);
      const blobIds = [
        ...versions.map((v) => v.blobId),
        ...updates.map((u) => u.attachmentBlobId),
      ].filter((b): b is string => !!b);
      await store.blobs.bulkDelete(blobIds);
      await store.steps.bulkDelete(steps.map((x) => x.id));
      await store.updates.bulkDelete(updates.map((x) => x.id));
      await store.deliverables.bulkDelete(delivs.map((x) => x.id));
      await store.deliverableVersions.bulkDelete(versions.map((x) => x.id));
      await store.checklist.bulkDelete(checklist.map((x) => x.id));
      await store.approvals.bulkDelete(approvals.map((x) => x.id));
      await store.notifications.bulkDelete(notifs.map((x) => x.id));
      await store.activity.bulkDelete(activity.map((x) => x.id));
      await store.tasks.delete(id);
    });
  },
};
