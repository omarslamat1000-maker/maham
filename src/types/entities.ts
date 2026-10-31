/**
 * نموذج البيانات الأساسي لتطبيق مهام.
 * جميع السجلات تستخدم UUID وتحمل حقول التدقيق (createdAt/updatedAt/createdBy/updatedBy).
 * التواريخ الزمنية بصيغة ISO 8601 كاملة، وتواريخ التقويم (بداية/استحقاق) بصيغة YYYY-MM-DD.
 */

export type ID = string;
/** تاريخ تقويمي بصيغة YYYY-MM-DD */
export type DateOnly = string;
/** طابع زمني بصيغة ISO 8601 */
export type Timestamp = string;

export interface AuditFields {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: ID;
  updatedBy: ID;
}

export interface SoftDeletable {
  /** null = غير محذوف. الحذف منطقي ويمكن الاسترجاع من الإعدادات */
  deletedAt: Timestamp | null;
}

// ───────────── المستخدمون ─────────────

/**
 * ملف عمل محلي — للتنظيم فقط وليس حسابًا موثّقًا مركزيًا.
 * الواجهة مصممة لتقبل الترقية لاحقًا إلى نظام مستخدمين حقيقي (authProviderId).
 */
export interface User extends AuditFields {
  name: string;
  title: string;
  role: 'admin';
  color: string;
  /** محجوز للترقية المستقبلية إلى مصادقة خادمية */
  authProviderId: string | null;
  /**
   * قفل الدخول المحلي: بصمة كلمة المرور (PBKDF2-SHA-256) — لا تُخزَّن كلمة المرور نفسها أبدًا.
   * حقول اختيارية للتوافق مع السجلات والنسخ الاحتياطية الأقدم.
   */
  passwordHash?: string | null;
  passwordSalt?: string | null;
  passwordIterations?: number | null;
  passwordUpdatedAt?: Timestamp | null;
  failedAttempts?: number;
  lockedUntil?: Timestamp | null;
  lastLoginAt?: Timestamp | null;
  /** 2 = بصمة HKDF منفصلة عن مفتاح التغليف (الإصدار 1 كان يخزن ناتج PBKDF2 مباشرة) */
  passwordVersion?: number;
  /** المفتاح الرئيسي للبيانات مغلّفًا بمفتاح مشتق من كلمة مرور هذا الملف */
  wrappedKey?: { iv: string; ct: string } | null;
  /** يجب تغيير كلمة المرور (مؤقتة) عند الدخول التالي */
  mustChangePassword?: boolean;
}

// ───────────── التصنيفات ─────────────

export interface Category extends AuditFields, SoftDeletable {
  name: string;
  color: string;
}

// ───────────── المهام ─────────────

