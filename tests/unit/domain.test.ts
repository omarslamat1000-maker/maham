import { describe, expect, it } from 'vitest';
import { computeWeightedProgress, effectiveProgress, normalizedWeights, stepStatusFromProgress } from '@/domain/progress';
import { applyApprovalTransition, availableApprovalActions, canSetStatusManually, LifecycleError } from '@/domain/lifecycle';
import { evaluateChecklist, unmetRequired } from '@/domain/checklist';
import { isDueSoon, isOverdue, isStale, urgencyReasons } from '@/domain/urgency';
import { buildReport, dashboardKpis, delayDays, durationDays } from '@/domain/metrics';
import { applyTaskQuery, matchesSearch, normalizeArabic } from '@/domain/taskQuery';
import type { ChecklistItem, Task } from '@/types/entities';

const NOW = new Date(2026, 9, 15, 12, 0, 0); // 15 أكتوبر 2026

function task(over: Partial<Task> = {}): Task {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    title: 'مهمة',
    description: '',
    categoryId: null,
    project: '',
    entity: '',
    assigneeId: null,
    priority: 'medium',
    startDate: null,
    dueDate: null,
    status: 'new',
    submissionStatus: 'not_submitted',
    computedProgress: null,
    manualProgress: null,
    manualProgressReason: null,
    manualProgressBy: null,
    manualProgressAt: null,
    startedAt: null,
    completedAt: null,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    approvedBy: null,
    reviewNotes: null,
    lastActivityAt: '2026-10-14T10:00:00.000Z',
    sourceIdeaId: null,
    deletedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'u1',
    updatedBy: 'u1',
    ...over,
  };
}

describe('حساب الإنجاز المرجّح', () => {
  it('يطبق المعادلة SUM(w×p)/SUM(w)', () => {
    expect(computeWeightedProgress([{ weight: 3, progress: 100 }, { weight: 1, progress: 0 }])).toBe(75);
    expect(computeWeightedProgress([{ weight: 2, progress: 50 }, { weight: 2, progress: 100 }])).toBe(75);
  });

  it('يعيد null عند عدم وجود خطوات', () => {
    expect(computeWeightedProgress([])).toBeNull();
  });

  it('يطبع الأوزان عندما يكون مجموعها صفرًا (أوزان متساوية)', () => {
    expect(computeWeightedProgress([{ weight: 0, progress: 100 }, { weight: 0, progress: 0 }])).toBe(50);
  });

  it('يعامل الأوزان السالبة كصفر ويقيّد النسب ضمن 0–100', () => {
    expect(computeWeightedProgress([{ weight: -5, progress: 100 }, { weight: 1, progress: 40 }])).toBe(40);
    expect(computeWeightedProgress([{ weight: 1, progress: 250 }])).toBe(100);
    expect(computeWeightedProgress([{ weight: 1, progress: -20 }])).toBe(0);
    expect(computeWeightedProgress([{ weight: Number.NaN, progress: 50 }])).toBe(50);
  });

  it('يحسب الأوزان المطبّعة للعرض', () => {
    expect(normalizedWeights([{ weight: 1, progress: 0 }, { weight: 3, progress: 0 }])).toEqual([25, 75]);
  });

  it('التعديل اليدوي له الأولوية دون أن يمس القيمة المحسوبة', () => {
    expect(effectiveProgress({ manualProgress: 30, computedProgress: 80, status: 'in_progress' })).toBe(30);
    expect(effectiveProgress({ manualProgress: null, computedProgress: 80, status: 'in_progress' })).toBe(80);
    expect(effectiveProgress({ manualProgress: null, computedProgress: null, status: 'completed' })).toBe(100);
    expect(effectiveProgress({ manualProgress: null, computedProgress: null, status: 'new' })).toBe(0);
  });

  it('يزامن حالة الخطوة مع نسبتها', () => {
    expect(stepStatusFromProgress(0)).toBe('pending');
    expect(stepStatusFromProgress(55)).toBe('in_progress');
    expect(stepStatusFromProgress(100)).toBe('done');
  });
});

