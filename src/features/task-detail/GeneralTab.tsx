import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator, Hand, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { useAction, useLookups } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { taskInputSchema } from '@/domain/schemas';
import { effectiveProgress } from '@/domain/progress';
import { taskService } from '@/services/taskService';
import { PRIORITIES, type Task } from '@/types/entities';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/utils/labels';
import { formatDateTime } from '@/utils/date';

type FormValues = {
  title: string;
  description: string;
  categoryId: string;
  project: string;
  entity: string;
  assigneeId: string;
  priority: Task['priority'];
  startDate: string;
  dueDate: string;
};

const toForm = (t: Task): FormValues => ({
  title: t.title,
  description: t.description,
  categoryId: t.categoryId ?? '',
  project: t.project,
  entity: t.entity,
  assigneeId: t.assigneeId ?? '',
  priority: t.priority,
  startDate: t.startDate ?? '',
  dueDate: t.dueDate ?? '',
});

export function GeneralTab({ task }: { task: Task }) {
  const { users, activeCategories, category, userName } = useLookups();
  const { run, pending } = useAction();
  const [manualOpen, setManualOpen] = useState(false);
  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(taskInputSchema as any),
    defaultValues: toForm(task),
  });
  const { register, handleSubmit, reset, formState } = form;

  // مزامنة النموذج عند تغير المهمة من مصدر آخر إن لم يكن هناك تعديل غير محفوظ
  useEffect(() => {
    if (!formState.isDirty) reset(toForm(task));
  }, [task, formState.isDirty, reset]);

  const onSave = handleSubmit(async (values) => {
    const ok = await run(() => taskService.update(task.id, values), 'تم حفظ التعديلات');
    if (ok) reset(toForm(ok));
  });

  const err = (k: keyof FormValues) => formState.errors[k]?.message as string | undefined;
  const cat = category(task.categoryId);
  const progress = effectiveProgress(task);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={onSave} className="space-y-4 lg:col-span-2" noValidate>
        <Field label="عنوان المهمة" htmlFor="g-title" required error={err('title')}>
          <Input id="g-title" aria-invalid={!!err('title')} {...register('title')} />
        </Field>
        <Field label="وصف المهمة" htmlFor="g-desc" error={err('description')}>
          <Textarea id="g-desc" rows={5} placeholder="الهدف، النطاق، والمخرجات المتوقعة…" {...register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التصنيف (المجال)" htmlFor="g-cat">
            <Select id="g-cat" {...register('categoryId')}>
              <option value="">بدون تصنيف</option>
              {cat?.deletedAt && <option value={cat.id}>{cat.name} (محذوف)</option>}
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المسؤول" htmlFor="g-assignee">
            <Select id="g-assignee" {...register('assigneeId')}>
              <option value="">غير مسندة</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المشروع" htmlFor="g-project">
            <Input id="g-project" {...register('project')} />
          </Field>
          <Field label="الجهة" htmlFor="g-entity">
            <Input id="g-entity" {...register('entity')} />
          </Field>
          <Field label="الأولوية" htmlFor="g-priority">
            <Select id="g-priority" {...register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ البداية" htmlFor="g-start" error={err('startDate')}>
              <Input id="g-start" type="date" {...register('startDate')} />
            </Field>
            <Field label="تاريخ النهاية" htmlFor="g-due" error={err('dueDate')}>
              <Input id="g-due" type="date" aria-invalid={!!err('dueDate')} {...register('dueDate')} />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} disabled={!formState.isDirty}>
            <Save aria-hidden />
            حفظ التعديلات
          </Button>
          {formState.isDirty && (
            <Button variant="ghost" onClick={() => reset(toForm(task))}>
              <Undo2 aria-hidden />
              تراجع
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>الحالة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              aria-label="حالة المهمة"
              value={task.status}
              disabled={task.status === 'completed'}
              onChange={(e) => run(() => taskService.setStatus(task.id, e.target.value as Task['status']), 'تم تحديث الحالة')}
            >
              <option value="new">{STATUS_LABEL.new}</option>
              <option value="in_progress">{STATUS_LABEL.in_progress}</option>
              {task.status === 'completed' && <option value="completed">{STATUS_LABEL.completed}</option>}
            </Select>
            <p className="text-xs text-muted-foreground">
              {task.status === 'completed'
                ? `اكتملت ${formatDateTime(task.completedAt)} باعتماد ${userName(task.approvedBy)}. لإعادة الفتح استخدم تبويب «التسليم».`
                : 'لا تكتمل المهمة إلا عبر اعتماد التسليم في تبويب «التسليم».'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>نسبة الإنجاز</CardTitle>
            <span className="tabular text-2xl font-bold">{progress}%</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Calculator className="size-4" aria-hidden />
                  المحسوبة من الخطوات
                </dt>
                <dd className="tabular font-medium">{task.computedProgress === null ? 'لا توجد خطوات' : `${task.computedProgress}%`}</dd>
              </div>
              {task.manualProgress !== null && (
                <div className="rounded-lg bg-warning-soft p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-warning">
                    <Hand className="size-3.5" aria-hidden />
                    تعديل يدوي فعّال: {task.manualProgress}%
                  </div>
                  <p className="mt-1 text-foreground">السبب: {task.manualProgressReason}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    بواسطة {userName(task.manualProgressBy)} · {formatDateTime(task.manualProgressAt)}
                  </p>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setManualOpen(true)} disabled={task.status === 'completed'}>
                <Hand aria-hidden />
                تعديل يدوي
              </Button>
              {task.manualProgress !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'إلغاء التعديل اليدوي؟', description: 'ستعود النسبة إلى القيمة المحسوبة من الخطوات.' }))
                      await run(() => taskService.clearManualProgress(task.id), 'عادت النسبة للحساب الآلي');
                  }}
                >
                  إلغاء التعديل اليدوي
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ManualProgressDialog task={task} open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}

function ManualProgressDialog({ task, open, onOpenChange }: { task: Task; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(effectiveProgress(task));
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) {
      setValue(effectiveProgress(task));
      setReason('');
    }
  }, [open, task]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="تعديل يدوي لنسبة الإنجاز" description="تُحفظ القيمة اليدوية منفصلة عن المحسوبة، ويُسجَّل السبب والمنفذ والتاريخ.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => taskService.setManualProgress(task.id, value, reason), 'تم حفظ التعديل اليدوي');
            if (ok !== false) onOpenChange(false);
          }}
        >
          <Field label={`النسبة: ${value}%`} htmlFor="mp-value">
            <input
              id="mp-value"
              type="range"
              min={0}
              max={100}
              step={5}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </Field>
          <Field label="سبب التعديل" htmlFor="mp-reason" required>
            <Textarea id="mp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تقدير ميداني بعد اجتماع المتابعة" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
