import { Activity } from 'lucide-react';
import { EmptyState, LoadingBlock } from '@/components/ui/misc';
import { useActivity, useLookups } from '@/hooks/data';
import { formatDateTime } from '@/utils/date';

export function ActivityTab({ taskId }: { taskId: string }) {
  const log = useActivity(taskId);
  const { userName, user } = useLookups();
  if (!log) return <LoadingBlock />;
  if (log.length === 0) return <EmptyState icon={Activity} title="لا يوجد نشاط مسجل" />;
  return (
    <ol className="space-y-1" aria-label="سجل النشاط">
      {log.map((l) => (
        <li key={l.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted/50">
          <span
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: user(l.userId)?.color ?? '#6b7280' }}
            aria-hidden
          >
            {userName(l.userId).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words">
              <span className="font-medium">{userName(l.userId)}</span> — {l.details}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTime(l.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
