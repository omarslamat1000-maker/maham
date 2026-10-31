import { buildReport, completedDate, delayDays, durationDays, type Report, type ReportFilters } from '@/domain/metrics';
import { effectiveProgress } from '@/domain/progress';
import type { Category, Task, User } from '@/types/entities';
import { formatDate, formatMonth, toDateOnly } from '@/utils/date';
import { toCsv, toXlsx, XLSX_MIME, type Sheet } from '@/utils/export';
import { downloadBlob, downloadText } from '@/utils/file';
import { PRIORITY_LABEL, STATUS_LABEL, SUBMISSION_LABEL } from '@/utils/labels';
import { categoryService } from './ideaService';
import { userService } from './settingsService';
import { taskService } from './taskService';

export interface ReportData {
  report: Report;
  categories: Category[];
  users: User[];
  allTasks: Task[];
}

export const reportService = {
  async load(filters: ReportFilters, monthsBack = 6): Promise<ReportData> {
    const [allTasks, categories, users] = await Promise.all([
      taskService.listActive(),
      categoryService.list(true),
      userService.list(),
    ]);
    return { report: buildReport(allTasks, filters, { categories, users }, new Date(), monthsBack), categories, users, allTasks };
  },
};

// ───────────── التصدير ─────────────

function taskSheet(tasks: Task[], categories: Category[], users: User[]): Sheet {
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';
  const usr = (id: string | null) => users.find((u) => u.id === id)?.name ?? '';
  return {
    name: 'المهام',
    columns: [
      'العنوان',
      'التصنيف',
      'المشروع',
      'الجهة',
      'المسؤول',
      'الأولوية',
      'الحالة',
      'التسليم',
      'نسبة الإنجاز %',
      'تاريخ البداية',
      'تاريخ النهاية',
      'تاريخ الإنجاز',
      'المدة (يوم)',
      'التأخير (يوم)',
    ],
    rows: tasks.map((t) => [
      t.title,
      cat(t.categoryId),
      t.project,
      t.entity,
      usr(t.assigneeId),
      PRIORITY_LABEL[t.priority],
      STATUS_LABEL[t.status],
      SUBMISSION_LABEL[t.submissionStatus],
      effectiveProgress(t),
      t.startDate ?? '',
      t.dueDate ?? '',
      completedDate(t) ?? '',
      durationDays(t),
      (() => {
        const d = delayDays(t);
        return d !== null && d > 0 ? d : null;
      })(),
    ]),
  };
}

function summarySheets(r: Report): Sheet[] {
  return [
    {
      name: 'الملخص',
      columns: ['المؤشر', 'القيمة'],
      rows: [
        ['إجمالي المهام ضمن الفلاتر', r.total],
        ['المكتملة خلال الفترة', r.completedInPeriod],
        ['معدل الإنجاز %', r.completionRate],
        ['المتأخرة حاليًا', r.overdue],
        ['متوسط مدة الإنجاز (يوم)', r.avgDurationDays],
        ['أُنجزت في الموعد', r.onTimeCount],
        ['أُنجزت متأخرة', r.lateCount],
        ['نسبة الإنجاز في الموعد %', r.onTimeRate],
        ['متوسط التأخير (يوم)', r.avgDelayDays],
        ['بانتظار الاعتماد', r.pendingApprovals.length],
      ],
    },
    {
      name: 'الاتجاه الشهري',
      columns: ['الشهر', 'أُنشئت', 'المخطط (مستحقة)', 'الفعلي (مكتملة)', 'في الموعد', 'معدل الإنجاز %'],
      rows: r.months.map((m) => [formatMonth(m.month), m.created, m.planned, m.completed, m.onTime, m.completionRate]),
    },
    {
      name: 'حسب التصنيف',
      columns: ['التصنيف', 'العدد', 'المكتملة', 'متوسط الإنجاز %'],
      rows: r.byCategory.map((c) => [c.name, c.count, c.completed, c.avgProgress]),
    },
    {
      name: 'حسب المستخدم',
      columns: ['المستخدم', 'الإجمالي', 'المكتملة', 'المتأخرة', 'في الموعد %', 'متوسط الإنجاز %'],
      rows: r.byUser.map((u) => [u.name, u.total, u.completed, u.overdue, u.onTimeRate, u.avgProgress]),
    },
  ];
}

export const exportService = {
  csv(data: ReportData): void {
    const sheet = taskSheet(data.report.filtered, data.categories, data.users);
    downloadText(toCsv(sheet), `maham-report-${toDateOnly(new Date())}.csv`, 'text/csv;charset=utf-8');
  },

  xlsx(data: ReportData): void {
    const bytes = toXlsx([...summarySheets(data.report), taskSheet(data.report.filtered, data.categories, data.users)]);
    downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }), `maham-report-${toDateOnly(new Date())}.xlsx`, false);
  },

  /** PDF عبر نافذة الطباعة في المتصفح ("حفظ بصيغة PDF") — يدعم العربية وRTL بالكامل */
  pdf(): void {
    window.print();
  },
};

export function periodLabel(f: ReportFilters): string {
  if (f.from && f.to) return `${formatDate(f.from)} — ${formatDate(f.to)}`;
  if (f.from) return `منذ ${formatDate(f.from)}`;
  if (f.to) return `حتى ${formatDate(f.to)}`;
  return 'كل الفترات';
}
