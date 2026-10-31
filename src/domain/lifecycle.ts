import type { ApprovalAction, SubmissionStatus, Task, TaskStatus } from '@/types/entities';

/**
 * دورة حياة المهمة:
 *   الحالة الأساسية: جديدة → قيد التنفيذ → مكتملة
 *   مسار التسليم المستقل: لم تُقدَّم → بانتظار المراجعة → (مطلوب تعديلات | معتمدة)
 *
 * القواعد:
 * - لا تصبح المهمة "مكتملة" إلا عبر الاعتماد.
 * - طلب التعديلات يُبقي المهمة قيد التنفيذ ويتطلب سببًا.
 * - إعادة الفتح تعيد المهمة إلى قيد التنفيذ وتتطلب سببًا.
 */

export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

type TaskState = Pick<Task, 'status' | 'submissionStatus'>;

export interface TransitionResult {
  status: TaskStatus;
  submissionStatus: SubmissionStatus;
}

/** الانتقالات اليدوية المسموح بها في الحالة الأساسية (الإكمال يتم عبر الاعتماد فقط) */
export function canSetStatusManually(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  if (to === 'completed') return false;
  if (from === 'completed') return false; // استخدم إعادة الفتح
  return true; // new ⇄ in_progress
}

export function availableApprovalActions(task: TaskState): ApprovalAction[] {
  const actions: ApprovalAction[] = [];
  if (task.status !== 'completed' && (task.submissionStatus === 'not_submitted' || task.submissionStatus === 'changes_requested')) {
    actions.push('submitted');
  }
  if (task.submissionStatus === 'submitted') {
    actions.push('approved', 'changes_requested');
  }
  if (task.status === 'completed') {
    actions.push('reopened');
  }
  return actions;
}

export interface TransitionInput {
  action: ApprovalAction;
  reason: string;
  /** عدد متطلبات قائمة التحقق الإلزامية غير المستوفاة */
  unmetChecklist: number;
}

export function applyApprovalTransition(task: TaskState, input: TransitionInput): TransitionResult {
  const allowed = availableApprovalActions(task);
  if (!allowed.includes(input.action)) {
    throw new LifecycleError('هذا الإجراء غير متاح في حالة المهمة الحالية');
  }
  const reason = input.reason.trim();
  switch (input.action) {
    case 'submitted':
      return { status: 'in_progress', submissionStatus: 'submitted' };
    case 'approved':
      if (input.unmetChecklist > 0) {
        throw new LifecycleError(`لا يمكن الاعتماد: ${input.unmetChecklist} من متطلبات التسليم الإلزامية غير مستوفاة`);
      }
      return { status: 'completed', submissionStatus: 'approved' };
    case 'changes_requested':
      if (!reason) throw new LifecycleError('يجب كتابة سبب طلب التعديلات');
      return { status: 'in_progress', submissionStatus: 'changes_requested' };
    case 'reopened':
      if (!reason) throw new LifecycleError('يجب كتابة سبب إعادة الفتح');
      return { status: 'in_progress', submissionStatus: 'not_submitted' };
  }
}

/** تبدأ المهمة الجديدة تلقائيًا عند تسجيل أي تقدم */
export function autoStartStatus(current: TaskStatus, progress: number): TaskStatus {
  if (current === 'new' && progress > 0) return 'in_progress';
  return current;
}
