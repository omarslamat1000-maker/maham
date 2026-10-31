import { getStore } from '@/data/store';
import { evaluateChecklist, unmetRequired, type EvaluatedChecklistItem } from '@/domain/checklist';
import { applyApprovalTransition } from '@/domain/lifecycle';
import type { Approval, ApprovalAction, ChecklistItem, ID, Task } from '@/types/entities';
import { uuid } from '@/utils/id';
import { APPROVAL_ACTION_LABEL } from '@/utils/labels';
import { actor, audit, logActivity, ServiceError, touched } from './core';
import { notificationService } from './notificationService';

export const checklistService = {
  async list(taskId: ID): Promise<ChecklistItem[]> {
    const rows = await getStore().checklist.where('taskId', taskId);
    return rows.sort((a, b) => a.order - b.order);
  },

  async evaluate(taskId: ID): Promise<EvaluatedChecklistItem[]> {
    const store = getStore();
    const [items, steps, deliverables] = await Promise.all([
      store.checklist.where('taskId', taskId),
      store.steps.where('taskId', taskId),
      store.deliverables.where('taskId', taskId),
    ]);
    return evaluateChecklist(items, { steps, deliverables });
  },

  async add(taskId: ID, label: string, required = true): Promise<void> {
    const text = label.trim();
    if (!text) throw new ServiceError('نص المتطلب إلزامي');
    if (text.length > 200) throw new ServiceError('نص المتطلب طويل جدًا');
    const store = getStore();
    await store.transaction(async () => {
      const items = await store.checklist.where('taskId', taskId);
      await store.checklist.put({
        id: uuid(),
        taskId,
        label: text,
        required,
        done: false,
        doneBy: null,
        doneAt: null,
        autoRule: null,
        order: items.reduce((m, i) => Math.max(m, i.order), -1) + 1,
        ...audit(),
      });
      await logActivity('checklist', taskId, 'added', `إضافة متطلب تسليم «${text}»`, taskId);
    });
  },

  async toggle(itemId: ID, done: boolean): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const item = await store.checklist.get(itemId);
      if (!item) throw new ServiceError('المتطلب غير موجود');
      if (item.autoRule) throw new ServiceError('هذا المتطلب يُقيَّم آليًا من بيانات المهمة');
      const t = touched();
      await store.checklist.put({ ...item, done, doneBy: done ? actor() : null, doneAt: done ? t.updatedAt : null, ...t });
      await logActivity('checklist', itemId, 'toggled', `${done ? 'استيفاء' : 'إلغاء استيفاء'} متطلب «${item.label}»`, item.taskId);
    });
  },

  async setRequired(itemId: ID, required: boolean): Promise<void> {
    const store = getStore();
    const item = await store.checklist.get(itemId);
    if (!item) return;
    await store.checklist.put({ ...item, required, ...touched() });
  },

  async remove(itemId: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const item = await store.checklist.get(itemId);
      if (!item) return;
      await store.checklist.delete(itemId);
      await logActivity('checklist', itemId, 'removed', `حذف متطلب «${item.label}»`, item.taskId);
    });
  },
};

export const approvalService = {
  async history(taskId: ID): Promise<Approval[]> {
    const rows = await getStore().approvals.where('taskId', taskId);
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  },

  /**
   * تنفيذ قرار في مسار التسليم:
   * - تقديم للمراجعة / اعتماد / طلب تعديلات / إعادة فتح
   * يسجل القرار وسببه وتاريخه ومنفذه، ويحدّث حالة المهمة وفق قواعد دورة الحياة.
   */
  async perform(taskId: ID, action: ApprovalAction, reason = ''): Promise<Task> {
    const store = getStore();
    const result = await store.transaction(async () => {
      const task = await store.tasks.get(taskId);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      const evaluated = await checklistService.evaluate(taskId);
      const unmet = unmetRequired(evaluated);
      const next = applyApprovalTransition(task, { action, reason, unmetChecklist: unmet.length });
      const t = touched();
      const me = actor();
      const updated: Task = {
        ...task,
        ...next,
        ...t,
        lastActivityAt: t.updatedAt,
        startedAt: task.startedAt ?? t.updatedAt,
      };
      switch (action) {
        case 'submitted':
          updated.submittedBy = me;
          updated.submittedAt = t.updatedAt;
          break;
        case 'approved':
          updated.reviewedBy = me;
          updated.approvedBy = me;
          updated.completedAt = t.updatedAt;
          updated.reviewNotes = reason.trim() || null;
          break;
        case 'changes_requested':
          updated.reviewedBy = me;
          updated.reviewNotes = reason.trim();
          break;
        case 'reopened':
          updated.completedAt = null;
          updated.approvedBy = null;
          updated.reviewNotes = reason.trim();
          break;
      }
      await store.tasks.put(updated);
      const approval: Approval = {
        id: uuid(),
        taskId,
        action,
        userId: me,
        reason: reason.trim(),
        at: t.updatedAt,
        ...audit(),
      };
      await store.approvals.put(approval);
      await logActivity(
        'approval',
        approval.id,
        action,
        `${APPROVAL_ACTION_LABEL[action]}${reason.trim() ? ` — ${reason.trim()}` : ''}`,
        taskId,
      );
      return { updated, approval };
    });
    await notificationService.onApproval(result.updated, result.approval);
    return result.updated;
  },
};
