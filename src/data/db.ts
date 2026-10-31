import Dexie, { type Table } from 'dexie';
import type {
  ActivityLog,
  AppNotification,
  Approval,
  BacklogIdea,
  Category,
  ChecklistItem,
  Deliverable,
  DeliverableVersion,
  Settings,
  StoredBlob,
  Task,
  TaskStep,
  TaskUpdate,
  User,
} from '@/types/entities';

export const DB_NAME = 'maham';

/**
 * سجل الترحيلات (Migrations):
 * عند تغيير البنية أضف نسخة جديدة بالأسفل دون تعديل النسخ السابقة، مثال:
 *
 *   this.version(2).stores({ tasks: 'id, status, ..., newIndex' })
 *     .upgrade(tx => tx.table('tasks').toCollection().modify(t => { t.newField = default }));
 *
 * ثم حدّث SCHEMA_VERSION و migrateBackupData في backupService لدعم استيراد النسخ الأقدم.
 */
export const SCHEMA_VERSION = 1;

export const TABLE_NAMES = [
  'users',
  'categories',
  'tasks',
  'steps',
  'updates',
  'deliverables',
  'deliverableVersions',
  'blobs',
  'checklist',
  'approvals',
  'ideas',
  'notifications',
  'activity',
  'settings',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export class MahamDB extends Dexie {
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  tasks!: Table<Task, string>;
  steps!: Table<TaskStep, string>;
  updates!: Table<TaskUpdate, string>;
  deliverables!: Table<Deliverable, string>;
  deliverableVersions!: Table<DeliverableVersion, string>;
  blobs!: Table<StoredBlob, string>;
  checklist!: Table<ChecklistItem, string>;
  approvals!: Table<Approval, string>;
  ideas!: Table<BacklogIdea, string>;
  notifications!: Table<AppNotification, string>;
  activity!: Table<ActivityLog, string>;
  settings!: Table<Settings, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      users: 'id',
      categories: 'id',
      tasks: 'id, status, submissionStatus, assigneeId, categoryId, dueDate, updatedAt, sourceIdeaId',
      steps: 'id, taskId',
      updates: 'id, taskId, createdAt',
      deliverables: 'id, taskId',
      deliverableVersions: 'id, deliverableId, taskId',
      blobs: 'id',
      checklist: 'id, taskId',
      approvals: 'id, taskId',
      ideas: 'id, status',
      notifications: 'id, &dedupeKey, taskId, createdAt',
      activity: 'id, taskId, at',
      settings: 'id',
    });
  }
}

let instance: MahamDB | null = null;

export function getDb(): MahamDB {
  if (!instance) instance = new MahamDB();
  return instance;
}

/** للاختبارات فقط: إعادة تهيئة قاعدة بيانات نظيفة */
export async function resetDbForTests(): Promise<MahamDB> {
  if (instance) {
    instance.close();
    await Dexie.delete(instance.name);
  }
  instance = new MahamDB();
  return instance;
}
