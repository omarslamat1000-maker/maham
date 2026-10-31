import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flame,
  Gauge,
  Inbox,
  ListTodo,
  MessageSquare,
  Plus,
  Sparkle,
  Trophy,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingBlock, Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { TaskRow } from '@/components/tasks/TaskRow';
import { UrgencyBadge } from '@/components/tasks/badges';
import { useCurrentUser, useLookups, useRecentChallenges, useRecentUpdates, useSettings, useTasks } from '@/hooks/data';
import { useUIStore } from '@/stores/uiStore';
import { dashboardKpis } from '@/domain/metrics';
import { urgencyReasons, urgencyScore } from '@/domain/urgency';
import { formatDate, relativeTime } from '@/utils/date';
import { cn } from '@/utils/cn';

interface KpiProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  to: string;
  tone: string;
  hint?: string;
}

function KpiCard({ label, value, icon: Icon, to, tone, hint }: KpiProps) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', tone)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="tabular mt-2 text-2xl font-bold sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </Link>
  );
}

export default function DashboardPage() {
  const tasks = useTasks();
  const settings = useSettings();
  const me = useCurrentUser();
  const updates = useRecentUpdates(6);
  const challenges = useRecentChallenges(5);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { userName } = useLookups();

  const kpis = useMemo(() => (tasks ? dashboardKpis(tasks) : null), [tasks]);
  const taskById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);

  const highlights = useMemo(() => {
    if (!tasks || !settings) return [];
    const opts = { dueSoonDays: settings.dueSoonDays, staleDays: settings.staleDays };
    return tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => ({ t, score: urgencyScore(t, opts), reasons: urgencyReasons(t, opts) }))
      .sort((a, b) => b.score - a.score || (a.t.dueDate ?? '9').localeCompare(b.t.dueDate ?? '9'))
      .slice(0, 5);
  }, [tasks, settings]);

  if (!tasks || !kpis || !settings) return <LoadingBlock rows={5} />;

  const greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting}، {me?.name}
          </p>
          <h1 className="text-2xl font-bold">لوحة القيادة التنفيذية</h1>
        </div>
        <Button size="lg" onClick={() => openQuickAdd()}>
          <Plus aria-hidden />
          مهمة جديدة
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={Sparkle}
          title="ابدأ بأول مهمة"
          description="لا توجد مهام بعد. أنشئ مهمتك الأولى وستظهر هنا مؤشرات الأداء الفعلية."
          action={
            <Button onClick={() => openQuickAdd()}>
              <Plus aria-hidden />
              إنشاء مهمة
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="مؤشرات الأداء" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="إجمالي المهام" value={kpis.total} icon={ListTodo} to="/tasks" tone="bg-muted text-foreground" />
            <KpiCard label="جديدة" value={kpis.newCount} icon={Inbox} to="/tasks?status=new" tone="bg-info-soft text-info" />
            <KpiCard label="قيد التنفيذ" value={kpis.inProgress} icon={CircleDot} to="/tasks?status=in_progress" tone="bg-primary-soft text-primary" />
            <KpiCard label="مكتملة" value={kpis.completed} icon={CheckCircle2} to="/tasks?status=completed" tone="bg-success-soft text-success" />
            <KpiCard label="عاجلة" value={kpis.urgent} icon={Flame} to="/tasks?flag=urgent" tone="bg-danger-soft text-danger" hint="أولوية عاجلة أو متأخرة" />
            <KpiCard label="متأخرة" value={kpis.overdue} icon={AlertTriangle} to="/tasks?flag=overdue" tone="bg-danger-soft text-danger" />
            <KpiCard label="مستحقة هذا الأسبوع" value={kpis.dueThisWeek} icon={CalendarClock} to="/tasks?flag=week" tone="bg-warning-soft text-warning" />
            <KpiCard
              label="متوسط الإنجاز"
              value={kpis.avgProgress === null ? '—' : `${kpis.avgProgress}%`}
              icon={Gauge}
              to="/tasks?status=open&sort=progress"
              tone="bg-secondary-soft text-secondary"
              hint="للمهام المفتوحة"
            />
            <KpiCard label="أُنجزت هذا الشهر" value={kpis.completedThisMonth} icon={Trophy} to="/tasks?flag=completed_month" tone="bg-success-soft text-success" />
            <KpiCard label="بانتظار الاعتماد" value={kpis.pendingApprovals} icon={CheckCircle2} to="/tasks?submission=submitted" tone="bg-info-soft text-info" />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>أبرز المهام الحالية</CardTitle>
                <Link to="/urgent" className="text-sm text-primary hover:underline">
                  عرض العاجلة
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {highlights.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مهام مفتوحة. أحسنت! 🎉</p>
                ) : (
                  highlights.map(({ t, reasons }) => (
                    <TaskRow key={t.id} task={t} extra={reasons.map((r) => <UrgencyBadge key={r} reason={r} />)} />
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>آخر التحديثات</CardTitle>
                </CardHeader>
                <CardContent>
                  {!updates || updates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لم تُسجَّل تحديثات بعد.</p>
                  ) : (
                    <ol className="space-y-4">
                      {updates.map((u) => {
                        const t = taskById.get(u.taskId);
                        if (!t) return null;
                        return (
                          <li key={u.id} className="flex gap-3">
                            <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                            <div className="min-w-0 text-sm">
                              <Link to={`/tasks/${t.id}`} className="font-medium hover:text-primary">
                                {t.title}
                              </Link>
                              <p className="line-clamp-2 text-muted-foreground">{u.description}</p>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{userName(u.userId)}</span>·<span>{relativeTime(u.createdAt)}</span>·
                                <span className="tabular">{u.progressAtUpdate}%</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>أبرز أسباب التعثر</CardTitle>
                </CardHeader>
                <CardContent>
                  {!challenges || challenges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد تحديات مسجلة. تُجمع من حقل «التحديات» في تحديثات المهام.</p>
                  ) : (
                    <ul className="space-y-3">
                      {challenges.map((u) => {
                        const t = taskById.get(u.taskId);
                        if (!t) return null;
                        return (
                          <li key={u.id} className="flex gap-3 text-sm">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                            <div className="min-w-0">
                              <p className="line-clamp-2">{u.challenges}</p>
                              <Link to={`/tasks/${t.id}`} className="text-xs text-muted-foreground hover:text-primary">
                                {t.title} · {formatDate(u.date)}
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {kpis.avgProgress !== null && (
                <Card>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">متوسط إنجاز المهام المفتوحة</span>
                      <span className="tabular font-semibold">{kpis.avgProgress}%</span>
                    </div>
                    <Progress value={kpis.avgProgress} />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
