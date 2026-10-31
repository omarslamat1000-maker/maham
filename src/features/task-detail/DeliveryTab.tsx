import { useState } from 'react';
import { Bot, CheckCircle2, Circle, Plus, RotateCcw, Send, ThumbsUp, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingBlock } from '@/components/ui/misc';
import { SubmissionBadge } from '@/components/tasks/badges';
import { useAction, useApprovals, useChecklist, useLookups } from '@/hooks/data';
import { confirmDialog, promptDialog } from '@/stores/uiStore';
import { availableApprovalActions } from '@/domain/lifecycle';
import { unmetRequired } from '@/domain/checklist';
import { approvalService, checklistService } from '@/services/approvalService';
import type { ApprovalAction, Task } from '@/types/entities';
import { APPROVAL_ACTION_LABEL } from '@/utils/labels';
import { formatDateTime } from '@/utils/date';
import { cn } from '@/utils/cn';

const ACTION_ICON: Record<ApprovalAction, typeof Send> = { submitted: Send, approved: ThumbsUp, changes_requested: Undo2, reopened: RotateCcw };

export function DeliveryTab({ task }: { task: Task }) {
  const checklist = useChecklist(task.id);
  const approvals = useApprovals(task.id);
  const { userName } = useLookups();
  const { run, pending } = useAction();
  const [newItem, setNewItem] = useState('');

  if (!checklist || !approvals) return <LoadingBlock />;
  const unmet = unmetRequired(checklist);
  const actions = availableApprovalActions(task);

  const perform = async (action: ApprovalAction) => {
    let reason = '';
    if (action === 'changes_requested' || action === 'reopened') {
      const r = await promptDialog({
        title: action === 'changes_requested' ? 'طلب تعديلات' : 'إعادة فتح المهمة',
        description: action === 'changes_requested' ? 'ستبقى المهمة قيد التنفيذ وتظهر الملاحظات للمسؤول.' : 'ستعود المهمة إلى «قيد التنفيذ».',
        confirmText: APPROVAL_ACTION_LABEL[action],
        input: { label: 'السبب / ملاحظات المراجعة', required: true, multiline: true },
      });
      if (r === null) return;
      reason = r;
    } else if (action === 'approved') {
      const r = await promptDialog({
        title: 'اعتماد التسليم',
        description: 'ستتحول المهمة إلى «مكتملة» ويُسجَّل تاريخ الإنجاز.',
        confirmText: 'اعتماد',
        input: { label: 'ملاحظة الاعتماد (اختياري)' },
      });
      if (r === null) return;
      reason = r;
    } else if (!(await confirmDialog({ title: 'تقديم المهمة للمراجعة؟', description: 'سيُنشأ تنبيه «تحتاج مراجعة».', confirmText: 'تقديم' }))) {
      return;
    }
    await run(() => approvalService.perform(task.id, action, reason), `تم: ${APPROVAL_ACTION_LABEL[action]}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>متطلبات التسليم</CardTitle>
          <Badge tone={unmet.length ? 'warning' : 'success'} className="tabular">
            {checklist.filter((c) => c.item.required && c.satisfied).length}/{checklist.filter((c) => c.item.required).length} إلزامي
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-2">
            {checklist.map(({ item, satisfied, hint }) => (
              <li key={item.id} className={cn('flex items-center gap-3 rounded-lg border border-border p-3', satisfied && 'bg-success-soft/40')}>
                {item.autoRule ? (
                  satisfied ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="مستوفى" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground" aria-label="غير مستوفى" />
                  )
                ) : (
                  <Checkbox
                    checked={item.done}
                    disabled={task.status === 'completed'}
                    onChange={(e) => run(() => checklistService.toggle(item.id, e.target.checked))}
                    aria-label={item.label}
                    className="size-5"
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <span className={cn(satisfied && 'text-muted-foreground')}>{item.label}</span>
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {item.autoRule && (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="size-3" aria-hidden />
                        تحقق آلي{hint ? ` — ${hint}` : ''}
                      </span>
                    )}
                    {!item.required && <span>(اختياري)</span>}
                    {item.done && item.doneBy && (
                      <span>
                        {userName(item.doneBy)} · {formatDateTime(item.doneAt)}
                      </span>
                    )}
                  </div>
                </div>
                {!item.autoRule && task.status !== 'completed' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`حذف ${item.label}`}
                    onClick={async () => {
                      if (await confirmDialog({ title: 'حذف المتطلب؟', description: item.label, destructive: true, confirmText: 'حذف' }))
                        await run(() => checklistService.remove(item.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {task.status !== 'completed' && (
            <form
              className="flex gap-2 pt-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => checklistService.add(task.id, newItem));
                if (r !== false) setNewItem('');
              }}
            >
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="متطلب إضافي…" aria-label="متطلب تسليم جديد" />
              <Button type="submit" variant="outline" disabled={!newItem.trim()}>
                <Plus aria-hidden />
                إضافة
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>مسار المراجعة والاعتماد</CardTitle>
            <SubmissionBadge status={task.submissionStatus} />
          </CardHeader>
          <CardContent className="space-y-4">
            {task.submissionStatus === 'changes_requested' && task.reviewNotes && (
              <div role="status" className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning">ملاحظات المراجعة</p>
                <p className="mt-1 whitespace-pre-wrap">{task.reviewNotes}</p>
                <p className="mt-1 text-xs text-muted-foreground">بواسطة {userName(task.reviewedBy)}</p>
              </div>
            )}
            {actions.includes('approved') && unmet.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">لا يمكن الاعتماد قبل استيفاء:</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {unmet.map((u) => (
                    <li key={u.item.id}>{u.item.label}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {actions.includes('submitted') && (
                <Button onClick={() => perform('submitted')} loading={pending}>
                  <Send aria-hidden />
                  تقديم للمراجعة
                </Button>
              )}
              {actions.includes('approved') && (
                <Button onClick={() => perform('approved')} disabled={unmet.length > 0 || pending}>
                  <ThumbsUp aria-hidden />
                  اعتماد
                </Button>
              )}
              {actions.includes('changes_requested') && (
                <Button variant="outline" onClick={() => perform('changes_requested')} disabled={pending}>
                  <Undo2 aria-hidden />
                  طلب تعديلات
                </Button>
              )}
              {actions.includes('reopened') && (
                <Button variant="outline" onClick={() => perform('reopened')} disabled={pending}>
                  <RotateCcw aria-hidden />
                  إعادة فتح
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              المستخدمان يملكان الصلاحيات نفسها. يُسجَّل اسم من قدّم ومن راجع ومن اعتمد، مع التاريخ والسبب.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>سجل القرارات</CardTitle>
          </CardHeader>
          <CardContent>
            {approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم تُتخذ قرارات تسليم بعد.</p>
            ) : (
              <ol className="space-y-3">
                {approvals.map((a) => {
                  const Icon = ACTION_ICON[a.action];
                  return (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <div>
                        <p>
                          <span className="font-medium">{APPROVAL_ACTION_LABEL[a.action]}</span> — {userName(a.userId)}
                        </p>
                        {a.reason && <p className="whitespace-pre-wrap text-muted-foreground">{a.reason}</p>}
                        <p className="text-xs text-muted-foreground">{formatDateTime(a.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
