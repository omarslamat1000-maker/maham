import type { Task } from '@/types/entities';
import { diffDays, timestampToDateOnly, todayStr } from '@/utils/date';

export interface UrgencyOptions {
  now?: Date;
  dueSoonDays: number;
  staleDays: number;
}

type T = Pick<Task, 'status' | 'dueDate' | 'priority' | 'lastActivityAt' | 'deletedAt'>;

export const isOpen = (t: Pick<Task, 'status' | 'deletedAt'>) => !t.deletedAt && t.status !== 'completed';

/** متأخرة: غير مكتملة وتاريخ استحقاقها قبل اليوم */
export function isOverdue(t: T, now: Date = new Date()): boolean {
  return isOpen(t) && !!t.dueDate && diffDays(todayStr(now), t.dueDate) < 0;
}

/** قريبة الاستحقاق: غير مكتملة وتستحق خلال N يومًا (بما فيها اليوم) */
export function isDueSoon(t: T, days: number, now: Date = new Date()): boolean {
  if (!isOpen(t) || !t.dueDate) return false;
  const d = diffDays(todayStr(now), t.dueDate);
  return d >= 0 && d <= days;
}

/** مستحقة هذا الأسبوع: خلال 7 أيام من اليوم */
export function isDueThisWeek(t: T, now: Date = new Date()): boolean {
  return isDueSoon(t, 6, now);
}

export function isHighPriority(t: T): boolean {
  return isOpen(t) && (t.priority === 'high' || t.priority === 'urgent');
}

/** راكدة: مفتوحة ولم يُسجَّل عليها نشاط منذ N يومًا */
export function isStale(t: T, staleDays: number, now: Date = new Date()): boolean {
  if (!isOpen(t)) return false;
  return diffDays(timestampToDateOnly(t.lastActivityAt), todayStr(now)) >= staleDays;
}

/** عاجلة (لأغراض لوحة المؤشرات والتنبيهات): عالية الأولوية أو متأخرة */
export function isUrgent(t: T, now: Date = new Date()): boolean {
  return isOpen(t) && (t.priority === 'urgent' || isOverdue(t, now));
}

export type UrgencyReason = 'overdue' | 'high_priority' | 'due_soon' | 'stale';

export function urgencyReasons(t: T, opts: UrgencyOptions): UrgencyReason[] {
  const now = opts.now ?? new Date();
  const r: UrgencyReason[] = [];
  if (isOverdue(t, now)) r.push('overdue');
  if (isHighPriority(t)) r.push('high_priority');
  if (isDueSoon(t, opts.dueSoonDays, now)) r.push('due_soon');
  if (isStale(t, opts.staleDays, now)) r.push('stale');
  return r;
}

/** درجة إلحاح للترتيب: الأعلى أولًا */
export function urgencyScore(t: T, opts: UrgencyOptions): number {
  const now = opts.now ?? new Date();
  let score = 0;
  if (isOverdue(t, now)) score += 100 + Math.min(60, -diffDays(todayStr(now), t.dueDate!));
  if (t.priority === 'urgent') score += 50;
  if (t.priority === 'high') score += 30;
  if (isDueSoon(t, opts.dueSoonDays, now)) score += 20 + (opts.dueSoonDays - diffDays(todayStr(now), t.dueDate!));
  if (isStale(t, opts.staleDays, now)) score += 10;
  return score;
}

export const URGENCY_REASON_LABEL: Record<UrgencyReason, string> = {
  overdue: 'متأخرة',
  high_priority: 'أولوية عالية',
  due_soon: 'قريبة الاستحقاق',
  stale: 'غير محدثة',
};
