import { z } from 'zod';
import { PRIORITIES } from '@/types/entities';

export type AIScope = 'task' | 'portfolio' | 'idea';

export const AI_ACTION_IDS = [
  'suggest_steps',
  'improve_description',
  'analyze_blockers',
  'corrective_actions',
  'executive_summary',
  'monthly_report',
  'idea_to_plan',
  'prioritize',
  'analyze_overdue',
  'next_tasks',
] as const;
export type AIActionId = (typeof AI_ACTION_IDS)[number];

const str = z.string().trim().min(1).max(5000);
const optStr = z.string().max(5000).optional().default('');
const weight = z.coerce.number().min(0).max(1000).catch(1);
const priority = z.enum(PRIORITIES).catch('medium');
const list = z.array(z.string().trim().min(1).max(2000)).max(50).default([]);

export const AI_SCHEMAS = {
  suggest_steps: z.object({
    steps: z.array(z.object({ title: str.max(200), description: optStr, weight })).min(1).max(30),
  }),
  improve_description: z.object({ description: str.max(10_000) }),
  analyze_blockers: z.object({
    summary: str,
    causes: z.array(z.object({ cause: str, evidence: optStr, impact: optStr })).max(20).default([]),
  }),
  corrective_actions: z.object({
    actions: z.array(z.object({ title: str.max(200), description: optStr, dueInDays: z.coerce.number().int().min(0).max(365).optional() })).min(1).max(20),
  }),
  executive_summary: z.object({ summary: str, highlights: list, risks: list }),
  monthly_report: z.object({ title: str.max(200), summary: str, achievements: list, delays: list, recommendations: list }),
  idea_to_plan: z.object({
    title: str.max(200),
    description: str.max(10_000),
    priority: priority.optional(),
    steps: z.array(z.object({ title: str.max(200), description: optStr, weight })).min(1).max(30),
  }),
  prioritize: z.object({
    items: z.array(z.object({ taskId: z.string().min(1), priority, reason: optStr })).min(1).max(200),
  }),
  analyze_overdue: z.object({
    summary: str,
    items: z.array(z.object({ taskId: z.string().min(1), reason: optStr, recommendation: optStr })).max(200).default([]),
  }),
  next_tasks: z.object({
    tasks: z.array(z.object({ title: str.max(200), description: optStr, priority: priority.optional(), reason: optStr })).min(1).max(20),
  }),
} satisfies Record<AIActionId, z.ZodType>;

export type AIResult<A extends AIActionId> = z.output<(typeof AI_SCHEMAS)[A]>;

export interface AIActionDef {
  id: AIActionId;
  label: string;
  description: string;
  scope: AIScope;
  /** وصف بنية الإخراج المطلوبة من النموذج */
  outputSpec: string;
  instruction: string;
}

