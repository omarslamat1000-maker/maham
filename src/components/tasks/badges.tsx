import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock, Flame, Hourglass, RotateCcw, Send } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/misc';
import type { Priority, SubmissionStatus, TaskStatus } from '@/types/entities';
import { PRIORITY_LABEL, STATUS_LABEL, SUBMISSION_LABEL } from '@/utils/labels';
import { URGENCY_REASON_LABEL, type UrgencyReason } from '@/domain/urgency';

const statusTone: Record<TaskStatus, Tone> = { new: 'info', in_progress: 'primary', completed: 'success' };
const statusIcon = { new: Circle, in_progress: CircleDot, completed: CheckCircle2 };

export function StatusBadge({ status }: { status: TaskStatus }) {
  const Icon = statusIcon[status];
  return (
    <Badge tone={statusTone[status]}>
      <Icon aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const priorityTone: Record<Priority, Tone> = { low: 'neutral', medium: 'secondary', high: 'warning', urgent: 'danger' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={priorityTone[priority]}>
      {priority === 'urgent' && <Flame aria-hidden />}
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

const subTone: Record<SubmissionStatus, Tone> = {
  not_submitted: 'neutral',
  submitted: 'info',
  changes_requested: 'warning',
  approved: 'success',
};
const subIcon = { not_submitted: Clock, submitted: Send, changes_requested: RotateCcw, approved: CheckCircle2 };

export function SubmissionBadge({ status, hideDefault }: { status: SubmissionStatus; hideDefault?: boolean }) {
  if (hideDefault && status === 'not_submitted') return null;
  const Icon = subIcon[status];
  return (
    <Badge tone={subTone[status]}>
      <Icon aria-hidden />
      {SUBMISSION_LABEL[status]}
    </Badge>
  );
}

const reasonTone: Record<UrgencyReason, Tone> = { overdue: 'danger', high_priority: 'warning', due_soon: 'info', stale: 'neutral' };
const reasonIcon = { overdue: AlertTriangle, high_priority: Flame, due_soon: Clock, stale: Hourglass };

export function UrgencyBadge({ reason }: { reason: UrgencyReason }) {
  const Icon = reasonIcon[reason];
  return (
    <Badge tone={reasonTone[reason]}>
      <Icon aria-hidden />
      {URGENCY_REASON_LABEL[reason]}
    </Badge>
  );
}
