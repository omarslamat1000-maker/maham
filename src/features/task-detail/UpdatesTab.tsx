import { useRef, useState } from 'react';
import { ArrowLeft, MessageSquarePlus, Paperclip, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, LoadingBlock } from '@/components/ui/misc';
import { useAction, useLookups, useUpdates } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { effectiveProgress } from '@/domain/progress';
import { updateService } from '@/services/updateService';
import { deliverableService } from '@/services/deliverableService';
import type { Task, TaskUpdate } from '@/types/entities';
import { formatDate, relativeTime, todayStr } from '@/utils/date';
import { ACCEPT_ATTR, downloadBlob } from '@/utils/file';
import { toast } from 'sonner';

export function UpdatesTab({ task }: { task: Task }) {
  const updates = useUpdates(task.id);
  const { userName, user } = useLookups();
  const { run, pending } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => ({
    date: todayStr(),
    description: '',
    progressAtUpdate: effectiveProgress(task),
    challenges: '',
    nextAction: '',
  }));
  const [file, setFile] = useState<File | null>(null);
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(() => updateService.add(task.id, form, file), 'تمت إضافة التحديث');
    if (r) {
      setForm({ date: todayStr(), description: '', progressAtUpdate: effectiveProgress(task), challenges: '', nextAction: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadAttachment = async (u: TaskUpdate) => {
    if (!u.attachmentBlobId) return;
    const blob = await deliverableService.getBlob(u.attachmentBlobId);
    if (!blob) return toast.error('المرفق غير متوفر على هذا الجهاز');
    downloadBlob(blob, u.attachmentName ?? 'attachment');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4 lg:col-span-2 lg:self-start" noValidate>
        <h3 className="font-semibold">تحديث جديد</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="التاريخ" htmlFor="up-date">
            <Input id="up-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={`الإنجاز: ${form.progressAtUpdate}%`} htmlFor="up-progress">
            <input
              id="up-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progressAtUpdate}
              onChange={(e) => set('progressAtUpdate', Number(e.target.value))}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </Field>
        </div>
        <Field label="وصف التحديث" htmlFor="up-desc" required>
          <Textarea id="up-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="ما الذي أُنجز؟" />
        </Field>
        <Field label="التحديات" htmlFor="up-ch" hint="تظهر في لوحة «أبرز أسباب التعثر»">
          <Textarea id="up-ch" rows={2} value={form.challenges} onChange={(e) => set('challenges', e.target.value)} />
        </Field>
        <Field label="الإجراء التالي" htmlFor="up-next">
          <Input id="up-next" value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} />
        </Field>
        <Field label="مرفق (اختياري)" htmlFor="up-file">
          <input
            ref={fileRef}
            id="up-file"
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
          />
        </Field>
        <Button type="submit" loading={pending} disabled={!form.description.trim()} className="w-full">
          <MessageSquarePlus aria-hidden />
          إضافة التحديث
        </Button>
      </form>

      <div className="lg:col-span-3">
        {!updates ? (
          <LoadingBlock />
        ) : updates.length === 0 ? (
          <EmptyState icon={MessageSquarePlus} title="لا توجد تحديثات" description="سجّل التقدم والتحديات بانتظام لتتبع مسار المهمة." />
        ) : (
          <ol className="relative space-y-5 border-s-2 border-border ps-6" aria-label="الخط الزمني للتحديثات">
            {updates.map((u) => (
              <li key={u.id} className="relative">
                <span
                  className="absolute -start-[31px] top-1 size-3.5 rounded-full border-2 border-card"
                  style={{ background: user(u.userId)?.color ?? 'var(--primary)' }}
                  aria-hidden
                />
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatDate(u.date)}</span>
                    <span>· {userName(u.userId)}</span>
                    <span>· {relativeTime(u.createdAt)}</span>
                    <Badge tone="primary" className="tabular ms-auto">
                      {u.progressAtUpdate}%
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="حذف التحديث"
                      onClick={async () => {
                        if (await confirmDialog({ title: 'حذف التحديث؟', destructive: true, confirmText: 'حذف' }))
                          await run(() => updateService.remove(u.id), 'تم حذف التحديث');
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{u.description}</p>
                  {u.challenges && (
                    <p className="mt-2 flex gap-2 rounded-lg bg-warning-soft p-2 text-sm">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      <span className="whitespace-pre-wrap">{u.challenges}</span>
                    </p>
                  )}
                  {u.nextAction && (
                    <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
                      <ArrowLeft className="mt-0.5 size-4 shrink-0" aria-hidden />
                      الإجراء التالي: {u.nextAction}
                    </p>
                  )}
                  {u.attachmentBlobId && (
                    <Button variant="link" size="sm" className="mt-1 h-auto" onClick={() => downloadAttachment(u)}>
                      <Paperclip aria-hidden />
                      {u.attachmentName}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
