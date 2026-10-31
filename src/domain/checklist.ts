import type { ChecklistAutoRule, ChecklistItem, Deliverable, TaskStep } from '@/types/entities';

export interface ChecklistContext {
  steps: readonly Pick<TaskStep, 'status' | 'progress'>[];
  deliverables: readonly Pick<Deliverable, 'isFinal' | 'deletedAt' | 'currentVersionId'>[];
}

export interface EvaluatedChecklistItem {
  item: ChecklistItem;
  satisfied: boolean;
  /** سبب عدم الاستيفاء (للعناصر الآلية) */
  hint: string | null;
}

export const DEFAULT_CHECKLIST: { label: string; autoRule: ChecklistAutoRule | null; required: boolean }[] = [
  { label: 'اكتمال جميع الخطوات المطلوبة', autoRule: 'all_steps_done', required: true },
  { label: 'رفع المخرج النهائي', autoRule: 'final_deliverable', required: true },
  { label: 'مراجعة المحتوى', autoRule: null, required: true },
  { label: 'استكمال متطلبات التسليم', autoRule: null, required: true },
];

export function evaluateAutoRule(rule: ChecklistAutoRule, ctx: ChecklistContext): { satisfied: boolean; hint: string | null } {
  switch (rule) {
    case 'all_steps_done': {
      if (ctx.steps.length === 0) return { satisfied: true, hint: 'لا توجد خطوات تنفيذية' };
      const remaining = ctx.steps.filter((s) => s.status !== 'done').length;
      return remaining === 0
        ? { satisfied: true, hint: null }
        : { satisfied: false, hint: `متبقٍ ${remaining} خطوة غير منجزة` };
    }
    case 'final_deliverable': {
      const ok = ctx.deliverables.some((d) => d.isFinal && !d.deletedAt && d.currentVersionId);
      return ok ? { satisfied: true, hint: null } : { satisfied: false, hint: 'لم يُحدَّد مخرج نهائي بعد' };
    }
  }
}

export function evaluateChecklist(items: readonly ChecklistItem[], ctx: ChecklistContext): EvaluatedChecklistItem[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      if (item.autoRule) {
        const r = evaluateAutoRule(item.autoRule, ctx);
        return { item, satisfied: r.satisfied, hint: r.hint };
      }
      return { item, satisfied: item.done, hint: null };
    });
}

export function unmetRequired(evaluated: readonly EvaluatedChecklistItem[]): EvaluatedChecklistItem[] {
  return evaluated.filter((e) => e.item.required && !e.satisfied);
}
