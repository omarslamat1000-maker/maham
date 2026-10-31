import { Link } from 'react-router';
import { CalendarClock, User as UserIcon } from 'lucide-react';
import type { Task } from '@/types/entities';
import { effectiveProgress } from '@/domain/progress';
import { isOverdue } from '@/domain/urgency';
import { formatDate, relativeDue } from '@/utils/date';
import { cn } from '@/utils/cn';
import { useLookups } from '@/hooks/data';
import { Progress } from '@/components/ui/misc';
import { PriorityBadge, StatusBadge, SubmissionBadge } from './badges';

interface Props {
  task: Task;
  extra?: React.ReactNode;
  actions?: React.ReactNode;
}

/** صف مهمة متجاوب: بطاقة على الجوال وصف مضغوط على الشاشات الكبيرة */
export function TaskRow({ task, extra, actions }: Props) {
  const { userName, category } = useLookups();
  const cat = category(task.categoryId);
  const progress = effectiveProgress(task);
  const overdue = isOverdue(task);

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center',
        overdue && 'border-s-4 border-s-danger',
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/tasks/${task.id}`}
            className="min-w-0 truncate font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none"
          >
            {task.title}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <SubmissionBadge status={task.submissionStatus} hideDefault />
          {cat && (
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: cat.color }} aria-hidden />
              {cat.name}
            </span>
          )}
          {task.project && <span>· {task.project}</span>}
          {extra}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs sm:w-[22rem] sm:shrink-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex justify-between text-muted-foreground">
            <span>الإنجاز</span>
            <span className="tabular font-medium text-foreground">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
        <div className="flex w-28 flex-col gap-1 text-muted-foreground">
          <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-danger')} title={formatDate(task.dueDate)}>
            <CalendarClock className="size-3.5" aria-hidden />
            {task.dueDate ? (task.status === 'completed' ? formatDate(task.dueDate) : relativeDue(task.dueDate)) : 'بلا استحقاق'}
          </span>
          <span className="inline-flex items-center gap-1 truncate">
            <UserIcon className="size-3.5" aria-hidden />
            {userName(task.assigneeId)}
          </span>
        </div>
        {actions && <div className="relative z-10">{actions}</div>}
      </div>
    </div>
  );
}
