import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Check, ClipboardCopy, ExternalLink, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingBlock, PageHeader } from '@/components/ui/misc';
import { PriorityBadge } from '@/components/tasks/badges';
import { useAction, useIdeas, useLookups, useTasks } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { AI_ACTIONS, getAction, type AIActionId, type AIResult } from '@/services/ai/actions';
import { buildPrompt } from '@/services/ai/promptBuilder';
import { parseAIResponse } from '@/services/ai/parser';
import { getProviders } from '@/services/ai/providers';
import { aiApplyService } from '@/services/ai/applyService';
import { stepService } from '@/services/stepService';
import { updateService } from '@/services/updateService';
import { downloadText } from '@/utils/file';
import { PRIORITY_LABEL } from '@/utils/labels';
import { cn } from '@/utils/cn';

type AnyResult = AIResult<AIActionId>;

/** تحويل النتائج النصية إلى Markdown للنسخ/التنزيل/الحفظ كتحديث */
function resultToText(action: AIActionId, r: AnyResult): string {
  const list = (title: string, xs: string[]) => (xs.length ? `\n## ${title}\n${xs.map((x) => `- ${x}`).join('\n')}` : '');
  switch (action) {
    case 'analyze_blockers': {
      const d = r as AIResult<'analyze_blockers'>;
      return `${d.summary}\n${d.causes.map((c) => `- ${c.cause}${c.evidence ? ` (الدليل: ${c.evidence})` : ''}${c.impact ? ` — الأثر: ${c.impact}` : ''}`).join('\n')}`;
    }
    case 'executive_summary': {
      const d = r as AIResult<'executive_summary'>;
      return `# ملخص تنفيذي\n${d.summary}${list('أبرز النقاط', d.highlights)}${list('المخاطر', d.risks)}`;
    }
    case 'monthly_report': {
      const d = r as AIResult<'monthly_report'>;
      return `# ${d.title}\n${d.summary}${list('الإنجازات', d.achievements)}${list('التأخيرات', d.delays)}${list('التوصيات', d.recommendations)}`;
    }
    case 'analyze_overdue': {
      const d = r as AIResult<'analyze_overdue'>;
      return `${d.summary}\n${d.items.map((i) => `- ${i.reason} → ${i.recommendation}`).join('\n')}`;
    }
    default:
      return JSON.stringify(r, null, 2);
  }
}