describe('دورة حياة المهمة', () => {
  it('لا يسمح بالإكمال اليدوي', () => {
    expect(canSetStatusManually('in_progress', 'completed')).toBe(false);
    expect(canSetStatusManually('new', 'in_progress')).toBe(true);
    expect(canSetStatusManually('completed', 'in_progress')).toBe(false);
  });

  it('مسار التقديم ثم الاعتماد', () => {
    const s0 = { status: 'in_progress' as const, submissionStatus: 'not_submitted' as const };
    expect(availableApprovalActions(s0)).toEqual(['submitted']);
    const s1 = applyApprovalTransition(s0, { action: 'submitted', reason: '', unmetChecklist: 0 });
    expect(s1).toEqual({ status: 'in_progress', submissionStatus: 'submitted' });
    const s2 = applyApprovalTransition(s1, { action: 'approved', reason: '', unmetChecklist: 0 });
    expect(s2).toEqual({ status: 'completed', submissionStatus: 'approved' });
    expect(availableApprovalActions(s2)).toEqual(['reopened']);
  });

  it('طلب التعديلات يتطلب سببًا ويبقي المهمة قيد التنفيذ', () => {
    const s = { status: 'in_progress' as const, submissionStatus: 'submitted' as const };
    expect(() => applyApprovalTransition(s, { action: 'changes_requested', reason: '  ', unmetChecklist: 0 })).toThrow(LifecycleError);
    expect(applyApprovalTransition(s, { action: 'changes_requested', reason: 'ناقص', unmetChecklist: 0 })).toEqual({
      status: 'in_progress',
      submissionStatus: 'changes_requested',
    });
  });

  it('يمنع الاعتماد عند وجود متطلبات غير مستوفاة', () => {
    const s = { status: 'in_progress' as const, submissionStatus: 'submitted' as const };
    expect(() => applyApprovalTransition(s, { action: 'approved', reason: '', unmetChecklist: 2 })).toThrow(/غير مستوفاة/);
  });

  it('يرفض الإجراءات غير المتاحة', () => {
    const s = { status: 'new' as const, submissionStatus: 'not_submitted' as const };
    expect(() => applyApprovalTransition(s, { action: 'approved', reason: '', unmetChecklist: 0 })).toThrow(LifecycleError);
  });
});

describe('قائمة التحقق', () => {
  const base = { createdAt: '', updatedAt: '', createdBy: '', updatedBy: '', taskId: 't', doneBy: null, doneAt: null };
  const items: ChecklistItem[] = [
    { ...base, id: 'a', label: 'خطوات', required: true, done: false, autoRule: 'all_steps_done', order: 0 },
    { ...base, id: 'b', label: 'مخرج', required: true, done: false, autoRule: 'final_deliverable', order: 1 },
    { ...base, id: 'c', label: 'مراجعة', required: true, done: true, autoRule: null, order: 2 },
    { ...base, id: 'd', label: 'اختياري', required: false, done: false, autoRule: null, order: 3 },
  ];
  it('يقيّم القواعد الآلية من البيانات', () => {
    const ev = evaluateChecklist(items, {
      steps: [{ status: 'done', progress: 100 }, { status: 'in_progress', progress: 50 }],
      deliverables: [],
    });
    expect(unmetRequired(ev).map((e) => e.item.id)).toEqual(['a', 'b']);
    const ev2 = evaluateChecklist(items, {
      steps: [{ status: 'done', progress: 100 }],
      deliverables: [{ isFinal: true, deletedAt: null, currentVersionId: 'v1' }],
    });
    expect(unmetRequired(ev2)).toHaveLength(0);
  });
});

describe('الإلحاح والاستحقاق', () => {
  it('يكتشف المتأخرة والقريبة والراكدة', () => {
    expect(isOverdue(task({ dueDate: '2026-10-14' }), NOW)).toBe(true);
    expect(isOverdue(task({ dueDate: '2026-10-15' }), NOW)).toBe(false);
    expect(isOverdue(task({ dueDate: '2026-10-01', status: 'completed' }), NOW)).toBe(false);
    expect(isDueSoon(task({ dueDate: '2026-10-17' }), 3, NOW)).toBe(true);
    expect(isDueSoon(task({ dueDate: '2026-10-19' }), 3, NOW)).toBe(false);
    expect(isStale(task({ lastActivityAt: '2026-10-01T10:00:00.000Z' }), 7, NOW)).toBe(true);
    expect(urgencyReasons(task({ dueDate: '2026-10-10', priority: 'urgent' }), { now: NOW, dueSoonDays: 3, staleDays: 7 })).toEqual([
      'overdue',
      'high_priority',
    ]);
  });
});

