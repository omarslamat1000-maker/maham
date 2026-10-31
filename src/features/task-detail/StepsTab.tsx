import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, LoadingBlock, Progress } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { useAction, useLookups, useSteps } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { normalizedWeights } from '@/domain/progress';
import { stepService, type StepPatch } from '@/services/stepService';
import { STEP_STATUSES, type Task, type TaskStep } from '@/types/entities';
import { STEP_STATUS_LABEL } from '@/utils/labels';
import { formatDate } from '@/utils/date';
import { cn } from '@/utils/cn';

/** شريط إنجاز الخطوة: يُحفظ عند إفلات المؤشر أو مغادرة الحقل */
function StepProgress({ step, disabled }: { step: TaskStep; disabled: boolean }) {
  const [value, setValue] = useState(step.progress);
  const { run } = useAction();
  useEffect(() => setValue(step.progress), [step.progress]);
  const commit = () => {
    if (value !== step.progress) void run(() => stepService.update(step.id, { progress: value }));
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label={`نسبة إنجاز ${step.title}`}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
      />
      <span className="tabular w-10 text-end text-sm font-medium">{value}%</span>
    </div>
  );
}

function WeightInput({ step, disabled }: { step: TaskStep; disabled: boolean }) {
  const [value, setValue] = useState(String(step.weight));
  const { run } = useAction();
  useEffect(() => setValue(String(step.weight)), [step.weight]);
  const commit = async () => {
    const n = Number(value);
    if (value.trim() === '' || Number.isNaN(n) || n === step.weight) {
      setValue(String(step.weight));
      return;
    }
    const r = await run(() => stepService.update(step.id, { weight: n }));
    if (r === false) setValue(String(step.weight));
  };
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={value}
      disabled={disabled}
      aria-label={`وزن ${step.title}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-8 w-20 text-center"
    />
  );
}

export function StepsTab({ task }: { task: Task }) {
  const steps = useSteps(task.id);
  const { userName } = useLookups();
  const { run, pending } = useAction();
  const [title, setTitle] = useState('');
  const [weight, setWeight] = useState('1');
  const [editing, setEditing] = useState<TaskStep | 'new' | null>(null);
  const locked = task.status === 'completed';

  if (!steps) return <LoadingBlock />;
  const norm = normalizedWeights(steps);
  const totalWeight = steps.reduce((a, s) => a + Math.max(0, s.weight), 0);

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(() => stepService.add(task.id, { title, weight: Number(weight) || 0 }), 'تمت إضافة الخطوة');
    if (r) {
      setTitle('');
      setWeight('1');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        نسبة إنجاز المهمة = مجموع (وزن الخطوة × إنجازها) ÷ مجموع الأوزان. إجمالي الأوزان الحالي:{' '}
        <span className="tabular font-semibold text-foreground">{totalWeight}</span>
        {totalWeight === 0 && steps.length > 0 && ' — تُعامل الخطوات بأوزان متساوية.'}
      </div>

      {!locked && (
        <form onSubmit={quickAdd} className="flex flex-col gap-2 sm:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان خطوة جديدة…" aria-label="عنوان الخطوة" className="flex-1" />
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-label="الوزن"
              className="w-24"
              placeholder="الوزن"
            />
            <Button type="submit" loading={pending} disabled={!title.trim()}>
              <Plus aria-hidden />
              إضافة
            </Button>
            <Button variant="outline" onClick={() => setEditing('new')}>
              بالتفاصيل
            </Button>
          </div>
        </form>
      )}

      {steps.length === 0 ? (
        <EmptyState icon={ListChecks} title="لا توجد خطوات تنفيذية" description="قسّم المهمة إلى خطوات موزونة ليُحسب الإنجاز تلقائيًا." />
      ) : (
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={s.id} className={cn('rounded-xl border border-border bg-card p-3.5', s.status === 'done' && 'bg-success-soft/40')}>
              <div className="flex flex-wrap items-start gap-2">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn('font-medium', s.status === 'done' && 'text-muted-foreground line-through')}>{s.title}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {s.assigneeId && <span>{userName(s.assigneeId)}</span>}
                    {s.dueDate && <span>الاستحقاق: {formatDate(s.dueDate)}</span>}
                    <span className="tabular">الحصة: {norm[i].toFixed(0)}%</span>
                  </div>
                  {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                  {s.notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {s.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="تحريك لأعلى" disabled={i === 0 || locked} onClick={() => run(() => stepService.move(s.id, -1))}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="تحريك لأسفل"
                    disabled={i === steps.length - 1 || locked}
                    onClick={() => run(() => stepService.move(s.id, 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`تعديل ${s.title}`} disabled={locked} onClick={() => setEditing(s)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`حذف ${s.title}`}
                    disabled={locked}
                    onClick={async () => {
                      if (await confirmDialog({ title: 'حذف الخطوة؟', description: `«${s.title}» — سيُعاد حساب نسبة الإنجاز.`, destructive: true, confirmText: 'حذف' }))
                        await run(() => stepService.remove(s.id), 'تم حذف الخطوة');
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_auto_auto]">
                <StepProgress step={s} disabled={locked} />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  الوزن
                  <WeightInput step={s} disabled={locked} />
                </div>
                <Select
                  value={s.status}
                  disabled={locked}
                  aria-label={`حالة ${s.title}`}
                  onChange={(e) => run(() => stepService.update(s.id, { status: e.target.value as TaskStep['status'] }))}
                  className="h-8 w-32 text-xs"
                >
                  {STEP_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {STEP_STATUS_LABEL[st]}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ol>
      )}
      {steps.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-border p-3">
          <span className="text-sm text-muted-foreground">الإنجاز المرجّح</span>
          <Progress value={task.computedProgress ?? 0} className="flex-1" />
          <Badge tone="primary" className="tabular">
            {task.computedProgress ?? 0}%
          </Badge>
        </div>
      )}
      <StepDialog task={task} step={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function StepDialog({ task, step, onClose }: { task: Task; step: TaskStep | 'new' | null; onClose: () => void }) {
  const { users } = useLookups();
  const { run, pending } = useAction();
  const blank: StepPatch = { title: '', description: '', assigneeId: task.assigneeId, startDate: null, dueDate: null, weight: 1, progress: 0, notes: '' };
  const [v, setV] = useState<StepPatch>(blank);
  useEffect(() => {
    if (step === 'new') setV(blank);
    else if (step) setV({ ...step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const set = (k: keyof StepPatch, val: unknown) => setV((p) => ({ ...p, [k]: val }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: StepPatch = { ...v, assigneeId: v.assigneeId || null, startDate: v.startDate || null, dueDate: v.dueDate || null };
    const r =
      step === 'new'
        ? await run(() => stepService.add(task.id, payload as Required<StepPatch>), 'تمت إضافة الخطوة')
        : await run(() => stepService.update((step as TaskStep).id, payload), 'تم حفظ الخطوة');
    if (r) onClose();
  };

  return (
    <Dialog open={step !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={step === 'new' ? 'خطوة جديدة' : 'تعديل الخطوة'} wide>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان الخطوة" htmlFor="st-title" required className="sm:col-span-2">
            <Input id="st-title" value={v.title ?? ''} onChange={(e) => set('title', e.target.value)} autoFocus />
          </Field>
          <Field label="الوصف" htmlFor="st-desc" className="sm:col-span-2">
            <Textarea id="st-desc" value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="المسؤول" htmlFor="st-user">
            <Select id="st-user" value={(v.assigneeId as string | null) ?? ''} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">غير مسندة</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الوزن" htmlFor="st-weight" hint="رقم غير سالب يمثل حجم الجهد النسبي">
            <Input id="st-weight" type="number" min={0} step="any" value={String(v.weight ?? 1)} onChange={(e) => set('weight', e.target.value)} />
          </Field>
          <Field label="تاريخ البداية" htmlFor="st-start">
            <Input id="st-start" type="date" value={(v.startDate as string | null) ?? ''} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="تاريخ الاستحقاق" htmlFor="st-due">
            <Input id="st-due" type="date" value={(v.dueDate as string | null) ?? ''} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
          <Field label={`نسبة الإنجاز: ${v.progress ?? 0}%`} htmlFor="st-progress" className="sm:col-span-2">
            <input
              id="st-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Number(v.progress ?? 0)}
              onChange={(e) => set('progress', Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </Field>
          <Field label="ملاحظات" htmlFor="st-notes" className="sm:col-span-2">
            <Textarea id="st-notes" rows={2} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending}>
              حفظ الخطوة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
