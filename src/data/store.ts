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
  const store: DataStore = {
    users: new DexieRepository(db.users),
    categories: new DexieRepository(db.categories),
    tasks: new DexieRepository(db.tasks),
    steps: new DexieRepository(db.steps),
    updates: new DexieRepository(db.updates),
    deliverables: new DexieRepository(db.deliverables),
    deliverableVersions: new DexieRepository(db.deliverableVersions),
    blobs: new DexieRepository(db.blobs),
    checklist: new DexieRepository(db.checklist),
    approvals: new DexieRepository(db.approvals),
    ideas: new DexieRepository(db.ideas),
    notifications: new DexieRepository(db.notifications),
    activity: new DexieRepository(db.activity),
    settings: new DexieRepository(db.settings),
    transaction: (fn) => db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), fn),
  };
  cached = { db, store };
  return store;
}
