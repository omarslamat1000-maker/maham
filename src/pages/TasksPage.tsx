import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Filter, ListTodo, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/overlay';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useAction, useLookups, useTasks } from '@/hooks/data';
import { confirmDialog, useUIStore } from '@/stores/uiStore';
import { applyTaskQuery, type TaskQuery, type TaskSort } from '@/domain/taskQuery';
import { taskService } from '@/services/taskService';
import { PRIORITIES, SUBMISSION_STATUSES, type Task } from '@/types/entities';
import { PRIORITY_LABEL, STATUS_LABEL, SUBMISSION_LABEL } from '@/utils/labels';

const FLAG_LABEL: Record<NonNullable<TaskQuery['flag']>, string> = {
  overdue: 'المتأخرة',
  urgent: 'العاجلة',
  week: 'المستحقة هذا الأسبوع',
  completed_month: 'المنجزة هذا الشهر',
};

const SORT_LABEL: Record<TaskSort, string> = {
  due: 'تاريخ الاستحقاق',
  priority: 'الأولوية',
  updated: 'آخر تحديث',
  progress: 'نسبة الإنجاز',
  created: 'الأحدث إنشاءً',
  title: 'العنوان',
};

export default function TasksPage() {
  const tasks = useTasks();
  const { users, activeCategories } = useLookups();
  const [params, setParams] = useSearchParams();
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { run } = useAction();

  const query: TaskQuery = {
    q: params.get('q') ?? '',
    status: (params.get('status') as TaskQuery['status']) || null,
    priority: (params.get('priority') as TaskQuery['priority']) || null,
    assigneeId: params.get('assignee') || null,
    categoryId: params.get('category') || null,
    submission: (params.get('submission') as TaskQuery['submission']) || null,
    flag: (params.get('flag') as TaskQuery['flag']) || null,
    sort: (params.get('sort') as TaskSort) || 'due',
  };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => (tasks ? applyTaskQuery(tasks, query) : []), [tasks, params]);
  const activeFilters = ['q', 'status', 'priority', 'assignee', 'category', 'submission', 'flag'].filter((k) => params.get(k));

  const remove = async (t: Task) => {
    const ok = await confirmDialog({
      title: 'حذف المهمة؟',
      description: `ستُنقل «${t.title}» إلى المحذوفات ويمكن استرجاعها من الإعدادات.`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (ok) await run(() => taskService.softDelete(t.id), 'تم حذف المهمة');
  };

  return (
    <div>
      <PageHeader
        title="المهام"
        description={tasks ? `${results.length} من ${tasks.length} مهمة` : undefined}
        actions={
          <Button onClick={() => openQuickAdd()}>
            <Plus aria-hidden />
            مهمة جديدة
          </Button>
        }
      />

      <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="ابحث بالعنوان أو الوصف أو المشروع أو الجهة…"
            aria-label="بحث"
            className="ps-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select aria-label="الحالة" value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="open">المفتوحة</option>
            <option value="new">{STATUS_LABEL.new}</option>
            <option value="in_progress">{STATUS_LABEL.in_progress}</option>
            <option value="completed">{STATUS_LABEL.completed}</option>
          </Select>
          <Select aria-label="الأولوية" value={params.get('priority') ?? ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">كل الأولويات</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select aria-label="المسؤول" value={params.get('assignee') ?? ''} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">كل المسؤولين</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value="none">غير مسندة</option>
          </Select>
          <Select aria-label="التصنيف" value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">كل التصنيفات</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="حالة التسليم" value={params.get('submission') ?? ''} onChange={(e) => set('submission', e.target.value)}>
            <option value="">كل حالات التسليم</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBMISSION_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select aria-label="الترتيب" value={query.sort} onChange={(e) => set('sort', e.target.value === 'due' ? '' : e.target.value)}>
            {Object.entries(SORT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                ترتيب: {v}
              </option>
            ))}
          </Select>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="size-3.5 text-muted-foreground" aria-hidden />
            {query.flag && (
              <span className="rounded-full bg-primary-soft px-2 py-1 font-medium text-primary">{FLAG_LABEL[query.flag]}</span>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground hover:bg-muted"
              onClick={() => setParams(new URLSearchParams(query.sort !== 'due' ? { sort: query.sort! } : {}), { replace: true })}
            >
              <X className="size-3" aria-hidden />
              مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {!tasks ? (
        <LoadingBlock rows={5} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={tasks.length === 0 ? 'لا توجد مهام بعد' : 'لا توجد نتائج مطابقة'}
          description={tasks.length === 0 ? 'أنشئ أول مهمة للبدء.' : 'جرّب تعديل البحث أو الفلاتر.'}
          action={
            tasks.length === 0 ? (
              <Button onClick={() => openQuickAdd()}>
                <Plus aria-hidden />
                مهمة جديدة
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2.5" aria-label="قائمة المهام">
          {results.map((t) => (
            <li key={t.id}>
              <TaskRow
                task={t}
                actions={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`خيارات ${t.title}`}>
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem destructive onSelect={() => remove(t)}>
                        <Trash2 />
                        حذف المهمة
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
