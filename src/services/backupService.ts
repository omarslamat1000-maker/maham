import { z } from 'zod';
import { SCHEMA_VERSION, TABLE_NAMES, type TableName } from '@/data/db';
import { getStore, type DataStore } from '@/data/store';
import type { Repository } from '@/data/repository';
import { PRIORITIES, SUBMISSION_STATUSES, TASK_STATUSES } from '@/types/entities';
import { base64ToBytes, bytesToBase64, decryptText, encryptText, sha256Hex, type EncryptedBlob } from '@/utils/crypto';
import { nowIso, toDateOnly } from '@/utils/date';
import { readFileAsText } from '@/utils/file';
import { actor, logActivity } from './core';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export const BACKUP_FORMAT = 1;
/** حد أعلى لحجم ملف الاستيراد لحماية المتصفح من التجمد */
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

type DataTable = Exclude<TableName, 'blobs'>;
const DATA_TABLES = TABLE_NAMES.filter((t): t is DataTable => t !== 'blobs');

export interface BlobRecord {
  id: string;
  mimeType: string;
  createdAt: string;
  base64: string;
}

export interface BackupPayload {
  tables: Record<DataTable, Record<string, unknown>[]>;
  blobs: BlobRecord[];
}

export interface BackupFile {
  app: 'maham';
  format: number;
  schemaVersion: number;
  exportedAt: string;
  exportedBy: string;
  includesFiles: boolean;
  checksum: string;
  payload: BackupPayload;
}

export interface EncryptedBackupFile extends EncryptedBlob {
  app: 'maham';
  format: number;
  encrypted: true;
}

// ───────────── التحقق من البنية ─────────────

const rec = z.looseObject({ id: z.string().min(1).max(200) });
const auditRec = rec.extend({ createdAt: z.string(), updatedAt: z.string() });

const tableSchemas: Record<DataTable, z.ZodType> = {
  users: auditRec.extend({ name: z.string() }),
  categories: auditRec.extend({ name: z.string() }),
  tasks: auditRec.extend({
    title: z.string(),
    status: z.enum(TASK_STATUSES),
    submissionStatus: z.enum(SUBMISSION_STATUSES),
    priority: z.enum(PRIORITIES),
  }),
  steps: auditRec.extend({ taskId: z.string(), weight: z.number().min(0), progress: z.number().min(0).max(100) }),
  updates: auditRec.extend({ taskId: z.string(), description: z.string() }),
  deliverables: auditRec.extend({ taskId: z.string(), name: z.string() }),
  deliverableVersions: auditRec.extend({ deliverableId: z.string(), taskId: z.string() }),
  checklist: auditRec.extend({ taskId: z.string(), label: z.string() }),
  approvals: auditRec.extend({ taskId: z.string() }),
  ideas: auditRec.extend({ title: z.string() }),
  notifications: rec.extend({ dedupeKey: z.string(), createdAt: z.string() }),
  activity: rec.extend({ at: z.string() }),
  settings: rec,
};

const backupSchema = z.object({
  app: z.literal('maham'),
  format: z.number().int(),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  exportedBy: z.string(),
  includesFiles: z.boolean(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  payload: z.object({
    tables: z.object(Object.fromEntries(DATA_TABLES.map((t) => [t, z.array(tableSchemas[t])])) as Record<DataTable, z.ZodArray<z.ZodType>>),
    blobs: z.array(z.object({ id: z.string(), mimeType: z.string(), createdAt: z.string(), base64: z.string() })),
  }),
});

const encryptedSchema = z.object({
  app: z.literal('maham'),
  format: z.number().int(),
  encrypted: z.literal(true),
  kdf: z.object({ name: z.literal('PBKDF2'), hash: z.literal('SHA-256'), iterations: z.number().int().min(100_000).max(10_000_000), salt: z.string() }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string() }),
  data: z.string(),
});

/**
 * ترحيل بيانات النسخ القديمة إلى بنية المخطط الحالي.
 * عند إضافة نسخة مخطط جديدة، أضف خطوة تحويل هنا.
 */
export function migrateBackupData(file: BackupFile): BackupFile {
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('هذه النسخة الاحتياطية من إصدار أحدث من التطبيق. حدّث التطبيق أولًا.');
  }
  return file;
}

