import { effectiveProgress } from '@/domain/progress';
import { dashboardKpis, monthSeries } from '@/domain/metrics';
import { isOverdue } from '@/domain/urgency';
import type { BacklogIdea, Category, Task, TaskStep, TaskUpdate, User } from '@/types/entities';
import { todayStr } from '@/utils/date';
import { getAction, type AIActionId } from './actions';

export interface PromptContext {
  task?: Task;
  steps?: TaskStep[];
  updates?: TaskUpdate[];
  idea?: BacklogIdea;
  tasks?: Task[];
  ideas?: BacklogIdea[];
  users: User[];
  categories: Category[];
  /** إخفاء أسماء المستخدمين قبل الإرسال لمزود خارجي */
  anonymize: boolean;
}

function nameOf(users: User[], id: string | null, anonymize: boolean): string | null {
  if (!id) return null;
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  return anonymize ? `مستخدم ${idx + 1}` : users[idx].name;
}

function taskBrief(t: Task, ctx: PromptContext) {
  return {
    taskId: t.id,
    title: t.title,
    description: t.description.slice(0, 1500),
    category: ctx.categories.find((c) => c.id === t.categoryId)?.name ?? null,
    project: t.project || null,
    entity: t.entity || null,
    assignee: nameOf(ctx.users, t.assigneeId, ctx.anonymize),
    priority: t.priority,
    status: t.status,
    submission: t.submissionStatus,
    progress: effectiveProgress(t),
    startDate: t.startDate,
    dueDate: t.dueDate,
    overdue: isOverdue(t),
    completedAt: t.completedAt?.slice(0, 10) ?? null,
  };
}

/** يبني سياقًا بالحد الأدنى من البيانات اللازمة لكل إجراء (تقليل البيانات المرسلة) */
export function buildContextData(action: AIActionId, ctx: PromptContext): unknown {
  const def = getAction(action);
  if (def.scope === 'task') {
    if (!ctx.task) throw new Error('يجب اختيار مهمة');
    return {
      task: taskBrief(ctx.task, ctx),
      steps: (ctx.steps ?? []).map((s) => ({ title: s.title, weight: s.weight, progress: s.progress, status: s.status, dueDate: s.dueDate })),
      updates: (ctx.updates ?? []).slice(0, 15).map((u) => ({
        date: u.date,
        description: u.description.slice(0, 600),
        progress: u.progressAtUpdate,
        challenges: u.challenges.slice(0, 600) || null,
        nextAction: u.nextAction.slice(0, 300) || null,
      })),
    };
  }
  if (def.scope === 'idea') {
    if (!ctx.idea) throw new Error('يجب اختيار فكرة');
    const i = ctx.idea;
    return {
      idea: {
        title: i.title,
        description: i.description,
        category: ctx.categories.find((c) => c.id === i.categoryId)?.name ?? null,
        priority: i.priority,
        expectedValue: i.expectedValue,
        notes: i.notes,
      },
    };
  }
  const tasks = ctx.tasks ?? [];
  const open = tasks.filter((t) => t.status !== 'completed');
  const base = { today: todayStr(), kpis: dashboardKpis(tasks) };
  switch (action) {
    case 'analyze_overdue':
      return { ...base, overdueTasks: tasks.filter((t) => isOverdue(t)).map((t) => taskBrief(t, ctx)) };
    case 'prioritize':
      return { ...base, openTasks: open.slice(0, 80).map((t) => taskBrief(t, ctx)) };
    case 'monthly_report':
      return {
        ...base,
        months: monthSeries(tasks, 3),
        completedThisMonth: tasks
          .filter((t) => t.completedAt && t.completedAt.slice(0, 7) === base.today.slice(0, 7))
          .map((t) => taskBrief(t, ctx)),
        openTasks: open.slice(0, 50).map((t) => taskBrief(t, ctx)),
      };
    case 'next_tasks':
      return {
        ...base,
        openTasks: open.slice(0, 40).map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
        recentlyCompleted: tasks
          .filter((t) => t.status === 'completed')
          .slice(-15)
          .map((t) => ({ title: t.title })),
        ideas: (ctx.ideas ?? []).filter((i) => i.status === 'open').slice(0, 20).map((i) => ({ title: i.title, value: i.expectedValue })),
      };
    default:
      return { ...base, openTasks: open.slice(0, 60).map((t) => taskBrief(t, ctx)) };
  }
}

export function buildPrompt(action: AIActionId, ctx: PromptContext): string {
  const def = getAction(action);
  const data = buildContextData(action, ctx);
  return [
    'أنت مساعد تنفيذي ذكي داخل تطبيق "مهام" لإدارة المهام. أجب باللغة العربية الفصحى المختصرة.',
    '',
    `المهمة المطلوبة: ${def.label}`,
    def.instruction,
    '',
    'قواعد إلزامية:',
    '1. أجب بكائن JSON واحد صالح فقط، دون أي نص قبله أو بعده، ودون تعليقات.',
    '2. التزم تمامًا بالبنية التالية وأسماء الحقول الإنجليزية كما هي:',
    def.outputSpec,
    '3. القيم المسموحة للأولوية: low, medium, high, urgent.',
    '4. استند فقط إلى البيانات المرفقة ولا تخترع أرقامًا أو حقائق.',
    '',
    'البيانات:',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
  ].join('\n');
}
