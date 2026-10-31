import type {
  ApprovalAction,
  DeliverableApproval,
  DeliverableKind,
  ExpectedValue,
  IdeaStatus,
  NotificationType,
  Priority,
  StepStatus,
  SubmissionStatus,
  TaskStatus,
} from '@/types/entities';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
};

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  not_submitted: 'لم تُقدَّم',
  submitted: 'بانتظار المراجعة',
  changes_requested: 'مطلوب تعديلات',
  approved: 'معتمدة',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

export const PRIORITY_RANK: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'لم تبدأ',
  in_progress: 'جارية',
  done: 'منجزة',
};

export const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  word: 'Word',
  powerpoint: 'PowerPoint',
  excel: 'Excel',
  pdf: 'PDF',
  html: 'HTML',
  image: 'صورة',
  video_link: 'رابط فيديو',
  link: 'رابط خارجي',
  other: 'ملف آخر',
};

export const DELIVERABLE_APPROVAL_LABEL: Record<DeliverableApproval, string> = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

export const APPROVAL_ACTION_LABEL: Record<ApprovalAction, string> = {
  submitted: 'تقديم للمراجعة',
  approved: 'اعتماد',
  changes_requested: 'طلب تعديلات',
  reopened: 'إعادة فتح',
};

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  open: 'مفتوحة',
  archived: 'مؤرشفة',
  converted: 'حُوّلت إلى مهمة',
};

export const EXPECTED_VALUE_LABEL: Record<ExpectedValue, string> = {
  low: 'قيمة منخفضة',
  medium: 'قيمة متوسطة',
  high: 'قيمة عالية',
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  due_soon: 'مستحقة قريبًا',
  overdue: 'متأخرة',
  urgent: 'عاجلة',
  needs_review: 'تحتاج مراجعة',
  changes_requested: 'أعيدت للتعديل',
};

export const CATEGORY_COLORS = [
  '#059669',
  '#0f766e',
  '#0284c7',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#ca8a04',
  '#4b5563',
] as const;