// ───────────── التصدير ─────────────

export interface ExportOptions {
  includeFiles: boolean;
  password?: string;
}

function repoOf(store: DataStore, t: TableName): Repository<{ id: string }> {
  return store[t] as unknown as Repository<{ id: string }>;
}

const CREDENTIAL_FIELDS = [
  'passwordHash',
  'passwordSalt',
  'passwordIterations',
  'passwordUpdatedAt',
  'passwordVersion',
  'failedAttempts',
  'lockedUntil',
  'wrappedKey',
  'mustChangePassword',
] as const;

function stripCredentials(u: Record<string, unknown>): Record<string, unknown> {
  const out = { ...u };
  for (const f of CREDENTIAL_FIELDS) delete out[f];
  return out;
}

const userSlot = (u: { title?: unknown }, index: number) => (u.title === 'System Administrator' ? 0 : u.title === 'Second Administrator' ? 1 : index);

/**
 * يربط ملفَي العمل في النسخة بملفَي هذا الجهاز (حسب الدور)، لأن المعرّفات تختلف بين الأجهزة.
 * يعيد خريطة: معرّف النسخة ← المعرّف المحلي.
 */
function mapUsers(backupUsers: Record<string, unknown>[], localUsers: { id: string; title: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  const local = [...localUsers].map((u, i) => ({ u, slot: userSlot(u, i) }));
  backupUsers.forEach((bu, i) => {
    const target = local.find((l) => l.slot === userSlot(bu, i));
    if (target && typeof bu.id === 'string') map.set(bu.id, target.u.id);
  });
  return map;
}

/** يستبدل أي إشارة لمعرّف مستخدم من النسخة بالمعرّف المحلي (المعرّفات UUID فريدة فالاستبدال آمن) */
function remapRecord<T extends Record<string, unknown>>(r: T, map: Map<string, string>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'string' && map.has(v) ? map.get(v) : v;
  return out as T;
}

export async function buildBackup(opts: ExportOptions): Promise<BackupFile> {
  const store = getStore();
  const tables = {} as BackupPayload['tables'];
  for (const t of DATA_TABLES) tables[t] = (await repoOf(store, t).list()) as unknown as Record<string, unknown>[];
  // لا تُصدَّر بيانات الاعتماد ومفاتيح التشفير الخاصة بهذا الجهاز
  tables.users = tables.users.map(stripCredentials);
  tables.settings = tables.settings.map(({ encryption: _e, ...rest }) => rest);
  const blobs: BlobRecord[] = [];
  if (opts.includeFiles) {
    for (const b of await store.blobs.list()) {
      blobs.push({ id: b.id, mimeType: b.type || 'application/octet-stream', createdAt: b.createdAt, base64: bytesToBase64(b.data) });
    }
  }
  const payload: BackupPayload = { tables, blobs };
  return {
    app: 'maham',
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    exportedBy: actor(),
    includesFiles: opts.includeFiles,
    checksum: await sha256Hex(JSON.stringify(payload)),
    payload,
  };
}

export async function exportBackup(opts: ExportOptions): Promise<{ blob: Blob; fileName: string }> {
  const backup = await buildBackup(opts);
  let text = JSON.stringify(backup);
  if (opts.password) {
    if (opts.password.length < 8) throw new BackupError('كلمة مرور التشفير يجب ألا تقل عن 8 أحرف');
    const enc = await encryptText(text, opts.password);
    const file: EncryptedBackupFile = { app: 'maham', format: BACKUP_FORMAT, encrypted: true, ...enc };
    text = JSON.stringify(file);
  }
  const store = getStore();
  const s = await store.settings.get('app');
  if (s) await store.settings.put({ ...s, lastBackupAt: backup.exportedAt });
  await logActivity('backup', 'backup', 'exported', `تصدير نسخة احتياطية${opts.password ? ' مشفّرة' : ''}${opts.includeFiles ? ' مع المرفقات' : ''}`);
  const stamp = toDateOnly(new Date());
  return {
    blob: new Blob([text], { type: 'application/json' }),
    fileName: `maham-backup-${stamp}${opts.password ? '-encrypted' : ''}.json`,
  };
}

// ───────────── القراءة والتحقق ─────────────

export type ParsedBackup = { kind: 'plain'; backup: BackupFile } | { kind: 'encrypted'; encrypted: EncryptedBackupFile };

export async function readBackupFile(file: Blob): Promise<ParsedBackup> {
  if (file.size === 0) throw new BackupError('الملف فارغ');
  if (file.size > MAX_IMPORT_BYTES) throw new BackupError('حجم الملف أكبر من الحد المسموح للاستيراد');
  const text = await readFileAsText(file);
  return parseBackupText(text);
}

export async function parseBackupText(text: string): Promise<ParsedBackup> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('الملف ليس بصيغة JSON صالحة');
  }
  if (!json || typeof json !== 'object' || (json as { app?: unknown }).app !== 'maham') {
    throw new BackupError('هذا الملف ليس نسخة احتياطية من تطبيق مهام');
  }
  if ((json as { encrypted?: unknown }).encrypted === true) {
    const r = encryptedSchema.safeParse(json);
    if (!r.success) throw new BackupError('بنية النسخة المشفّرة غير صالحة');
    return { kind: 'encrypted', encrypted: r.data as EncryptedBackupFile };
  }
  return { kind: 'plain', backup: await validateBackup(json) };
}

