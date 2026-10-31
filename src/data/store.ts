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
import { getDb, TABLE_NAMES } from './db';
import { DexieRepository, type Repository } from './repository';
import { EncryptedBlobRepository, EncryptedRepository } from './encryptedRepository';

/** حاوية المستودعات — نقطة الوصول الوحيدة للبيانات من طبقة الخدمات */
export interface DataStore {
  users: Repository<User>;
  categories: Repository<Category>;
  tasks: Repository<Task>;
  steps: Repository<TaskStep>;
  updates: Repository<TaskUpdate>;
  deliverables: Repository<Deliverable>;
  deliverableVersions: Repository<DeliverableVersion>;
  blobs: Repository<StoredBlob>;
  checklist: Repository<ChecklistItem>;
  approvals: Repository<Approval>;
  ideas: Repository<BacklogIdea>;
  notifications: Repository<AppNotification>;
  activity: Repository<ActivityLog>;
  settings: Repository<Settings>;
  /** تنفيذ ذرّي: إما أن تنجح جميع العمليات أو تُلغى كلها */
  transaction<R>(fn: () => Promise<R>): Promise<R>;
}

let cached: { db: ReturnType<typeof getDb>; store: DataStore } | null = null;

export function getStore(): DataStore {
  const db = getDb();
  if (cached && cached.db === db) return cached.store;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enc = <T extends { id: string }>(table: any, plain: string[] = [], blind?: Record<string, string>) =>
    new EncryptedRepository<T>(table, { plain, blind });
  const store: DataStore = {
    // غير مشفّرة: مطلوبة قبل تسجيل الدخول (أسماء الملفات والتحقق من كلمات المرور) والإعدادات العامة
    users: new DexieRepository(db.users),
    settings: new DexieRepository(db.settings),
    // مشفّرة على القرص (AES-256-GCM)
    categories: enc(db.categories),
    tasks: enc(db.tasks),
    steps: enc(db.steps, ['taskId']),
    updates: enc(db.updates, ['taskId']),
    deliverables: enc(db.deliverables, ['taskId']),
    deliverableVersions: enc(db.deliverableVersions, ['deliverableId', 'taskId']),
    blobs: new EncryptedBlobRepository(db.blobs as never),
    checklist: enc(db.checklist, ['taskId']),
    approvals: enc(db.approvals, ['taskId']),
    ideas: enc(db.ideas),
    notifications: enc(db.notifications, ['taskId'], { dedupeKey: 'dedupeHash' }),
    activity: enc(db.activity, ['taskId']),
    transaction: (fn) => db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), fn),
  };
  cached = { db, store };
  return store;
}

/** الجداول المشفّرة — لترحيل البيانات القديمة غير المشفّرة */
export function encryptedRepos(): { encryptLegacyRows(): Promise<number> }[] {
  const s = getStore();
  return [s.categories, s.tasks, s.steps, s.updates, s.deliverables, s.deliverableVersions, s.checklist, s.approvals, s.ideas, s.notifications, s.activity, s.blobs] as unknown as {
    encryptLegacyRows(): Promise<number>;
  }[];
}
