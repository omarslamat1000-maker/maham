import type { Priority, SubmissionStatus, Task, TaskStatus } from '@/types/entities';
import { PRIORITY_RANK } from '@/utils/labels';
import { effectiveProgress } from './progress';
import { isDueThisWeek, isOverdue, isUrgent } from './urgency';

/** فلاتر قائمة المهام — تُحفظ في عنوان الصفحة (URL) لتعمل روابط بطاقات المؤشرات */
export interface TaskQuery {
  q?: string;
  status?: TaskStatus | 'open' | null;
  priority?: Priority | null;
  assigneeId?: string | null;
  categoryId?: string | null;
  submission?: SubmissionStatus | null;
  /** فلاتر خاصة بالمؤشرات */
  flag?: 'overdue' | 'urgent' | 'week' | 'completed_month' | null;
  sort?: TaskSort;
}

export type TaskSort = 'due' | 'priority' | 'updated' | 'progress' | 'created' | 'title';

/** تطبيع النص العربي للبحث: إزالة التشكيل وتوحيد الهمزات والتاء المربوطة والياء */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

export function matchesSearch(t: Pick<Task, 'title' | 'description' | 'project' | 'entity'>, q: string): boolean {
  const terms = normalizeArabic(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = normalizeArabic(`${t.title} ${t.description} ${t.project} ${t.entity}`);
  return terms.every((term) => hay.includes(term));
}

export function applyTaskQuery(tasks: readonly Task[], query: TaskQuery, now = new Date()): Task[] {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const out = tasks.filter((t) => {
    if (t.deletedAt) return false;
    if (query.status === 'open' && t.status === 'completed') return false;
    if (query.status && query.status !== 'open' && t.status !== query.status) return false;
    if (query.priority && t.priority !== query.priority) return false;
    if (query.assigneeId === 'none' ? t.assigneeId !== null : query.assigneeId && t.assigneeId !== query.assigneeId) return false;
    if (query.categoryId && t.categoryId !== query.categoryId) return false;
    if (query.submission && t.submissionStatus !== query.submission) return false;
    switch (query.flag) {
      case 'overdue':
        if (!isOverdue(t, now)) return false;
        break;
      case 'urgent':
        if (!isUrgent(t, now)) return false;
        break;
      case 'week':
        if (!isDueThisWeek(t, now)) return false;
        break;
      case 'completed_month':
        if (!t.completedAt || t.completedAt.slice(0, 7) !== thisMonth) return false;
        break;
    }
    if (query.q && !matchesSearch(t, query.q)) return false;
    return true;
  });
  return sortTasks(out, query.sort ?? 'due');
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  const cmp: Record<TaskSort, (a: Task, b: Task) => number> = {
    due: (a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || byDue(a, b),
    priority: (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || byDue(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    progress: (a, b) => effectiveProgress(b) - effectiveProgress(a),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    title: (a, b) => a.title.localeCompare(b.title, 'ar'),
  };
  return [...tasks].sort(cmp[sort]);
}
