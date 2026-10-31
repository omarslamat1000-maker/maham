import { z } from 'zod';
import { DELIVERABLE_KINDS, PRIORITIES, STEP_STATUSES } from '@/types/entities';
import { isValidDateOnly } from '@/utils/date';

const dateOnly = z
  .string()
  .refine((s) => isValidDateOnly(s), { message: 'تاريخ غير صالح' });

const nullableDate = z.preprocess((v) => (v === '' || v === undefined ? null : v), dateOnly.nullable());
const nullableId = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().min(1).nullable());

/** يقبل روابط http/https فقط لمنع روابط javascript: وغيرها */
export const safeUrl = z
  .string()
  .trim()
  .max(2000, 'الرابط طويل جدًا')
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'أدخل رابطًا صالحًا يبدأ بـ https://');

const datesOrdered = (v: { startDate: string | null; dueDate: string | null }) =>
  !v.startDate || !v.dueDate || v.dueDate >= v.startDate;

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان المهمة إلزامي').max(200, 'العنوان طويل جدًا (200 حرف كحد أقصى)'),
    description: z.string().max(10_000, 'الوصف طويل جدًا').default(''),
    categoryId: nullableId.default(null),
    project: z.string().trim().max(120).default(''),
    entity: z.string().trim().max(120).default(''),
    assigneeId: nullableId.default(null),
    priority: z.enum(PRIORITIES).default('medium'),
    startDate: nullableDate.default(null),
    dueDate: nullableDate.default(null),
  })
  .refine(datesOrdered, { message: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية', path: ['dueDate'] });

export type TaskInput = z.input<typeof taskInputSchema>;
export type TaskInputParsed = z.output<typeof taskInputSchema>;

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1, 'عنوان المهمة إلزامي').max(200).optional(),
  description: z.string().max(10_000).optional(),
  categoryId: nullableId.optional(),
  project: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(120).optional(),
  assigneeId: nullableId.optional(),
  priority: z.enum(PRIORITIES).optional(),
  startDate: nullableDate.optional(),
  dueDate: nullableDate.optional(),
});
export type TaskPatch = z.input<typeof taskPatchSchema>;

export const percent = z.coerce
  .number({ message: 'قيمة رقمية مطلوبة' })
  .min(0, 'لا يمكن أن تكون النسبة سالبة')
  .max(100, 'لا يمكن أن تتجاوز النسبة 100%');

export const weight = z.coerce
  .number({ message: 'قيمة رقمية مطلوبة' })
  .min(0, 'لا يمكن أن يكون الوزن سالبًا')
  .max(1000, 'الوزن كبير جدًا');

export const stepInputSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان الخطوة إلزامي').max(200),
    description: z.string().max(5000).default(''),
    assigneeId: nullableId.default(null),
    startDate: nullableDate.default(null),
    dueDate: nullableDate.default(null),
    weight: weight.default(1),
    progress: percent.default(0),
    status: z.enum(STEP_STATUSES).optional(),
    notes: z.string().max(5000).default(''),
  })
  .refine(datesOrdered, { message: 'تاريخ الاستحقاق يجب أن يكون بعد البداية', path: ['dueDate'] });
export type StepInput = z.input<typeof stepInputSchema>;

export const manualProgressSchema = z.object({
  value: percent,
  reason: z.string().trim().min(3, 'اكتب سبب التعديل اليدوي (3 أحرف على الأقل)').max(500),
});

export const updateInputSchema = z.object({
  date: dateOnly,
  description: z.string().trim().min(1, 'وصف التحديث إلزامي').max(5000),
  progressAtUpdate: percent,
  challenges: z.string().max(3000).default(''),
  nextAction: z.string().max(1000).default(''),
});
export type UpdateInput = z.input<typeof updateInputSchema>;

export const ideaInputSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الفكرة إلزامي').max(200),
  description: z.string().max(5000).default(''),
  categoryId: nullableId.default(null),
  priority: z.enum(PRIORITIES).default('medium'),
  expectedValue: z.enum(['low', 'medium', 'high']).default('medium'),
  notes: z.string().max(5000).default(''),
});
export type IdeaInput = z.input<typeof ideaInputSchema>;

export const deliverableInputSchema = z.object({
  name: z.string().trim().min(1, 'اسم المخرج إلزامي').max(200),
  kind: z.enum(DELIVERABLE_KINDS),
  description: z.string().max(3000).default(''),
  isFinal: z.boolean().default(false),
});
export type DeliverableInput = z.input<typeof deliverableInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'اسم التصنيف إلزامي').max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح'),
});

/** تحويل أخطاء Zod إلى رسالة عربية واحدة مقروءة */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'بيانات غير صالحة';
}
