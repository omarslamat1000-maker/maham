import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { Field, Input, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { useAction, useCurrentUser, useLookups } from '@/hooks/data';
import { useUIStore } from '@/stores/uiStore';
import { taskInputSchema, type TaskInput } from '@/domain/schemas';
import { taskService } from '@/services/taskService';
import { PRIORITIES } from '@/types/entities';
import { PRIORITY_LABEL } from '@/utils/labels';
import { todayStr } from '@/utils/date';

type FormValues = {
  title: string;
  categoryId: string;
  project: string;
  startDate: string;
  dueDate: string;
  priority: TaskInput['priority'];
  assigneeId: string;
};

/** إنشاء مهمة سريع — متاح من جميع الصفحات (زر + أو مفتاح N) */
export function QuickAddDialog() {
  const open = useUIStore((s) => s.quickAddOpen);
  const defaults = useUIStore((s) => s.quickAddDefaults);
  const close = useUIStore((s) => s.closeQuickAdd);
  const { users, activeCategories } = useLookups();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const { run, pending } = useAction();

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(taskInputSchema as any),
    defaultValues: { title: '', categoryId: '', project: '', startDate: todayStr(), dueDate: '', priority: 'medium', assigneeId: '' },
  });
  const { register, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (open) {
      reset({
        title: defaults?.title ?? '',
        categoryId: '',
        project: '',
        startDate: todayStr(),
        dueDate: defaults?.dueDate ?? '',
        priority: 'medium',
        assigneeId: me?.id ?? '',
      });
    }
  }, [open, defaults, me?.id, reset]);

  const submit = (openDetails: boolean) =>
    handleSubmit(async (values) => {
      const task = await run(() => taskService.create(values));
      if (!task) return;
      close();
      toast.success('تم حفظ المهمة', {
        action: openDetails ? undefined : { label: 'فتح التفاصيل', onClick: () => navigate(`/tasks/${task.id}`) },
      });
      if (openDetails) navigate(`/tasks/${task.id}`);
    });

  const err = (k: keyof FormValues) => formState.errors[k]?.message as string | undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent title="مهمة جديدة" description="أدخل العنوان واحفظ — يمكنك إضافة التفاصيل لاحقًا.">
        <form onSubmit={submit(false)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="عنوان المهمة" htmlFor="qa-title" required error={err('title')} className="sm:col-span-2">
            <Input id="qa-title" autoFocus autoComplete="off" placeholder="مثال: إعداد تقرير الربع الثالث" aria-invalid={!!err('title')} {...register('title')} />
          </Field>
          <Field label="المجال / التصنيف" htmlFor="qa-cat">
            <Select id="qa-cat" {...register('categoryId')}>
              <option value="">بدون تصنيف</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المشروع أو الجهة" htmlFor="qa-project">
            <Input id="qa-project" placeholder="اختياري" {...register('project')} />
          </Field>
          <Field label="تاريخ البداية" htmlFor="qa-start" error={err('startDate')}>
            <Input id="qa-start" type="date" {...register('startDate')} />
          </Field>
          <Field label="تاريخ النهاية" htmlFor="qa-due" error={err('dueDate')}>
            <Input id="qa-due" type="date" aria-invalid={!!err('dueDate')} {...register('dueDate')} />
          </Field>
          <Field label="الأولوية" htmlFor="qa-priority">
            <Select id="qa-priority" {...register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المسؤول" htmlFor="qa-assignee">
            <Select id="qa-assignee" {...register('assigneeId')}>
              <option value="">غير مسندة</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={submit(true)} disabled={pending}>
              حفظ وفتح التفاصيل
            </Button>
            <Button type="submit" loading={pending}>
              حفظ المهمة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
