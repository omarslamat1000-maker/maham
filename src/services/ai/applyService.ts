import { effectiveProgress } from '@/domain/progress';
import type { ID, Task } from '@/types/entities';
import { addDaysStr, todayStr } from '@/utils/date';
import { getStore } from '@/data/store';
import { ServiceError } from '../core';
import { ideaService } from '../ideaService';
import { stepService } from '../stepService';
import { taskService } from '../taskService';
import { updateService } from '../updateService';
import type { AIResult } from './actions';

/**
 * تطبيق نتائج الذكاء الاصطناعي — يُستدعى فقط بعد موافقة المستخدم الصريحة
 * وعلى العناصر التي اختارها فقط.
 */
export const aiApplyService = {
  async addSteps(taskId: ID, steps: AIResult<'suggest_steps'>['steps']): Promise<number> {
    for (const s of steps) await stepService.add(taskId, { title: s.title, description: s.description, weight: s.weight });
    return steps.length;
  },

  async addCorrectiveActionsAsSteps(taskId: ID, actions: AIResult<'corrective_actions'>['actions']): Promise<number> {
    for (const a of actions) {
      await stepService.add(taskId, {
        title: a.title,
        description: a.description,
        weight: 1,
        dueDate: a.dueInDays !== undefined ? addDaysStr(todayStr(), a.dueInDays) : null,
      });
    }
    return actions.length;
  },

  async replaceDescription(taskId: ID, description: string): Promise<void> {
    await taskService.update(taskId, { description });
  },

  async applyPriorities(items: AIResult<'prioritize'>['items']): Promise<number> {
    let n = 0;
    for (const it of items) {
      const t = await getStore().tasks.get(it.taskId);
      if (!t || t.deletedAt || t.status === 'completed') continue;
      if (t.priority !== it.priority) {
        await taskService.update(it.taskId, { priority: it.priority });
        n++;
      }
    }
    return n;
  },

  async createTasks(tasks: AIResult<'next_tasks'>['tasks']): Promise<Task[]> {
    const out: Task[] = [];
    for (const t of tasks) out.push(await taskService.create({ title: t.title, description: t.description, priority: t.priority ?? 'medium' }));
    return out;
  },

  async ideaToPlan(ideaId: ID, plan: AIResult<'idea_to_plan'>): Promise<Task> {
    const idea = await ideaService.get(ideaId);
    if (!idea) throw new ServiceError('الفكرة غير موجودة');
    if (idea.status === 'converted') throw new ServiceError('حُوّلت هذه الفكرة إلى مهمة مسبقًا');
    const task = await ideaService.convertToTask(ideaId);
    await taskService.update(task.id, { title: plan.title, description: plan.description, ...(plan.priority ? { priority: plan.priority } : {}) });
    for (const s of plan.steps) await stepService.add(task.id, { title: s.title, description: s.description, weight: s.weight });
    return task;
  },

  /** حفظ نتيجة نصية كتحديث على المهمة */
  async saveAsUpdate(taskId: ID, text: string): Promise<void> {
    const t = await taskService.get(taskId);
    if (!t) throw new ServiceError('المهمة غير موجودة');
    await updateService.add(taskId, {
      date: todayStr(),
      description: `[MAHAM AI] ${text}`.slice(0, 5000),
      progressAtUpdate: effectiveProgress(t),
      challenges: '',
      nextAction: '',
    });
  },
};