export async function decryptBackup(enc: EncryptedBackupFile, password: string): Promise<BackupFile> {
  let text: string;
  try {
    text = await decryptText(enc, password);
  } catch {
    throw new BackupError('كلمة المرور غير صحيحة أو الملف تالف');
  }
  const parsed = await parseBackupText(text);
  if (parsed.kind !== 'plain') throw new BackupError('بنية النسخة غير صالحة');
  return parsed.backup;
}

async function validateBackup(json: unknown): Promise<BackupFile> {
  // التحقق من السلامة يتم على البيانات الخام قبل التحليل (المحلل قد يعيد ترتيب المفاتيح)
  const raw = json as { payload?: unknown; checksum?: unknown };
  if (raw.payload !== undefined && typeof raw.checksum === 'string') {
    if ((await sha256Hex(JSON.stringify(raw.payload))) !== raw.checksum) {
      throw new BackupError('فشل التحقق من سلامة الملف: البيانات معدّلة أو تالفة');
    }
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new BackupError(`بنية النسخة الاحتياطية غير صالحة (${issue?.path.join('.') || 'الجذر'})`);
  }
  // نستخدم الكائن الخام بعد نجاح التحقق للحفاظ على جميع الحقول كما صُدّرت
  const backup = json as BackupFile;
  if (backup.format > BACKUP_FORMAT) throw new BackupError('صيغة النسخة أحدث من هذا الإصدار من التطبيق');
  return migrateBackupData(backup);
}

// ───────────── الملخص قبل الاستيراد ─────────────

export interface ImportSummary {
  exportedAt: string;
  exportedByName: string;
  includesFiles: boolean;
  counts: Partial<Record<DataTable, number>>;
  blobCount: number;
  /** عدد السجلات الموجودة مسبقًا بنفس المعرّف */
  existing: number;
  /** عدد السجلات الجديدة */
  incoming: number;
  /** عدد السجلات المتعارضة (نفس المعرّف بمحتوى مختلف) */
  conflicts: number;
  currentTotal: number;
}

const SUMMARY_TABLES: DataTable[] = ['tasks', 'steps', 'updates', 'deliverables', 'ideas', 'categories', 'approvals'];

export async function summarizeImport(backup: BackupFile): Promise<ImportSummary> {
  const store = getStore();
  let existing = 0;
  let incoming = 0;
  let conflicts = 0;
  let currentTotal = 0;
  for (const t of DATA_TABLES) {
    if (t === 'settings' || t === 'notifications' || t === 'activity' || t === 'users') continue;
    const current = new Map((await repoOf(store, t).list()).map((r) => [r.id, r as unknown as Record<string, unknown>]));
    currentTotal += current.size;
    for (const r of backup.payload.tables[t]) {
      const c = current.get(r.id as string);
      if (!c) incoming++;
      else {
        existing++;
        if (c.updatedAt !== r.updatedAt) conflicts++;
      }
    }
  }
  const users = backup.payload.tables.users as { id: string; name: string }[];
  return {
    exportedAt: backup.exportedAt,
    exportedByName: users.find((u) => u.id === backup.exportedBy)?.name ?? 'غير معروف',
    includesFiles: backup.includesFiles,
    counts: Object.fromEntries(SUMMARY_TABLES.map((t) => [t, backup.payload.tables[t].length])),
    blobCount: backup.payload.blobs.length,
    existing,
    incoming,
    conflicts,
    currentTotal,
  };
}

