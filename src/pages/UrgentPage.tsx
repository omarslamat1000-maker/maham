import { useMemo, useState } from 'react';
import { Flame, PartyPopper } from 'lucide-react';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Select } from '@/components/ui/form';
import { TaskRow } from '@/components/tasks/TaskRow';
import { UrgencyBadge } from '@/components/tasks/badges';
import { useLookups, useSettings, useTasks } from '@/hooks/data';
import { URGENCY_REASON_LABEL, urgencyReasons, urgencyScore, type UrgencyReason } from '@/domain/urgency';

export default function UrgentPage() {
  const tasks = useTasks();
  const settings = useSettings();
  const { users, activeCategories } = useLookups();
  const [days, setDays] = useState<number | null>(null);
  const [assignee, setAssignee] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reason, setReason] = useState<UrgencyReason | ''>('');

  const items = useMemo(() => {
    if (!tasks || !settings) return [];
    const opts = { dueSoonDays: days ?? settings.dueSoonDays, staleDays: settings.staleDays };
    return tasks
      .filter((t) => (!assignee || t.assigneeId === assignee) && (!categoryId || t.categoryId === categoryId))
      .map((t) => ({ t, reasons: urgencyReasons(t, opts), score: urgencyScore(t, opts) }))
      .filter((x) => x.reasons.length > 0 && (!reason || x.reasons.includes(reason)))
      .sort((a, b) => b.score - a.score);
  }, [tasks, settings, days, assignee, categoryId, reason]);

  const counts = useMemo(() => {
    const c: Record<UrgencyReason, number> = { overdue: 0, high_priority: 0, due_soon: 0, stale: 0 };
    items.forEach((x) => x.reasons.forEach((r) => c[r]++));
    return c;
  }, [items]);

  if (!tasks || !settings) return <LoadingBlock rows={4} />;

  return (
    <div>
      <PageHeader
        title="المهام العاجلة"
        description={`عالية الأولوية، المتأخرة، القريبة من الاستحقاق، وغير المحدثة منذ ${settings.staleDays} أيام أو أكثر.`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(counts) as UrgencyReason[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(reason === r ? '' : r)}
            aria-pressed={reason === r}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${reason === r ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card hover:bg-muted'}`}
          >
            {URGENCY_REASON_LABEL[r]} <span className="tabular font-semibold">{counts[r]}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3">
        <Select aria-label="مدة الاستحقاق القريب" value={days ?? ''} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}>
          <option value="">الاستحقاق خلال {settings.dueSoonDays} أيام (افتراضي)</option>
          {[1, 3, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              الاستحقاق خلال {d} {d === 1 ? 'يوم' : 'أيام'}
            </option>
          ))}
        </Select>
        <Select aria-label="المسؤول" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">كل المسؤولين</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select aria-label="التصنيف" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">كل التصنيفات</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={tasks.length ? PartyPopper : Flame}
          title={tasks.length ? 'لا توجد مهام عاجلة' : 'لا توجد مهام بعد'}
          description={tasks.length ? 'كل شيء تحت السيطرة وفق الفلاتر الحالية.' : undefined}
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map(({ t, reasons }) => (
            <li key={t.id}>
              <TaskRow task={t} extra={reasons.map((r) => <UrgencyBadge key={r} reason={r} />)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
