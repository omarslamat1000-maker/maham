import type { StepStatus, Task, TaskStep } from '@/types/entities';

/** يقيّد القيمة ضمن [0, 100] ويحوّل القيم غير الصالحة إلى 0 */
export function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** يقيّد الوزن ليكون غير سالب */
export function sanitizeWeight(w: number): number {
  if (!Number.isFinite(w) || w < 0) return 0;
  return w;
}

type StepLike = Pick<TaskStep, 'weight' | 'progress'>;

/**
 * Task Progress = SUM(Step Weight × Step Progress) / SUM(Step Weight)
 *
 * - لا توجد خطوات → null (لا يمكن الحساب).
 * - الأوزان السالبة تُعامل كصفر، ونسب الإنجاز تُقيَّد ضمن 0–100.
 * - إذا كان مجموع الأوزان صفرًا → تُعامل جميع الخطوات بأوزان متساوية (تطبيع).
 * - الناتج مقرّب إلى عدد صحيح.
 */
export function computeWeightedProgress(steps: readonly StepLike[]): number | null {
  if (steps.length === 0) return null;
  const weights = steps.map((s) => sanitizeWeight(s.weight));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const effectiveWeights = totalWeight > 0 ? weights : steps.map(() => 1);
  const effTotal = effectiveWeights.reduce((a, b) => a + b, 0);
  const sum = steps.reduce((acc, s, i) => acc + effectiveWeights[i] * clampPercent(s.progress), 0);
  return Math.round(clampPercent(sum / effTotal));
}

/** أوزان الخطوات بعد التطبيع كنسب مئوية مجموعها 100 (للعرض) */
export function normalizedWeights(steps: readonly StepLike[]): number[] {
  if (steps.length === 0) return [];
  const weights = steps.map((s) => sanitizeWeight(s.weight));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return steps.map(() => 100 / steps.length);
  return weights.map((w) => (w / total) * 100);
}

/**
 * نسبة الإنجاز الفعّالة المعروضة للمستخدم:
 * 1) التعديل اليدوي إن وجد.
 * 2) القيمة المحسوبة من الخطوات.
 * 3) بلا خطوات: 100 للمكتملة و0 لغيرها.
 */
export function effectiveProgress(
  task: Pick<Task, 'manualProgress' | 'computedProgress' | 'status'>,
): number {
  if (task.manualProgress !== null && task.manualProgress !== undefined) return clampPercent(task.manualProgress);
  if (task.computedProgress !== null && task.computedProgress !== undefined) return clampPercent(task.computedProgress);
  return task.status === 'completed' ? 100 : 0;
}

/** مزامنة حالة الخطوة مع نسبة إنجازها */
export function stepStatusFromProgress(progress: number): StepStatus {
  const p = clampPercent(progress);
  if (p >= 100) return 'done';
  if (p > 0) return 'in_progress';
  return 'pending';
}

export function progressFromStepStatus(status: StepStatus, current: number): number {
  if (status === 'done') return 100;
  if (status === 'pending') return 0;
  // جارية: احتفظ بالقيمة الحالية إن كانت بين 1 و99
  const p = clampPercent(current);
  return p > 0 && p < 100 ? p : 10;
}
