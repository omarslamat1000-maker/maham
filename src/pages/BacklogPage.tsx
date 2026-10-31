import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Archive, ArchiveRestore, ArrowLeftRight, Lightbulb, MoreVertical, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlay';
import { PriorityBadge } from '@/components/tasks/badges';
import { useAction, useIdeas, useLookups } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { ideaService } from '@/services/ideaService';
import { matchesSearch } from '@/domain/taskQuery';
import { PRIORITIES, type BacklogIdea, type ExpectedValue, type IdeaStatus } from '@/types/entities';
import { EXPECTED_VALUE_LABEL, IDEA_STATUS_LABEL, PRIORITY_LABEL } from '@/utils/labels';
import { formatDateTime, relativeTime } from '@/utils/date';

export default function BacklogPage() {
  const ideas = useIdeas();
  const { category } = useLookups();
  const { run } = useAction();
  const navigate = useNavigate();
  const [status, setStatus] = useState<IdeaStatus>('open');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<BacklogIdea | 'new' | null>(null);

  const list = useMemo(
    () => (ideas ?? []).filter((i) => i.status === status && matchesSearch({ title: i.title, description: i.description, project: i.notes, entity: '' }, q)),
    [ideas, status, q],
  );

  const convert = async (idea: BacklogIdea) => {
    if (!(await confirmDialog({ title: 'تحويل الفكرة إلى مهمة؟', description: 'يُنقل العنوان والوصف، وتبقى الفكرة محفوظة مع رابط للمهمة.', confirmText: 'تحويل' }))) return;
    const task = await run(() => ideaService.convertToTask(idea.id), 'تم إنشاء المهمة من الفكرة');
    if (task) navigate(`/tasks/${task.id}`);
  };

  return (
    <div>
      <PageHeader
        title="بنك الأفكار"
        description="سجّل الأفكار والمبادرات، وحوّل الناضج منها إلى مهام."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            فكرة جديدة
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex rounded-lg border border-border bg-card p-1" role="tablist" aria-label="حالة الأفكار">
          {(['open', 'converted', 'archived'] as IdeaStatus[]).map((s) => (
            <button
              key={s}
              role="tab"
              type="button"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {IDEA_STATUS_LABEL[s]} <span className="tabular">({(ideas ?? []).filter((i) => i.status === s).length})</span>
            </button>
          ))}
        </div>
        <Input type="search" placeholder="ابحث في الأفكار…" aria-label="بحث في الأفكار" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
      </div>

      {!ideas ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={status === 'open' ? 'لا توجد أفكار مفتوحة' : 'لا يوجد شيء هنا'}
          description={status === 'open' ? 'دوّن فكرتك الآن قبل أن تضيع.' : undefined}
          action={
            status === 'open' ? (
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden />
                فكرة جديدة
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((idea) => {
            const cat = category(idea.categoryId);
            return (
              <li key={idea.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                  <h2 className="min-w-0 flex-1 font-semibold break-words">{idea.title}</h2>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`خيارات ${idea.title}`}>
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setEditing(idea)}>
                        <Pencil />
                        تعديل
                      </DropdownMenuItem>
                      {idea.status === 'open' && (
                        <DropdownMenuItem asChild>
                          <Link to={`/ai?idea=${idea.id}`}>
                            <Sparkles />
                            تحويلها إلى خطة بالذكاء الاصطناعي
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {idea.status !== 'converted' && (
                        <DropdownMenuItem onSelect={() => run(() => ideaService.setArchived(idea.id, idea.status === 'open'), idea.status === 'open' ? 'تمت الأرشفة' : 'تمت الاستعادة')}>
                          {idea.status === 'open' ? <Archive /> : <ArchiveRestore />}
                          {idea.status === 'open' ? 'أرشفة' : 'استعادة'}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          if (await confirmDialog({ title: 'حذف الفكرة؟', description: idea.title, destructive: true, confirmText: 'حذف' }))
                            await run(() => ideaService.remove(idea.id), 'تم حذف الفكرة');
                        }}
                      >
                        <Trash2 />
                        حذف
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {idea.description && <p className="line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">{idea.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <PriorityBadge priority={idea.priority} />
                  <Badge tone={idea.expectedValue === 'high' ? 'success' : idea.expectedValue === 'medium' ? 'secondary' : 'neutral'}>
                    {EXPECTED_VALUE_LABEL[idea.expectedValue]}
                  </Badge>
                  {cat && (
                    <Badge>
                      <span className="size-2 rounded-full" style={{ background: cat.color }} aria-hidden />
                      {cat.name}
                    </Badge>
                  )}
                </div>
                {idea.notes && <p className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">{idea.notes}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <span>{relativeTime(idea.createdAt)}</span>
                  {idea.status === 'open' && (
                    <Button size="sm" variant="soft" onClick={() => convert(idea)}>
                      <ArrowLeftRight aria-hidden />
                      تحويل إلى مهمة
                    </Button>
                  )}
                  {idea.status === 'converted' && idea.convertedTaskId && (
                    <Link to={`/tasks/${idea.convertedTaskId}`} className="font-medium text-primary hover:underline" title={formatDateTime(idea.convertedAt)}>
                      فتح المهمة ←
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <IdeaDialog idea={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function IdeaDialog({ idea, onClose }: { idea: BacklogIdea | 'new' | null; onClose: () => void }) {
  const { activeCategories } = useLookups();
  const { run, pending } = useAction();
  const blank = { title: '', description: '', categoryId: '', priority: 'medium' as BacklogIdea['priority'], expectedValue: 'medium' as ExpectedValue, notes: '' };
  const [v, setV] = useState(blank);
  useEffect(() => {
    if (idea === 'new') setV(blank);
    else if (idea) setV({ ...idea, categoryId: idea.categoryId ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea]);
  const set = <K extends keyof typeof blank>(k: K, val: (typeof blank)[K]) => setV((p) => ({ ...p, [k]: val }));

  return (
    <Dialog open={idea !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={idea === 'new' ? 'فكرة جديدة' : 'تعديل الفكرة'} wide>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = idea === 'new' ? await run(() => ideaService.create(v), 'تم حفظ الفكرة') : await run(() => ideaService.update((idea as BacklogIdea).id, v), 'تم الحفظ');
            if (r !== false) onClose();
          }}
        >
          <Field label="عنوان الفكرة" htmlFor="id-title" required className="sm:col-span-2">
            <Input id="id-title" autoFocus value={v.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="وصف مختصر" htmlFor="id-desc" className="sm:col-span-2">
            <Textarea id="id-desc" value={v.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="المجال" htmlFor="id-cat">
            <Select id="id-cat" value={v.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">بدون تصنيف</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الأولوية" htmlFor="id-priority">
            <Select id="id-priority" value={v.priority} onChange={(e) => set('priority', e.target.value as BacklogIdea['priority'])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="القيمة المتوقعة" htmlFor="id-value">
            <Select id="id-value" value={v.expectedValue} onChange={(e) => set('expectedValue', e.target.value as ExpectedValue)}>
              {(['low', 'medium', 'high'] as ExpectedValue[]).map((x) => (
                <option key={x} value={x}>
                  {EXPECTED_VALUE_LABEL[x]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ملاحظات" htmlFor="id-notes" className="sm:col-span-2">
            <Textarea id="id-notes" rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending} disabled={!v.title.trim()}>
              حفظ الفكرة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
