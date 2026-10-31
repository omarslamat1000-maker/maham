import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Activity, ArrowRight, CalendarClock, ClipboardCheck, Info, Lightbulb, ListChecks, MessageSquare, MoreVertical, Package, Sparkles, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock, Progress } from '@/components/ui/misc';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlay';
import { PriorityBadge, StatusBadge, SubmissionBadge } from '@/components/tasks/badges';
import { useAction, useLookups, useTask } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { effectiveProgress } from '@/domain/progress';
import { isOverdue } from '@/domain/urgency';
import { taskService } from '@/services/taskService';
import { formatDate, relativeDue } from '@/utils/date';
import { cn } from '@/utils/cn';
import { GeneralTab } from '@/features/task-detail/GeneralTab';
import { StepsTab } from '@/features/task-detail/StepsTab';
import { UpdatesTab } from '@/features/task-detail/UpdatesTab';
import { DeliverablesTab } from '@/features/task-detail/DeliverablesTab';
import { DeliveryTab } from '@/features/task-detail/DeliveryTab';
import { ActivityTab } from '@/features/task-detail/ActivityTab';

const TABS = ['general', 'steps', 'updates', 'deliverables', 'delivery', 'activity'] as const;

export default function TaskDetailPage() {
  const { id } = useParams();
  const task = useTask(id);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { userName, category } = useLookups();
  const { run } = useAction();
  const tab = TABS.includes(params.get('tab') as (typeof TABS)[number]) ? params.get('tab')! : 'general';

  if (task === undefined) return <LoadingBlock rows={4} />;
  if (!task || task.deletedAt) {
    return (
      <EmptyState
        icon={Info}
        title="المهمة غير موجودة"
        description={task?.deletedAt ? 'هذه المهمة محذوفة. يمكن استرجاعها من الإعدادات.' : 'ربما حُذفت أو أن الرابط غير صحيح.'}
        action={
          <Button asChild variant="outline">
            <Link to="/tasks">العودة للمهام</Link>
          </Button>
        }
      />
    );
  }

  const progress = effectiveProgress(task);
  const cat = category(task.categoryId);
  const overdue = isOverdue(task);

  const remove = async () => {
    if (await confirmDialog({ title: 'حذف المهمة؟', description: `ستُنقل «${task.title}» إلى المحذوفات ويمكن استرجاعها من الإعدادات.`, destructive: true, confirmText: 'حذف' })) {
      const r = await run(() => taskService.softDelete(task.id), 'تم حذف المهمة');
      if (r !== false) navigate('/tasks');
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="size-4" aria-hidden />
        المهام
      </Link>

      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              <SubmissionBadge status={task.submissionStatus} hideDefault />
            </div>
            <h1 className="text-xl font-bold break-words sm:text-2xl">{task.title}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {cat && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: cat.color }} aria-hidden />
                  {cat.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <User className="size-4" aria-hidden />
                {userName(task.assigneeId)}
              </span>
              <span className={cn('inline-flex items-center gap-1.5', overdue && 'font-medium text-danger')}>
                <CalendarClock className="size-4" aria-hidden />
                {task.dueDate ? `${formatDate(task.dueDate)}${task.status !== 'completed' ? ` (${relativeDue(task.dueDate)})` : ''}` : 'بلا تاريخ استحقاق'}
              </span>
              {task.sourceIdeaId && (
                <Link to="/backlog" className="inline-flex items-center gap-1.5 hover:text-primary">
                  <Lightbulb className="size-4" aria-hidden />
                  من بنك الأفكار
                </Link>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="خيارات المهمة">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link to={`/ai?task=${task.id}`}>
                  <Sparkles />
                  تحليل بالمساعد الذكي
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={remove}>
                <Trash2 />
                حذف المهمة
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={progress} className="h-2.5 flex-1" />
          <span className="tabular text-lg font-bold">{progress}%</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          أنشأها {userName(task.createdBy)} · آخر تعديل بواسطة {userName(task.updatedBy)}
          {task.reviewedBy && ` · راجعها ${userName(task.reviewedBy)}`}
          {task.approvedBy && ` · اعتمدها ${userName(task.approvedBy)}`}
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'general' ? {} : { tab: v }, { replace: true })} dir="rtl">
        <TabsList aria-label="أقسام المهمة">
          <TabsTrigger value="general">
            <Info aria-hidden />
            المعلومات العامة
          </TabsTrigger>
          <TabsTrigger value="steps">
            <ListChecks aria-hidden />
            الخطوات
          </TabsTrigger>
          <TabsTrigger value="updates">
            <MessageSquare aria-hidden />
            التحديثات
          </TabsTrigger>
          <TabsTrigger value="deliverables">
            <Package aria-hidden />
            المخرجات
          </TabsTrigger>
          <TabsTrigger value="delivery">
            <ClipboardCheck aria-hidden />
            التسليم والاعتماد
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity aria-hidden />
            سجل النشاط
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab task={task} />
        </TabsContent>
        <TabsContent value="steps">
          <StepsTab task={task} />
        </TabsContent>
        <TabsContent value="updates">
          <UpdatesTab task={task} />
        </TabsContent>
        <TabsContent value="deliverables">
          <DeliverablesTab task={task} />
        </TabsContent>
        <TabsContent value="delivery">
          <DeliveryTab task={task} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab taskId={task.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