// ───────────── الاستيراد ─────────────

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  blobs: number;
}

/**
 * - merge: يضيف السجلات الجديدة، وعند التعارض يحتفظ بالنسخة الأحدث (updatedAt). لا يحذف شيئًا.
 * - replace: يستبدل جميع البيانات المحلية بمحتوى النسخة (يتطلب تأكيدًا صريحًا في الواجهة).
 * العملية ذرّية: إما أن تكتمل كلها أو لا يتغير شيء.
 */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<ImportResult> {
  const store = getStore();
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, blobs: 0 };
  const localUsers = await store.users.list();
  const userMap = mapUsers(backup.payload.tables.users, localUsers);

  await store.transaction(async () => {
    if (mode === 'replace') {
      // تُحفظ ملفات العمل (وبيانات اعتمادها ومفاتيحها) والإعدادات المحلية دائمًا
      for (const t of TABLE_NAMES) if (t !== 'users' && t !== 'settings') await repoOf(store, t).clear();
    }

    // ملفات العمل: تحديث بيانات العرض فقط (الاسم واللون) — لا تُستورد كلمات مرور أو مفاتيح
    for (const bu of backup.payload.tables.users) {
      const localId = userMap.get(bu.id as string);
      const local = localUsers.find((u) => u.id === localId);
      if (!local) continue;
      const newer = typeof bu.updatedAt === 'string' && bu.updatedAt > local.updatedAt;
      if (mode === 'replace' || newer) {
        await store.users.put({
          ...local,
          name: typeof bu.name === 'string' && bu.name.trim() ? bu.name : local.name,
          color: typeof bu.color === 'string' ? bu.color : local.color,
        });
        result.updated++;
      } else result.skipped++;
    }

    for (const t of DATA_TABLES) {
      if (t === 'users' || t === 'settings') continue;
      const repo = repoOf(store, t);
      const rows = (backup.payload.tables[t] as Record<string, unknown>[]).map((r) => remapRecord(r, userMap)) as unknown as {
        id: string;
        updatedAt?: string;
      }[];
      if (mode === 'replace') {
        await repo.bulkPut(rows);
        result.added += rows.length;
        continue;
      }
      for (const r of rows) {
        const existing = (await repo.get(r.id)) as { updatedAt?: string } | undefined;
        if (!existing) {
          if (t === 'notifications') {
            const dup = await store.notifications.where('dedupeKey', (r as unknown as { dedupeKey: string }).dedupeKey);
            if (dup.length) {
              result.skipped++;
              continue;
            }
          }
          await repo.put(r);
          result.added++;
        } else if (r.updatedAt && existing.updatedAt && r.updatedAt > existing.updatedAt) {
          await repo.put(r);
          result.updated++;
        } else {
          result.skipped++;
        }
      }
    }
    for (const b of backup.payload.blobs) {
      if (mode === 'merge' && (await store.blobs.get(b.id))) continue;
      await store.blobs.put({ id: b.id, createdAt: b.createdAt, type: b.mimeType, data: base64ToBytes(b.base64) });
      result.blobs++;
    }
  });

  {
    await logActivity('backup', 'backup', 'imported', `استيراد نسخة احتياطية (${mode === 'merge' ? 'دمج' : 'استبدال كامل'}): ${result.added} جديد، ${result.updated} محدّث`);
  }
  return result;
}

// ───────────── مساحة التخزين ─────────────

export interface StorageInfo {
  supported: boolean;
  usage: number;
  quota: number;
  persisted: boolean;
}

export async function storageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { supported: false, usage: 0, quota: 0, persisted: false };
  }
  const est = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { supported: true, usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
}

/** يطلب من المتصفح عدم حذف بيانات التطبيق تلقائيًا عند امتلاء القرص */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