export default function AiPage() {
  const [params] = useSearchParams();
  const tasks = useTasks();
  const ideas = useIdeas();
  const { users, categories } = useLookups();
  const providers = useMemo(() => getProviders(), []);

  const [action, setAction] = useState<AIActionId>(params.get('idea') ? 'idea_to_plan' : params.get('task') ? 'suggest_steps' : 'executive_summary');
  const [taskId, setTaskId] = useState(params.get('task') ?? '');
  const [ideaId, setIdeaId] = useState(params.get('idea') ?? '');
  const [anonymize, setAnonymize] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [result, setResult] = useState<{ action: AIActionId; data: AnyResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const def = getAction(action);
  useEffect(() => {
    setPrompt('');
    setResult(null);
    setError(null);
  }, [action, taskId, ideaId, anonymize]);

  if (!tasks || !ideas) return <LoadingBlock rows={4} />;

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const openIdeas = ideas.filter((i) => i.status === 'open');
  const needsTask = def.scope === 'task' && !taskId;
  const needsIdea = def.scope === 'idea' && !ideaId;

  const generate = async () => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      const [steps, updates] = task ? await Promise.all([stepService.list(task.id), updateService.list(task.id)]) : [[], []];
      setPrompt(
        buildPrompt(action, {
          task,
          steps,
          updates,
          idea: ideas.find((i) => i.id === ideaId),
          tasks,
          ideas,
          users,
          categories,
          anonymize,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('تم نسخ البرومبت');
    } catch {
      toast.error('تعذّر النسخ تلقائيًا — حدّد النص وانسخه يدويًا');
    }
  };

  const parse = () => {
    const r = parseAIResponse(action, response);
    if (r.ok) {
      setResult({ action, data: r.data });
      setError(null);
    } else {
      setResult(null);
      setError(r.error);
    }
  };

  return (
    <div>
      <PageHeader title="MAHAM AI" description="مساعد ذكي يعمل مع Google Gemini — لا يُطبَّق أي تغيير دون موافقتك." />

      <div className="mb-5 flex gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">الوضع الحالي: {providers[0].label}</p>
          <p className="text-muted-foreground">
            لا تُخزَّن مفاتيح API في التطبيق. يُنشأ برومبت يتضمن الحد الأدنى من بيانات المهام، تنسخه إلى Gemini بنفسك ثم تلصق الرد هنا ليُتحقق منه.
            انتبه: نسخ البرومبت إلى Gemini يعني إرسال هذه البيانات إلى Google.
          </p>
        </div>
      </div>

      <section aria-label="اختيار الإجراء" className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {AI_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAction(a.id)}
            aria-pressed={action === a.id}
            className={cn(
              'rounded-xl border p-3 text-start transition-colors',
              action === a.id ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden />
              {a.label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
          </button>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. إنشاء البرومبت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {def.scope === 'task' && (
              <Field label="المهمة" htmlFor="ai-task" required>
                <Select id="ai-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">اختر مهمة…</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {def.scope === 'idea' && (
              <Field label="الفكرة" htmlFor="ai-idea" required>
                <Select id="ai-idea" value={ideaId} onChange={(e) => setIdeaId(e.target.value)}>
                  <option value="">اختر فكرة…</option>
                  {openIdeas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {def.scope === 'portfolio' && <p className="text-sm text-muted-foreground">يُستخدم ملخص المهام الحالية ({tasks.length} مهمة).</p>}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)} />
              إخفاء أسماء المستخدمين في البرومبت
            </label>
            <Button onClick={generate} disabled={needsTask || needsIdea}>
              <Wand2 aria-hidden />
              إنشاء البرومبت
            </Button>
            {prompt && (
              <div className="space-y-2">
                <Textarea readOnly value={prompt} rows={10} dir="auto" className="font-mono text-xs" aria-label="البرومبت" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="soft" onClick={copy}>
                    <ClipboardCopy aria-hidden />
                    نسخ البرومبت
                  </Button>
                  <Button asChild variant="outline">
                    <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      فتح Gemini
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. لصق رد Gemini</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={10}
              dir="auto"
              placeholder='الصق رد Gemini هنا (JSON)… مثال: {"steps":[...]}'
              aria-label="رد Gemini"
              className="font-mono text-xs"
            />
            <Button onClick={parse} disabled={!response.trim()}>
              <Check aria-hidden />
              تحليل الرد والتحقق منه
            </Button>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>3. مراجعة النتيجة واعتمادها</CardTitle>
            <Badge tone="success">تم التحقق من البنية</Badge>
          </CardHeader>
          <CardContent>
            <ResultView action={result.action} data={result.data} taskId={taskId} ideaId={ideaId} onDone={() => (setResult(null), setResponse(''))} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultView({ action, data, taskId, ideaId, onDone }: { action: AIActionId; data: AnyResult; taskId: string; ideaId: string; onDone: () => void }) {
  const allTasks = useTasks();
  const tasks = useMemo(() => allTasks ?? [], [allTasks]);
  const { run, pending } = useAction();
  const navigate = useNavigate();
  const items = useMemo(() => {
    switch (action) {
      case 'suggest_steps':
        return (data as AIResult<'suggest_steps'>).steps;
      case 'corrective_actions':
        return (data as AIResult<'corrective_actions'>).actions;
      case 'prioritize':
        return (data as AIResult<'prioritize'>).items.filter((i) => tasks.some((t) => t.id === i.taskId));
      case 'next_tasks':
        return (data as AIResult<'next_tasks'>).tasks;
      default:
        return null;
    }
  }, [action, data, tasks]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(items?.map((_, i) => i) ?? []));
  const toggle = (i: number) => setSelected((s) => (s.has(i) ? (s.delete(i), new Set(s)) : new Set(s.add(i))));
  const pick = <T,>(xs: T[]) => xs.filter((_, i) => selected.has(i));

  const approve = async (label: string, fn: () => Promise<unknown>) => {
    if (!(await confirmDialog({ title: 'تأكيد تطبيق التغييرات', description: label, confirmText: 'تطبيق' }))) return;
    const r = await run(fn, 'تم تطبيق التغييرات');
    if (r !== false) onDone();
  };

  if (action === 'improve_description') {
    const d = data as AIResult<'improve_description'>;
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-wrap">{d.description}</p>
        <Button loading={pending} onClick={() => approve('سيُستبدل وصف المهمة الحالي بالوصف المقترح.', () => aiApplyService.replaceDescription(taskId, d.description))}>
          استبدال الوصف
        </Button>
      </div>
    );
  }

  if (action === 'idea_to_plan') {
    const d = data as AIResult<'idea_to_plan'>;
    return (
      <div className="space-y-3 text-sm">
        <p className="text-base font-semibold">{d.title}</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{d.description}</p>
        <ol className="list-inside list-decimal space-y-1">
          {d.steps.map((s, i) => (
            <li key={i}>
              {s.title} <span className="text-xs text-muted-foreground">(الوزن {s.weight})</span>
            </li>
          ))}
        </ol>
        <Button
          loading={pending}
          onClick={async () => {
            if (!(await confirmDialog({ title: 'إنشاء مهمة من الخطة؟', description: 'ستُحوَّل الفكرة إلى مهمة بهذه الخطوات.', confirmText: 'إنشاء' }))) return;
            const t = await run(() => aiApplyService.ideaToPlan(ideaId, d), 'تم إنشاء المهمة');
            if (t) navigate(`/tasks/${t.id}?tab=steps`);
          }}
        >
          إنشاء المهمة بالخطة
        </Button>
      </div>
    );
  }

  if (items) {
    return (
      <div className="space-y-3">
        <ul className="space-y-2">
          {items.map((it, i) => {
            const any = it as { title?: string; description?: string; weight?: number; priority?: string; reason?: string; taskId?: string; dueInDays?: number };
            const task = any.taskId ? tasks.find((t) => t.id === any.taskId) : undefined;
            return (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.has(i)} onChange={() => toggle(i)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{task?.title ?? any.title}</p>
                    {any.description && <p className="text-muted-foreground">{any.description}</p>}
                    {any.reason && <p className="text-xs text-muted-foreground">السبب: {any.reason}</p>}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {any.weight !== undefined && <Badge>الوزن {any.weight}</Badge>}
                      {any.dueInDays !== undefined && <Badge>خلال {any.dueInDays} يوم</Badge>}
                      {any.priority && <PriorityBadge priority={any.priority as never} />}
                      {task && task.priority !== any.priority && <span className="text-xs text-muted-foreground">(حاليًا: {PRIORITY_LABEL[task.priority]})</span>}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
        {items.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عناصر قابلة للتطبيق (قد تكون المعرّفات غير مطابقة).</p>}
        <Button
          loading={pending}
          disabled={selected.size === 0}
          onClick={() => {
            if (action === 'suggest_steps')
              return approve(`ستُضاف ${selected.size} خطوة إلى المهمة.`, () => aiApplyService.addSteps(taskId, pick((data as AIResult<'suggest_steps'>).steps)));
            if (action === 'corrective_actions')
              return approve(`ستُضاف ${selected.size} إجراءات كخطوات تنفيذية.`, () =>
                aiApplyService.addCorrectiveActionsAsSteps(taskId, pick((data as AIResult<'corrective_actions'>).actions)),
              );
            if (action === 'prioritize') return approve(`ستُحدَّث أولويات ${selected.size} مهمة.`, () => aiApplyService.applyPriorities(pick(items as AIResult<'prioritize'>['items'])));
            if (action === 'next_tasks') return approve(`ستُنشأ ${selected.size} مهام جديدة.`, () => aiApplyService.createTasks(pick((data as AIResult<'next_tasks'>).tasks)));
          }}
        >
          تطبيق العناصر المحددة ({selected.size})
        </Button>
      </div>
    );
  }

  const text = resultToText(action, data);
  return (
    <div className="space-y-3">
      <pre className="max-h-96 overflow-auto rounded-lg bg-muted/60 p-3 font-sans text-sm whitespace-pre-wrap">{text}</pre>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ'))}>
          <ClipboardCopy aria-hidden />
          نسخ
        </Button>
        <Button variant="outline" onClick={() => downloadText(text, `maham-ai-${action}.md`, 'text/markdown;charset=utf-8')}>
          تنزيل Markdown
        </Button>
        {taskId && getAction(action).scope === 'task' && (
          <Button loading={pending} onClick={() => approve('سيُحفظ التحليل كتحديث على المهمة.', () => aiApplyService.saveAsUpdate(taskId, text))}>
            حفظ كتحديث على المهمة
          </Button>
        )}
        {taskId && getAction(action).scope === 'task' && (
          <Button asChild variant="ghost">
            <Link to={`/tasks/${taskId}`}>فتح المهمة</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