export const TASK_STATUSES = ['new', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const SUBMISSION_STATUSES = ['not_submitted', 'submitted', 'changes_requested', 'approved'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Task extends AuditFields, SoftDeletable {
  title: string;
  description: string;
  categoryId: ID | null;
  project: string;
  entity: string;
  assigneeId: ID | null;
  priority: Priority;
  startDate: DateOnly | null;
  dueDate: DateOnly | null;
  status: TaskStatus;
  submissionStatus: SubmissionStatus;
  /** نسبة الإنجاز المحسوبة آليًا من الخطوات (null = لا توجد خطوات) */
  computedProgress: number | null;
  /** تعديل يدوي اختياري — يُحفظ منفصلًا عن القيمة المحسوبة */
  manualProgress: number | null;
  manualProgressReason: string | null;
  manualProgressBy: ID | null;
  manualProgressAt: Timestamp | null;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  submittedBy: ID | null;
  submittedAt: Timestamp | null;
  reviewedBy: ID | null;
  approvedBy: ID | null;
  /** آخر ملاحظات مراجعة (عند طلب التعديلات) */
  reviewNotes: string | null;
  /** آخر نشاط فعلي على المهمة — يستخدم لاكتشاف المهام غير المحدثة */
  lastActivityAt: Timestamp;
  sourceIdeaId: ID | null;
}

// ───────────── الخطوات التنفيذية ─────────────

export const STEP_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface TaskStep extends AuditFields {
  taskId: ID;
  title: string;
  description: string;
  assigneeId: ID | null;
  startDate: DateOnly | null;
  dueDate: DateOnly | null;
  /** وزن الخطوة (≥ 0). عند تساوي جميع الأوزان بالصفر تعامل الخطوات بأوزان متساوية */
  weight: number;
  /** نسبة إنجاز الخطوة 0–100 */
  progress: number;
  status: StepStatus;
  notes: string;
  order: number;
}

// ───────────── التحديثات ─────────────

export interface TaskUpdate extends AuditFields {
  taskId: ID;
  date: DateOnly;
  userId: ID;
  description: string;
  progressAtUpdate: number;
  challenges: string;
  nextAction: string;
  attachmentBlobId: ID | null;
  attachmentName: string | null;
  attachmentMime: string | null;
}

// ───────────── المخرجات ─────────────

export const DELIVERABLE_KINDS = ['word', 'powerpoint', 'excel', 'pdf', 'html', 'image', 'video_link', 'link', 'other'] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const DELIVERABLE_APPROVALS = ['pending', 'approved', 'rejected'] as const;
export type DeliverableApproval = (typeof DELIVERABLE_APPROVALS)[number];

export interface Deliverable extends AuditFields, SoftDeletable {
  taskId: ID;
  name: string;
  kind: DeliverableKind;
  description: string;
  /** رقم الإصدار الحالي */
  version: number;
  approvalStatus: DeliverableApproval;
  /** هل هذا هو المخرج النهائي للتسليم */
  isFinal: boolean;
  currentVersionId: ID | null;
}

export interface DeliverableVersion extends AuditFields {
  deliverableId: ID;
  taskId: ID;
  version: number;
  fileName: string | null;
  mimeType: string | null;
  size: number;
  blobId: ID | null;
  externalUrl: string | null;
  note: string;
}

/** محتوى الملفات الثنائية محفوظ في جدول منفصل (مشفّرًا على القرص) */
export interface StoredBlob {
  id: ID;
  data: Uint8Array;
  type: string;
  createdAt: Timestamp;
}

// ───────────── قائمة التحقق ─────────────

export type ChecklistAutoRule = 'all_steps_done' | 'final_deliverable';

export interface ChecklistItem extends AuditFields {
  taskId: ID;
  label: string;
  required: boolean;
  /** للعناصر اليدوية فقط */
  done: boolean;
  doneBy: ID | null;
  doneAt: Timestamp | null;
  /** قاعدة تحقق آلية — تُقيَّم من البيانات ولا تُعلَّم يدويًا */
  autoRule: ChecklistAutoRule | null;
  order: number;
}

// ───────────── الاعتمادات ─────────────

export const APPROVAL_ACTIONS = ['submitted', 'approved', 'changes_requested', 'reopened'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export interface Approval extends AuditFields {
  taskId: ID;
  action: ApprovalAction;
  userId: ID;
  reason: string;
  at: Timestamp;
}

// ───────────── بنك الأفكار ─────────────

export type IdeaStatus = 'open' | 'archived' | 'converted';
export type ExpectedValue = 'low' | 'medium' | 'high';

export interface BacklogIdea extends AuditFields, SoftDeletable {
  title: string;
  description: string;
  categoryId: ID | null;
  priority: Priority;
  expectedValue: ExpectedValue;
  notes: string;
  status: IdeaStatus;
  convertedTaskId: ID | null;
  convertedAt: Timestamp | null;
}

// ───────────── التنبيهات ─────────────

export const NOTIFICATION_TYPES = ['due_soon', 'overdue', 'urgent', 'needs_review', 'changes_requested'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: ID;
  type: NotificationType;
  taskId: ID | null;
  /** المستخدم المستهدف (null = للجميع) */
  userId: ID | null;
  title: string;
  message: string;
  read: boolean;
  /** مفتاح منع التكرار — تنبيه واحد لكل حدث */
  dedupeKey: string;
  createdAt: Timestamp;
}

// ───────────── سجل النشاط ─────────────

export type EntityType =
  | 'task'
  | 'step'
  | 'update'
  | 'deliverable'
  | 'checklist'
  | 'approval'
  | 'idea'
  | 'category'
  | 'user'
  | 'settings'
  | 'backup';

export interface ActivityLog {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  taskId: ID | null;
  action: string;
  userId: ID;
  /** وصف مقروء بالعربية */
  details: string;
  at: Timestamp;
}

// ───────────── الإعدادات ─────────────

export interface AppSettings {
  id: 'app';
  currentUserId: ID | null;
  /** عدد الأيام التي تعتبر فيها المهمة "قريبة الاستحقاق" */
  dueSoonDays: number;
  /** عدد الأيام دون تحديث لاعتبار المهمة "راكدة" */
  staleDays: number;
  /** 0 = الأحد، 6 = السبت */
  weekStartsOn: 0 | 1 | 6;
  browserNotifications: boolean;
  lastBackupAt: Timestamp | null;
  maxFileSizeMb: number;
  onboardingDismissed: boolean;
  /** القفل التلقائي بعد عدم النشاط بالدقائق (0 = معطّل) */
  autoLockMinutes?: number;
  /** حالة التشفير على القرص */
  encryption?: { version: number; enabledAt: Timestamp } | null;
}

export interface Settings extends AppSettings {
  updatedAt: Timestamp;
}
