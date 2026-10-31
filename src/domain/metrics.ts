import type { Category, DateOnly, Priority, Task, TaskStatus, User } from '@/types/entities';
import { diffDays, lastMonthKeys, monthKey, monthRange, timestampToDateOnly, todayStr } from '@/utils/date';
import { effectiveProgress } from './progress';
import { isDueThisWeek, isOverdue, isUrgent } from './urgency';

/**
 * تعريفات المؤشرات (مرجع موحد للوحة والتقارير):
 *
 * - تاريخ الإنجاز = completedAt (يُسجَّل لحظة اعتماد التسليم).
 * - تاريخ البدء الفعلي للمدة = startDate إن وُجد، وإلا تاريخ الإنشاء.
 * - مدة المهمة = أيام تقويمية بين البدء الفعلي وتاريخ الإنجاز (حد أدنى 0).
 * - في الموعد = تاريخ الإنجاز ≤ تاريخ الاستحقاق. متأخرة الإنجاز = بعده.
 * - متأخرة حاليًا = غير مكتملة وتاريخ استحقاقها قبل اليوم.
 * - نشطة خلال فترة = نافذتها [البدء الفعلي، الإنجاز أو اليوم] تتقاطع مع الفترة.
 * - معدل الإنجاز لفترة = المكتملة خلالها ÷ النشطة خلالها.
 * - المخطط لشهر = المهام التي يقع استحقاقها في ذلك الشهر.
 * - الفعلي لشهر = المهام المكتملة في ذلك الشهر.
 */

export interface ReportFilters {
  from?: DateOnly | null;
  to?: DateOnly | null;
  categoryId?: string | null;
  project?: string | null;
  entity?: string | null;
  assigneeId?: string | null;
  priority?: Priority | null;
  status?: TaskStatus | null;
}

export const completedDate = (t: Pick<Task, 'completedAt'>): DateOnly | null =>
  t.completedAt ? timestampToDateOnly(t.completedAt) : null;

export const actualStartDate = (t: Pick<Task, 'startDate' | 'createdAt'>): DateOnly =>
  t.startDate ?? timestampToDateOnly(t.createdAt);

export function durationDays(t: Pick<Task, 'startDate' | 'createdAt' | 'completedAt'>): number | null {
  const end = completedDate(t);
  if (!end) return null;
  return Math.max(0, diffDays(actualStartDate(t), end));
}

/** موجب = تأخير بالأيام، سالب = إنجاز مبكر، null = لا يمكن الحساب */
export function delayDays(t: Pick<Task, 'dueDate' | 'completedAt' | 'status'>, now: Date = new Date()): number | null {
  if (!t.dueDate) return null;
  const end = completedDate(t) ?? todayStr(now);
  return diffDays(t.dueDate, end);
}