export const AI_ACTIONS: AIActionDef[] = [
  {
    id: 'suggest_steps',
    label: 'اقتراح خطوات التنفيذ',
    description: 'خطوات عملية موزونة لإنجاز المهمة',
    scope: 'task',
    instruction: 'اقترح من 3 إلى 8 خطوات تنفيذية عملية ومتسلسلة لإنجاز المهمة، مع وزن نسبي لكل خطوة يعكس حجم الجهد.',
    outputSpec: '{"steps":[{"title":"عنوان الخطوة","description":"وصف مختصر","weight":1}]}',
  },
  {
    id: 'improve_description',
    label: 'تحسين وصف المهمة',
    description: 'صياغة وصف واضح بالأهداف والنطاق ومعايير الإنجاز',
    scope: 'task',
    instruction: 'أعد صياغة وصف المهمة ليكون واضحًا ومختصرًا ويتضمن: الهدف، النطاق، المخرجات المتوقعة، ومعايير الإنجاز. لا تخترع معلومات غير موجودة.',
    outputSpec: '{"description":"الوصف المحسّن"}',
  },
  {
    id: 'analyze_blockers',
    label: 'تحليل أسباب التعثر',
    description: 'تحليل التحديات المسجلة وأثرها',
    scope: 'task',
    instruction: 'حلّل أسباب تعثر المهمة استنادًا إلى التحديثات والتحديات المسجلة والتواريخ ونسبة الإنجاز. اذكر الأدلة من البيانات.',
    outputSpec: '{"summary":"خلاصة","causes":[{"cause":"السبب","evidence":"الدليل من البيانات","impact":"الأثر"}]}',
  },
  {
    id: 'corrective_actions',
    label: 'اقتراح إجراءات تصحيحية',
    description: 'إجراءات عملية لإعادة المهمة إلى المسار',
    scope: 'task',
    instruction: 'اقترح إجراءات تصحيحية عملية ومحددة لإعادة المهمة إلى مسارها، مع مهلة مقترحة بالأيام.',
    outputSpec: '{"actions":[{"title":"الإجراء","description":"التفاصيل","dueInDays":3}]}',
  },
  {
    id: 'executive_summary',
    label: 'ملخص تنفيذي',
    description: 'ملخص للإدارة عن الوضع الحالي للمهام',
    scope: 'portfolio',
    instruction: 'اكتب ملخصًا تنفيذيًا موجزًا لحالة المهام الحالية موجهًا للإدارة، مع أبرز الإنجازات والمخاطر.',
    outputSpec: '{"summary":"الملخص","highlights":["نقطة"],"risks":["خطر"]}',
  },
  {
    id: 'monthly_report',
    label: 'تقرير شهري',
    description: 'تقرير أداء الشهر الحالي',
    scope: 'portfolio',
    instruction: 'أعد تقريرًا شهريًا عن أداء المهام في الشهر الحالي: الإنجازات، التأخيرات وأسبابها، والتوصيات للشهر القادم. استند إلى الأرقام المرفقة فقط.',
    outputSpec: '{"title":"عنوان التقرير","summary":"الملخص","achievements":["إنجاز"],"delays":["تأخير"],"recommendations":["توصية"]}',
  },
  {
    id: 'idea_to_plan',
    label: 'تحويل فكرة إلى خطة عمل',
    description: 'خطة تنفيذية بخطوات موزونة من فكرة في البنك',
    scope: 'idea',
    instruction: 'حوّل الفكرة إلى خطة عمل قابلة للتنفيذ: عنوان مهمة واضح، وصف يتضمن الهدف والنطاق، أولوية مقترحة، وخطوات موزونة.',
    outputSpec: '{"title":"عنوان المهمة","description":"الوصف","priority":"medium","steps":[{"title":"خطوة","description":"","weight":1}]}',
  },
  {
    id: 'prioritize',
    label: 'تقييم أولويات المهام',
    description: 'إعادة ترتيب الأولويات وفق الأثر والاستحقاق',
    scope: 'portfolio',
    instruction: 'قيّم أولوية كل مهمة مفتوحة (low/medium/high/urgent) بناءً على الاستحقاق والتأخر والأثر، مع سبب مختصر. استخدم taskId كما هو تمامًا.',
    outputSpec: '{"items":[{"taskId":"المعرّف كما ورد","priority":"high","reason":"السبب"}]}',
  },
  {
    id: 'analyze_overdue',
    label: 'تحليل المهام المتأخرة',
    description: 'أسباب التأخر وتوصيات لكل مهمة',
    scope: 'portfolio',
    instruction: 'حلّل المهام المتأخرة: السبب المرجح لكل مهمة وتوصية عملية. استخدم taskId كما هو تمامًا.',
    outputSpec: '{"summary":"خلاصة","items":[{"taskId":"المعرّف","reason":"السبب","recommendation":"التوصية"}]}',
  },
  {
    id: 'next_tasks',
    label: 'اقتراح المهام التالية',
    description: 'مهام جديدة منطقية بناءً على العمل الحالي',
    scope: 'portfolio',
    instruction: 'اقترح من 3 إلى 6 مهام تالية منطقية بناءً على المهام الحالية والمكتملة والأفكار، مع سبب كل اقتراح.',
    outputSpec: '{"tasks":[{"title":"المهمة","description":"","priority":"medium","reason":"السبب"}]}',
  },
];

export const getAction = (id: AIActionId) => AI_ACTIONS.find((a) => a.id === id)!;
