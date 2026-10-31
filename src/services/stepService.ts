import { getStore } from '@/data/store';
import { clampPercent, progressFromStepStatus, sanitizeWeight, stepStatusFromProgress } from '@/domain/progress';
import { firstError, stepInputSchema, type StepInput } from '@/domain/schemas';
import type { ID, StepStatus, TaskStep } from '@/types/entities';
import { uuid } from '@/utils/id';
import { STEP_STATUS_LABEL } from '@/utils/labels';
import { audit, logActivity, ServiceError, touched } from './core';
import { taskService } from './taskService';

export type StepPatch = Partial<StepInput> & { status?: StepStatus };

/** يوحّد العلاقة بين الحالة والنسبة: تغيير أحدهما يحدّث الآخر */
function reconcile(step: TaskStep, patch: StepPatch): Pick<TaskStep, 'progress' | 'status'> {
  if (patch.status !== undefined && patch.progress === undefined) {
    return { status: patch.status, progress: progressFromStepStatus(patch.status, step.progress) };
  }
  const progress = clampPercent(Number(patch.progress ?? step.progress));
  return { progress, status: stepStatusFromProgress(progress) };
}

export const stepService = {
  async list(taskId: ID): Promise<TaskStep[]> {
    const rows = await getStore().steps.where('taskId', taskId);
    return rows.sort((a, b) => a.order - b.order);
  },

  async add(taskId: ID, input: StepInput): Promise<TaskStep> {
    const parsed = stepInputSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const store = getStore();
    return store.transaction(async () => {
      const task = await store.tasks.get(taskId);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      if (task.status === 'completed') throw new ServiceError('المهمة مكتملة. أعد فتحها لإضافة خطوات.');
      const existing = await store.steps.where('taskId', taskId);
      const d = parsed.data;
      const progress = clampPercent(d.progress);
      const step: TaskStep = {
        id: uuid(),
        taskId,
        title: d.title,
        description: d.description,
        assigneeId: d.assigneeId,
        startDate: d.startDate,
        dueDate: d.dueDate,
        weight: sanitizeWeight(d.weight),
        progress: d.status ? progressFromStepStatus(d.status, progress) : progress,
        status: d.status ?? stepStatusFromProgress(progress),
        notes: d.notes,
        order: existing.reduce((m, s) => Math.max(m, s.order), -1) + 1,
        ...audit(),
      };
      await store.steps.put(step);
      await taskService.recompute(taskId);
      await logActivity('step', step.id, 'created', `إضافة خطوة «${step.title}» (الوزن ${step.weight})`, taskId);
      return step;
    });
  },

  async update(stepId: ID, patch: StepPatch): Promise<TaskStep> {
    const store = getStore();
    return store.transaction(async () => {
      const step = await store.steps.get(stepId);
      if (!step) throw new ServiceError('الخطوة غير موجودة');
      const task = await store.tasks.get(step.taskId);
      if (task?.status === 'completed') throw new ServiceError('المهمة مكتملة. أعد فتحها لتعديل الخطوات.');
      const merged = { ...step, ...patch };
      const parsed = stepInputSchema.safeParse({
        title: merged.title,
        description: merged.description,
        assigneeId: merged.assigneeId,
        startDate: merged.startDate,
        dueDate: merged.dueDate,
        weight: merged.weight,
        progress: merged.progress,
        notes: merged.notes,
      });
      if (!parsed.success) throw new ServiceError(firstError(parsed.error));
      const sync = reconcile(step, patch);
      const next: TaskStep = {
        ...step,
        ...parsed.data,
        weight: sanitizeWeight(parsed.data.weight),
        ...sync,
        ...touched(),
      };
      await store.steps.put(next);
      await taskService.recompute(step.taskId);
      const notes: string[] = [];
      if (next.weight !== step.weight) notes.push(`الوزن ${step.weight} → ${next.weight}`);
      if (next.progress !== step.progress) notes.push(`الإنجاز ${step.progress}% → ${next.progress}%`);
      if (next.status !== step.status) notes.push(`الحالة: ${STEP_STATUS_LABEL[next.status]}`);
      if (next.title !== step.title) notes.push('تعديل العنوان');
      await logActivity('step', stepId, 'updated', `تحديث خطوة «${next.title}»${notes.length ? ': ' + notes.join('، ') : ''}`, step.taskId);
      return next;
    });
  },

  async remove(stepId: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const step = await store.steps.get(stepId);
      if (!step) return;
      await store.steps.delete(stepId);
      await taskService.recompute(step.taskId);
      await logActivity('step', stepId, 'deleted', `حذف خطوة «${step.title}»`, step.taskId);
    });
  },

  async move(stepId: ID, direction: -1 | 1): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const step = await store.steps.get(stepId);
      if (!step) return;
      const siblings = (await store.steps.where('taskId', step.taskId)).sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((s) => s.id === stepId);
      const swap = siblings[idx + direction];
      if (!swap) return;
      await store.steps.put({ ...step, order: swap.order });
      await store.steps.put({ ...swap, order: step.order });
    });
  },
};