export function inRange(d: DateOnly | null, from?: DateOnly | null, to?: DateOnly | null): boolean {
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function activeInPeriod(t: Task, from: DateOnly | null | undefined, to: DateOnly | null | undefined, now = new Date()): boolean {
  const start = actualStartDate(t);
  const end = completedDate(t) ?? todayStr(now);
  if (to && start > to) return false;
  if (from && end < from) return false;
  return true;
}

/** تطبيق الفلاتر الوصفية والزمنية (المهام المحذوفة مستبعدة دائمًا) */
export function filterTasks(tasks: readonly Task[], f: ReportFilters, now = new Date()): Task[] {
  return tasks.filter((t) => {
    if (t.deletedAt) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.project && t.project.trim() !== f.project) return false;
    if (f.entity && t.entity.trim() !== f.entity) return false;
    if (f.assigneeId && t.assigneeId !== f.assigneeId) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if ((f.from || f.to) && !activeInPeriod(t, f.from, f.to, now)) return false;
    return true;
  });
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

// ───────────── مؤشرات اللوحة التنفيذية ─────────────

export interface DashboardKpis {
  total: number;
  newCount: number;
  inProgress: number;
  completed: number;
  urgent: number;
  overdue: number;
  dueThisWeek: number;
  /** متوسط الإنجاز للمهام المفتوحة — null عند عدم وجود مهام مفتوحة */
  avgProgress: number | null;
  completedThisMonth: number;
  pendingApprovals: number;
}

export function dashboardKpis(tasks: readonly Task[], now = new Date()): DashboardKpis {
  const live = tasks.filter((t) => !t.deletedAt);
  const open = live.filter((t) => t.status !== 'completed');
  const thisMonth = monthKey(todayStr(now));
  const ap = avg(open.map((t) => effectiveProgress(t)));
  return {
    total: live.length,
    newCount: live.filter((t) => t.status === 'new').length,
    inProgress: live.filter((t) => t.status === 'in_progress').length,
    completed: live.filter((t) => t.status === 'completed').length,
    urgent: live.filter((t) => isUrgent(t, now)).length,
    overdue: live.filter((t) => isOverdue(t, now)).length,
    dueThisWeek: live.filter((t) => isDueThisWeek(t, now)).length,
    avgProgress: ap === null ? null : Math.round(ap),
    completedThisMonth: live.filter((t) => t.completedAt && monthKey(t.completedAt) === thisMonth).length,
    pendingApprovals: live.filter((t) => t.submissionStatus === 'submitted').length,
  };
}

// ───────────── التقارير ─────────────

export interface MonthPoint {
  month: string;
  created: number;
  completed: number;
  planned: number;
  onTime: number;
  /** معدل الإنجاز الشهري % (null إذا لم توجد مهام نشطة) */
  completionRate: number | null;
}

export interface CategoryPoint {
  categoryId: string | null;
  name: string;
  color: string;
  count: number;
  completed: number;
  avgProgress: number;
}

export interface UserPoint {
  userId: string | null;
  name: string;
  total: number;
  completed: number;
  overdue: number;
  /** نسبة الإنجاز في الموعد من المكتملة ذات الاستحقاق */
  onTimeRate: number | null;
  avgProgress: number;
}

export interface DelayedItem {
  task: Task;
  delay: number;
  kind: 'overdue_open' | 'completed_late';
}

export interface Report {
  filtered: Task[];
  total: number;
  completedInPeriod: number;
  completionRate: number | null;
  overdue: number;
  avgDurationDays: number | null;
  onTimeCount: number;
  lateCount: number;
  onTimeRate: number | null;
  avgDelayDays: number | null;
  pendingApprovals: Task[];
  byCategory: CategoryPoint[];
  byUser: UserPoint[];
  months: MonthPoint[];
  delayed: DelayedItem[];
}

export function buildReport(
  allTasks: readonly Task[],
  filters: ReportFilters,
  lookups: { categories: readonly Category[]; users: readonly User[] },
  now = new Date(),
  monthsBack = 6,
): Report {
  const filtered = filterTasks(allTasks, filters, now);
  const completedInPeriod = filtered.filter((t) => t.status === 'completed' && inRange(completedDate(t), filters.from, filters.to));
  const completionRate = filtered.length ? Math.round((completedInPeriod.length / filtered.length) * 100) : null;

  const durations = completedInPeriod.map((t) => durationDays(t)).filter((d): d is number => d !== null);

  const completedWithDue = completedInPeriod.filter((t) => t.dueDate);
  const onTime = completedWithDue.filter((t) => (delayDays(t, now) ?? 0) <= 0);
  const late = completedWithDue.filter((t) => (delayDays(t, now) ?? 0) > 0);

  const delayed: DelayedItem[] = [
    ...filtered.filter((t) => isOverdue(t, now)).map((t) => ({ task: t, delay: delayDays(t, now) ?? 0, kind: 'overdue_open' as const })),
    ...late.map((t) => ({ task: t, delay: delayDays(t, now) ?? 0, kind: 'completed_late' as const })),
  ].sort((a, b) => b.delay - a.delay);

  // حسب التصنيف
  const catMap = new Map<string | null, Task[]>();
  for (const t of filtered) {
    const k = t.categoryId;
    catMap.set(k, [...(catMap.get(k) ?? []), t]);
  }
  const byCategory: CategoryPoint[] = [...catMap.entries()]
    .map(([id, ts]) => {
      const c = lookups.categories.find((x) => x.id === id);
      return {
        categoryId: id,
        name: c?.name ?? 'بدون تصنيف',
        color: c?.color ?? '#9ca3af',
        count: ts.length,
        completed: ts.filter((t) => t.status === 'completed').length,
        avgProgress: Math.round(avg(ts.map((t) => effectiveProgress(t))) ?? 0),
      };
    })
    .sort((a, b) => b.count - a.count);

  // حسب المستخدم
  const userMap = new Map<string | null, Task[]>();
  for (const t of filtered) userMap.set(t.assigneeId, [...(userMap.get(t.assigneeId) ?? []), t]);
  const byUser: UserPoint[] = [...userMap.entries()].map(([id, ts]) => {
    const u = lookups.users.find((x) => x.id === id);
    const doneWithDue = ts.filter((t) => t.status === 'completed' && t.dueDate);
    const onT = doneWithDue.filter((t) => (delayDays(t, now) ?? 0) <= 0).length;
    return {
      userId: id,
      name: u?.name ?? 'غير مسندة',
      total: ts.length,
      completed: ts.filter((t) => t.status === 'completed').length,
      overdue: ts.filter((t) => isOverdue(t, now)).length,
      onTimeRate: doneWithDue.length ? Math.round((onT / doneWithDue.length) * 100) : null,
      avgProgress: Math.round(avg(ts.map((t) => effectiveProgress(t))) ?? 0),
    };
  });

  // السلسلة الشهرية: تُحسب على المهام المفلترة وصفيًا فقط (دون نافذة التاريخ) لتعكس الاتجاه
  const descriptive = filterTasks(allTasks, { ...filters, from: null, to: null }, now);
  const months = monthSeries(descriptive, monthsBack, now, filters.to ?? null);

  return {
    filtered,
    total: filtered.length,
    completedInPeriod: completedInPeriod.length,
    completionRate,
    overdue: filtered.filter((t) => isOverdue(t, now)).length,
    avgDurationDays: round1(avg(durations)),
    onTimeCount: onTime.length,
    lateCount: late.length,
    onTimeRate: completedWithDue.length ? Math.round((onTime.length / completedWithDue.length) * 100) : null,
    avgDelayDays: round1(avg(late.map((t) => delayDays(t, now) ?? 0))),
    pendingApprovals: filtered.filter((t) => t.submissionStatus === 'submitted'),
    byCategory,
    byUser,
    months,
    delayed,
  };
}

export function monthSeries(tasks: readonly Task[], count: number, now = new Date(), endAt: DateOnly | null = null): MonthPoint[] {
  const anchor = endAt ? new Date(Number(endAt.slice(0, 4)), Number(endAt.slice(5, 7)) - 1, 1) : now;
  return lastMonthKeys(count, anchor).map((m) => {
    const { start, end } = monthRange(m);
    const completed = tasks.filter((t) => t.completedAt && monthKey(t.completedAt) === m);
    const active = tasks.filter((t) => activeInPeriod(t, start, end, now));
    return {
      month: m,
      created: tasks.filter((t) => monthKey(t.createdAt) === m).length,
      completed: completed.length,
      planned: tasks.filter((t) => t.dueDate && monthKey(t.dueDate) === m).length,
      onTime: completed.filter((t) => t.dueDate && (delayDays(t, now) ?? 0) <= 0).length,
      completionRate: active.length ? Math.round((completed.length / active.length) * 100) : null,
    };
  });
}

/** القيم المميزة لحقول نصية حرة (المشروع/الجهة) لاستخدامها في الفلاتر */
export function distinctValues(tasks: readonly Task[], key: 'project' | 'entity'): string[] {
  return [...new Set(tasks.filter((t) => !t.deletedAt).map((t) => t[key].trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ar'),
  );
}
