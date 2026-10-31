import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, FileSpreadsheet, FileText, Printer, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { exportService, periodLabel, reportService } from '@/services/reportService';
import { distinctValues, type ReportFilters } from '@/domain/metrics';
import { PRIORITIES, TASK_STATUSES } from '@/types/entities';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/utils/labels';
import { formatDate, formatMonthShort, monthRange, todayStr, toDateOnly } from '@/utils/date';
import { useLookups } from '@/hooks/data';

type Preset = 'this_month' | 'last_month' | 'last_3' | 'this_year' | 'all' | 'custom';

function presetRange(p: Preset): { from: string | null; to: string | null } {
  const now = new Date();
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  switch (p) {
    case 'this_month': {
      const r = monthRange(ym(now));
      return { from: r.start, to: r.end };
    }
    case 'last_month': {
      const r = monthRange(ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      return { from: r.start, to: r.end };
    }
    case 'last_3':
      return { from: toDateOnly(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: todayStr() };
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    default:
      return { from: null, to: null };
  }
}

const tooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'inherit', direction: 'rtl' as const },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600 },
};
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="print-avoid-break rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('this_month');
  const [filters, setFilters] = useState<ReportFilters>(() => presetRange('this_month'));
  const { users, activeCategories } = useLookups();
  const data = useLiveQuery(() => reportService.load(filters, 6), [filters]);
  const projects = useMemo(() => (data ? distinctValues(data.allTasks, 'project') : []), [data]);
  const entities = useMemo(() => (data ? distinctValues(data.allTasks, 'entity') : []), [data]);

  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => setFilters((f) => ({ ...f, [k]: v || null }));
  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setFilters((f) => ({ ...f, ...presetRange(p) }));
  };

  if (!data) return <LoadingBlock rows={6} />;
  const r = data.report;
  const months = r.months.map((m) => ({ ...m, label: formatMonthShort(m.month) }));
  const noData = data.allTasks.length === 0;

  return (
    <div>
      <PageHeader
        title="التقارير والتحليلات"
        description="جميع الأرقام محسوبة من سجلات المهام الفعلية."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportService.csv(data)} disabled={noData}>
              <FileText aria-hidden />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportService.xlsx(data)} disabled={noData}>
              <FileSpreadsheet aria-hidden />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportService.pdf()} disabled={noData} title="يفتح نافذة الطباعة — اختر «حفظ بصيغة PDF»">
              <Printer aria-hidden />
              PDF
            </Button>
          </div>
        }
      />

      <div className="print-only mb-4">
        <h1 className="text-xl font-bold">مهام | MAHAM — تقرير الأداء</h1>
        <p className="text-sm">الفترة: {periodLabel(filters)} · تاريخ الإصدار: {formatDate(todayStr())}</p>
      </div>

      <div className="no-print mb-5 space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="الفترة الزمنية">
          {(
            [
              ['this_month', 'هذا الشهر'],
              ['last_month', 'الشهر الماضي'],
              ['last_3', 'آخر 3 أشهر'],
              ['this_year', 'هذا العام'],
              ['all', 'كل الفترات'],
              ['custom', 'مخصص'],
            ] as [Preset, string][]
          ).map(([p, l]) => (
            <Button key={p} size="sm" variant={preset === p ? 'default' : 'ghost'} onClick={() => choosePreset(p)} aria-pressed={preset === p}>
              {l}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Input type="date" aria-label="من تاريخ" value={filters.from ?? ''} onChange={(e) => (setPreset('custom'), set('from', e.target.value))} />
          <Input type="date" aria-label="إلى تاريخ" value={filters.to ?? ''} onChange={(e) => (setPreset('custom'), set('to', e.target.value))} />
          <Select aria-label="المجال" value={filters.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">كل المجالات</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="المشروع" value={filters.project ?? ''} onChange={(e) => set('project', e.target.value)}>
            <option value="">كل المشاريع</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select aria-label="الجهة" value={filters.entity ?? ''} onChange={(e) => set('entity', e.target.value)}>
            <option value="">كل الجهات</option>
            {entities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select aria-label="المسؤول" value={filters.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">كل المسؤولين</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select aria-label="الأولوية" value={filters.priority ?? ''} onChange={(e) => set('priority', e.target.value as ReportFilters['priority'])}>
            <option value="">كل الأولويات</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select aria-label="الحالة" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value as ReportFilters['status'])}>
            <option value="">كل الحالات</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="ghost" onClick={() => (setPreset('all'), setFilters({}))}>
          <RotateCcw aria-hidden />
          إعادة ضبط الفلاتر
        </Button>
      </div>

      {noData ? (
        <EmptyState icon={ChartColumn} title="لا توجد بيانات بعد" description="ستظهر التقارير بعد إنشاء المهام وتسجيل الإنجاز." />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="ملخص المؤشرات">
            <Stat label="المهام ضمن الفلاتر" value={r.total} />
            <Stat label="معدل الإنجاز" value={r.completionRate === null ? '—' : `${r.completionRate}%`} hint="المكتملة ÷ النشطة في الفترة" />
            <Stat label="المكتملة في الفترة" value={r.completedInPeriod} />
            <Stat label="المتأخرة حاليًا" value={r.overdue} />
            <Stat label="متوسط مدة الإنجاز" value={r.avgDurationDays === null ? '—' : `${r.avgDurationDays} يوم`} hint="من البداية حتى الاعتماد" />
            <Stat label="الإنجاز في الموعد" value={r.onTimeRate === null ? '—' : `${r.onTimeRate}%`} hint={`${r.onTimeCount} في الموعد · ${r.lateCount} متأخرة`} />
            <Stat label="متوسط التأخير" value={r.avgDelayDays === null ? '—' : `${r.avgDelayDays} يوم`} hint="للمهام المنجزة بعد موعدها" />
            <Stat label="بانتظار الاعتماد" value={r.pendingApprovals.length} />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>الاتجاه الشهري ومعدل الإنجاز</CardTitle>
              </CardHeader>
              <CardContent className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={months} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" reversed tick={axisTick} />
                    <YAxis yAxisId="n" orientation="right" allowDecimals={false} tick={axisTick} width={30} />
                    <YAxis yAxisId="p" orientation="left" domain={[0, 100]} unit="%" tick={axisTick} width={40} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="created" name="أُنشئت" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="n" dataKey="completed" name="أُنجزت" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="p" dataKey="completionRate" name="معدل الإنجاز %" stroke="var(--warning)" strokeWidth={2} dot connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>المخطط مقابل الفعلي</CardTitle>
              </CardHeader>
              <CardContent className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={months} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" reversed tick={axisTick} />
                    <YAxis orientation="right" allowDecimals={false} tick={axisTick} width={30} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
                    <Bar dataKey="planned" name="المخطط (مستحقة)" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="الفعلي (مكتملة)" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="onTime" name="منها في الموعد" fill="var(--success)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>متوسط الإنجاز حسب التصنيف</CardTitle>
              </CardHeader>
              <CardContent style={{ height: Math.max(180, r.byCategory.length * 44 + 40) }} dir="ltr">
                {r.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد بيانات ضمن الفلاتر.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.byCategory} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" reversed tick={axisTick} />
                      <YAxis type="category" dataKey="name" orientation="right" width={100} tick={axisTick} />
                      <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'متوسط الإنجاز']} />
                      <Bar dataKey="avgProgress" radius={[4, 0, 0, 4]}>
                        {r.byCategory.map((c) => (
                          <Cell key={c.categoryId ?? 'none'} fill={c.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>الأداء حسب المستخدم</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 text-start font-medium">المستخدم</th>
                      <th className="py-2 font-medium">الإجمالي</th>
                      <th className="py-2 font-medium">المكتملة</th>
                      <th className="py-2 font-medium">المتأخرة</th>
                      <th className="py-2 font-medium">في الموعد</th>
                      <th className="py-2 font-medium">متوسط الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {r.byUser.map((u) => (
                      <tr key={u.userId ?? 'none'} className="border-b border-border last:border-0">
                        <td className="py-2.5 font-medium">{u.name}</td>
                        <td className="py-2.5 text-center">{u.total}</td>
                        <td className="py-2.5 text-center">{u.completed}</td>
                        <td className="py-2.5 text-center text-danger">{u.overdue}</td>
                        <td className="py-2.5 text-center">{u.onTimeRate === null ? '—' : `${u.onTimeRate}%`}</td>
                        <td className="py-2.5 text-center">{u.avgProgress}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>تحليل المهام المتأخرة</CardTitle>
              </CardHeader>
              <CardContent>
                {r.delayed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد مهام متأخرة ضمن الفلاتر. 👏</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.delayed.slice(0, 15).map(({ task, delay, kind }) => (
                      <li key={task.id} className="flex items-center gap-3 py-2.5 text-sm">
                        <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                          {task.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{kind === 'overdue_open' ? 'مفتوحة' : 'أُنجزت متأخرة'}</span>
                        <span className="tabular w-16 text-end font-semibold text-danger">+{delay} يوم</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="print-avoid-break">
              <CardHeader>
                <CardTitle>بانتظار الاعتماد</CardTitle>
              </CardHeader>
              <CardContent>
                {r.pendingApprovals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد مهام بانتظار الاعتماد.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {r.pendingApprovals.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <Link to={`/tasks/${t.id}?tab=delivery`} className="min-w-0 truncate hover:text-primary">
                          {t.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">قُدّمت {formatDate(t.submittedAt?.slice(0, 10))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <details className="rounded-xl border border-border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">منهجية حساب المؤشرات</summary>
            <ul className="mt-3 list-inside list-disc space-y-1 text-muted-foreground">
              <li>تاريخ الإنجاز = لحظة اعتماد التسليم.</li>
              <li>مدة المهمة = من تاريخ البداية (أو تاريخ الإنشاء) حتى تاريخ الإنجاز.</li>
              <li>في الموعد = تاريخ الإنجاز ≤ تاريخ الاستحقاق.</li>
              <li>النشطة في الفترة = المهام التي تتقاطع فترة عملها مع الفترة المحددة.</li>
              <li>معدل الإنجاز = المكتملة في الفترة ÷ النشطة في الفترة.</li>
              <li>المخطط لشهر = المهام المستحقة فيه، والفعلي = المكتملة فيه.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