describe('المؤشرات والتقارير', () => {
  const tasks = [
    task({ id: '1', status: 'completed', startDate: '2026-10-01', dueDate: '2026-10-10', completedAt: '2026-10-08T09:00:00.000Z', categoryId: 'c1', assigneeId: 'u1' }),
    task({ id: '2', status: 'completed', startDate: '2026-10-01', dueDate: '2026-10-05', completedAt: '2026-10-09T09:00:00.000Z', categoryId: 'c1', assigneeId: 'u2' }),
    task({ id: '3', status: 'in_progress', dueDate: '2026-10-12', computedProgress: 40, assigneeId: 'u1' }),
    task({ id: '4', status: 'new', dueDate: '2026-10-18', priority: 'urgent' }),
    task({ id: '5', status: 'new', deletedAt: '2026-10-02T00:00:00.000Z' }),
    task({ id: '6', status: 'completed', completedAt: '2026-09-20T09:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z', dueDate: '2026-09-25' }),
  ];

  it('يحسب مؤشرات اللوحة من السجلات الفعلية ويستبعد المحذوف', () => {
    const k = dashboardKpis(tasks, NOW);
    expect(k.total).toBe(5);
    expect(k.completed).toBe(3);
    expect(k.overdue).toBe(1);
    expect(k.urgent).toBe(2); // متأخرة + عاجلة
    expect(k.dueThisWeek).toBe(1);
    expect(k.completedThisMonth).toBe(2);
    expect(k.avgProgress).toBe(20); // (40 + 0) / 2
  });

  it('يحسب المدة والتأخير', () => {
    expect(durationDays(tasks[0])).toBe(7);
    expect(delayDays(tasks[0], NOW)).toBe(-2);
    expect(delayDays(tasks[1], NOW)).toBe(4);
  });

  it('يبني تقرير الشهر مع المخطط مقابل الفعلي', () => {
    const r = buildReport(tasks, { from: '2026-10-01', to: '2026-10-31' }, { categories: [], users: [] }, NOW, 2);
    expect(r.completedInPeriod).toBe(2);
    expect(r.onTimeCount).toBe(1);
    expect(r.lateCount).toBe(1);
    expect(r.onTimeRate).toBe(50);
    expect(r.overdue).toBe(1);
    expect(r.avgDurationDays).toBe(7.5);
    const oct = r.months.find((m) => m.month === '2026-10')!;
    expect(oct.completed).toBe(2);
    expect(oct.planned).toBe(4);
    expect(r.byCategory.find((c) => c.categoryId === 'c1')?.count).toBe(2);
    expect(r.delayed[0].task.id).toBe('2');
  });

  it('يطبق فلاتر المسؤول والحالة', () => {
    const r = buildReport(tasks, { assigneeId: 'u1', status: 'in_progress' }, { categories: [], users: [] }, NOW);
    expect(r.filtered.map((t) => t.id)).toEqual(['3']);
  });
});

describe('البحث والتصفية', () => {
  it('يطبع النص العربي (الهمزات والتاء المربوطة والتشكيل)', () => {
    expect(normalizeArabic('إدارةُ المشروع')).toBe('اداره المشروع');
    expect(matchesSearch({ title: 'إعداد الخطة السنوية', description: '', project: '', entity: '' }, 'اعداد الخطه')).toBe(true);
    expect(matchesSearch({ title: 'تقرير', description: '', project: 'مشروع ألف', entity: '' }, 'الف')).toBe(true);
    expect(matchesSearch({ title: 'تقرير', description: '', project: '', entity: '' }, 'خطة')).toBe(false);
  });

  it('يرشح حسب الحالة والأولوية والمؤشر', () => {
    const list = [
      task({ id: 'a', status: 'new', priority: 'high', dueDate: '2026-10-10' }),
      task({ id: 'b', status: 'in_progress', priority: 'low' }),
      task({ id: 'c', status: 'completed', completedAt: '2026-10-02T00:00:00.000Z' }),
    ];
    expect(applyTaskQuery(list, { status: 'open' }, NOW).map((t) => t.id)).toEqual(['a', 'b']);
    expect(applyTaskQuery(list, { priority: 'high' }, NOW).map((t) => t.id)).toEqual(['a']);
    expect(applyTaskQuery(list, { flag: 'overdue' }, NOW).map((t) => t.id)).toEqual(['a']);
    expect(applyTaskQuery(list, { flag: 'completed_month' }, NOW).map((t) => t.id)).toEqual(['c']);
  });
});
