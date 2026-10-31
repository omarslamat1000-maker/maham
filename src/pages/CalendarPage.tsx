import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingBlock, PageHeader } from '@/components/ui/misc';
import { useSettings, useTasks } from '@/hooks/data';
import { useUIStore } from '@/stores/uiStore';
import { isOverdue, isUrgent } from '@/domain/urgency';
import type { Task } from '@/types/entities';
import { addDaysStr, formatMonth, parseDateOnly, toDateOnly, todayStr } from '@/utils/date';
import { cn } from '@/utils/cn';

type View = 'month' | 'week';
type Kind = 'start' | 'due';
interface CalEvent {
  task: Task;
  kind: Kind;
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function eventTone(t: Task): string {
  if (t.status === 'completed') return 'bg-success-soft text-success border-success/30';
  if (isOverdue(t)) return 'bg-danger-soft text-danger border-danger/30';
  if (isUrgent(t) || t.priority === 'high') return 'bg-warning-soft text-warning border-warning/30';
  return 'bg-primary-soft text-primary border-primary/20';
}

function startOfWeek(d: string, weekStartsOn: number): string {
  const day = parseDateOnly(d).getDay();
  return addDaysStr(d, -((day - weekStartsOn + 7) % 7));
}

export default function CalendarPage() {
  const tasks = useTasks();
  const settings = useSettings();
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(todayStr());
  const [selected, setSelected] = useState<string>(todayStr());
  const weekStart = settings?.weekStartsOn ?? 0;

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    const push = (d: string, e: CalEvent) => m.set(d, [...(m.get(d) ?? []), e]);
    for (const t of tasks ?? []) {
      if (t.dueDate) push(t.dueDate, { task: t, kind: 'due' });
      if (t.startDate && t.startDate !== t.dueDate) push(t.startDate, { task: t, kind: 'start' });
    }
    return m;
  }, [tasks]);

  const days = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(cursor, weekStart);
      return Array.from({ length: 7 }, (_, i) => addDaysStr(s, i));
    }
    const first = `${cursor.slice(0, 7)}-01`;
    const gridStart = startOfWeek(first, weekStart);
    return Array.from({ length: 42 }, (_, i) => addDaysStr(gridStart, i));
  }, [view, cursor, weekStart]);

  if (!tasks || !settings) return <LoadingBlock rows={6} />;

  const today = todayStr();
  const monthKey = cursor.slice(0, 7);
  const move = (dir: -1 | 1) => {
    if (view === 'week') setCursor(addDaysStr(cursor, dir * 7));
    else {
      const d = parseDateOnly(`${monthKey}-01`);
      d.setMonth(d.getMonth() + dir);
      setCursor(toDateOnly(d));
    }
  };
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStart + i) % 7]);
  const selectedEvents = byDay.get(selected) ?? [];

  return (
    <div>
      <PageHeader title="التقويم" description="تواريخ البداية والاستحقاق — اضغط على المهمة لفتح تفاصيلها." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="السابق">
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="التالي">
            <ChevronLeft />
          </Button>
        </div>
        <h2 className="min-w-40 text-lg font-semibold" aria-live="polite">
          {view === 'month' ? formatMonth(monthKey) : `أسبوع ${days[0]} ← ${days[6]}`}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => (setCursor(today), setSelected(today))}>
          اليوم
        </Button>
        <div className="ms-auto flex rounded-lg border border-border bg-card p-1" role="tablist" aria-label="طريقة العرض">
          {(['month', 'week'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn('rounded-md px-3 py-1 text-sm', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {v === 'month' ? 'شهري' : 'أسبوعي'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />مفتوحة</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning" />عاجلة/عالية</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" />متأخرة</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />مكتملة</span>
        <span>▶ بداية · ● استحقاق</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {weekdayOrder.map((d) => (
            <div key={d} className="py-2">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.replace('ال', '').slice(0, 2)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const events = byDay.get(d) ?? [];
            const outside = view === 'month' && d.slice(0, 7) !== monthKey;
            const max = view === 'week' ? 12 : 3;
            return (
              <div
                key={d}
                className={cn(
                  'flex flex-col gap-1 border-b border-e border-border p-1 sm:p-1.5',
                  view === 'week' ? 'min-h-64' : 'min-h-16 sm:min-h-28',
                  outside && 'bg-muted/30',
                  selected === d && 'ring-2 ring-inset ring-primary/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-label={`${d}${events.length ? ` — ${events.length} أحداث` : ''}`}
                  className={cn(
                    'tabular flex size-7 items-center justify-center self-start rounded-full text-xs',
                    d === today ? 'bg-primary font-bold text-primary-foreground' : outside ? 'text-muted-foreground/60' : 'hover:bg-muted',
                  )}
                >
                  {Number(d.slice(8))}
                </button>
                {/* الجوال في العرض الشهري: نقاط فقط */}
                <div className={cn('flex flex-wrap gap-0.5', view === 'month' ? 'sm:hidden' : 'hidden')}>
                  {events.slice(0, 4).map((e, i) => (
                    <span key={i} className={cn('size-1.5 rounded-full border', eventTone(e.task))} aria-hidden />
                  ))}
                </div>
                <div className={cn('flex-col gap-1', view === 'month' ? 'hidden sm:flex' : 'flex')}>
                  {events.slice(0, max).map((e) => (
                    <Link
                      key={`${e.task.id}-${e.kind}`}
                      to={`/tasks/${e.task.id}`}
                      title={e.task.title}
                      className={cn('truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight hover:opacity-80', eventTone(e.task))}
                    >
                      {e.kind === 'start' ? '▶ ' : '● '}
                      {e.task.title}
                    </Link>
                  ))}
                  {events.length > max && (
                    <button type="button" onClick={() => setSelected(d)} className="text-start text-[11px] text-muted-foreground hover:text-primary">
                      +{events.length - max} أخرى
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="mt-5 rounded-xl border border-border bg-card p-4" aria-label="مهام اليوم المحدد">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{parseDateOnly(selected).toLocaleDateString('ar', { calendar: 'gregory', numberingSystem: 'latn', weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <Button size="sm" variant="soft" onClick={() => openQuickAdd({ dueDate: selected })}>
            <Plus aria-hidden />
            مهمة في هذا اليوم
          </Button>
        </div>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مهام تبدأ أو تستحق في هذا اليوم.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li key={`${e.task.id}-${e.kind}`}>
                <Link to={`/tasks/${e.task.id}`} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:opacity-90', eventTone(e.task))}>
                  <span className="text-xs">{e.kind === 'start' ? 'بداية' : 'استحقاق'}</span>
                  <span className="font-medium">{e.task.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
