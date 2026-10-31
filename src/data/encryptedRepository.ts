import type { Table } from 'dexie';
import type { StoredBlob } from '@/types/entities';
import { keyring, type Sealed } from './keyring';
import type { Repository } from './repository';

/**
 * شكل السجل المشفّر على القرص:
 *   { id, <حقول ربط مكشوفة: معرّفات عشوائية فقط>, <فهارس عمياء>, __enc: { iv, ct } }
 * المحتوى الكامل للسجل داخل __enc. السجلات القديمة غير المشفّرة تُقرأ كما هي حتى يُعاد حفظها.
 */
type Row = { id: string; __enc?: Sealed } & Record<string, unknown>;

export interface EncryptionSpec {
  /** حقول تبقى مكشوفة للفهرسة — يجب أن تكون معرّفات عشوائية لا تحمل معنى */
  plain: readonly string[];
  /** حقول حساسة تحتاج بحثًا بالمساواة: الحقل ← اسم حقل الفهرس الأعمى المخزن */
  blind?: Readonly<Record<string, string>>;
}

export class EncryptedRepository<T extends { id: string }> implements Repository<T> {
  constructor(
    private readonly table: Table<Row, string>,
    private readonly spec: EncryptionSpec,
  ) {}

  private seal(entity: T): Row {
    const row: Row = { id: entity.id, __enc: keyring.sealJson(entity) };
    const e = entity as unknown as Record<string, unknown>;
    for (const f of this.spec.plain) if (e[f] !== undefined && e[f] !== null) row[f] = e[f];
    for (const [f, idx] of Object.entries(this.spec.blind ?? {})) {
      if (typeof e[f] === 'string') row[idx] = keyring.blindIndex(e[f] as string);
    }
    return row;
  }

  private open(row: Row | undefined): T | undefined {
    if (!row) return undefined;
    if (!row.__enc) return row as unknown as T; // سجل قديم قبل التشفير
    return keyring.openJson<T>(row.__enc);
  }

  /** هل السجل مخزن دون تشفير (للترحيل) */
  static isPlain(row: unknown): boolean {
    return !!row && typeof row === 'object' && !('__enc' in row);
  }

  async get(id: string) {
    return this.open(await this.table.get(id));
  }

  async getMany(ids: readonly string[]) {
    const rows = await this.table.bulkGet([...ids]);
    return rows.map((r) => this.open(r)).filter((r): r is T => r !== undefined);
  }

  async list() {
    const rows = await this.table.toArray();
    return rows.map((r) => this.open(r)!);
  }

  async where<K extends keyof T & string>(field: K, value: T[K] & (string | number)) {
    const blindField = this.spec.blind?.[field];
    if (blindField) {
      const rows = await this.table.where(blindField).equals(keyring.blindIndex(String(value))).toArray();
      return rows.map((r) => this.open(r)!);
    }
    if (!this.spec.plain.includes(field)) {
      throw new Error(`الحقل ${field} مشفّر ولا يمكن الاستعلام عنه مباشرة`);
    }
    const rows = await this.table.where(field).equals(value).toArray();
    return rows.map((r) => this.open(r)!);
  }

  async put(entity: T) {
    await this.table.put(this.seal(entity));
  }

  async bulkPut(entities: readonly T[]) {
    await this.table.bulkPut(entities.map((e) => this.seal(e)));
  }

  async update(id: string, changes: Partial<T>) {
    const current = await this.get(id);
    if (current) await this.put({ ...current, ...changes });
  }

  async delete(id: string) {
    await this.table.delete(id);
  }

  async bulkDelete(ids: readonly string[]) {
    await this.table.bulkDelete([...ids]);
  }

  count() {
    return this.table.count();
  }

  async clear() {
    await this.table.clear();
  }

  /** يعيد تشفير أي سجلات قديمة مخزنة كنص صريح. يعيد عددها */
  async encryptLegacyRows(): Promise<number> {
    const legacy = (await this.table.toArray()).filter((r) => EncryptedRepository.isPlain(r));
    if (legacy.length) await this.table.bulkPut(legacy.map((r) => this.seal(r as unknown as T)));
    return legacy.length;
  }
}

/** محتوى الملفات: البايتات مشفّرة، والنوع وتاريخ الإنشاء داخل الحزمة المشفّرة أيضًا */
type BlobRow = { id: string; meta?: Sealed; data?: Sealed } & Partial<{ blob: Blob; createdAt: string }>;

export class EncryptedBlobRepository implements Repository<StoredBlob> {
  constructor(private readonly table: Table<BlobRow, string>) {}

  private seal(b: StoredBlob): BlobRow {
    return { id: b.id, meta: keyring.sealJson({ type: b.type, createdAt: b.createdAt }), data: keyring.sealBytes(b.data) };
  }

  /** يدعم سجلات الإصدار 1 (Blob غير مشفّر) — تُقرأ بايتاتها لاحقًا عبر الترحيل */
  private open(row: BlobRow | undefined): StoredBlob | undefined {
    if (!row) return undefined;
    if (!row.meta || !row.data) return undefined;
    const meta = keyring.openJson<{ type: string; createdAt: string }>(row.meta);
    return { id: row.id, type: meta.type, createdAt: meta.createdAt, data: keyring.openBytes(row.data) };
  }

  async get(id: string) {
    return this.open(await this.table.get(id));
  }
  async getMany(ids: readonly string[]) {
    return (await this.table.bulkGet([...ids])).map((r) => this.open(r)).filter((r): r is StoredBlob => !!r);
  }
  async list() {
    return (await this.table.toArray()).map((r) => this.open(r)).filter((r): r is StoredBlob => !!r);
  }
  async where(): Promise<StoredBlob[]> {
    throw new Error('blobs: where غير مدعوم');
  }
  async put(b: StoredBlob) {
    await this.table.put(this.seal(b));
  }
  async bulkPut(bs: readonly StoredBlob[]) {
    await this.table.bulkPut(bs.map((b) => this.seal(b)));
  }
  async update(id: string, changes: Partial<StoredBlob>) {
    const cur = await this.get(id);
    if (cur) await this.put({ ...cur, ...changes });
  }
  async delete(id: string) {
    await this.table.delete(id);
  }
  async bulkDelete(ids: readonly string[]) {
    await this.table.bulkDelete([...ids]);
  }
  count() {
    return this.table.count();
  }
  async clear() {
    await this.table.clear();
  }

  /** ترحيل ملفات الإصدار 1: قراءة Blob الصريح (غير متزامن) خارج أي معاملة ثم تشفيره */
  async encryptLegacyRows(): Promise<number> {
    const legacy = (await this.table.toArray()).filter((r) => r.blob instanceof Blob || (r.blob && !r.data));
    for (const r of legacy) {
      const blob = r.blob as Blob;
      const data = new Uint8Array(await blob.arrayBuffer());
      await this.put({ id: r.id, type: blob.type || 'application/octet-stream', createdAt: r.createdAt ?? new Date().toISOString(), data });
    }
    return legacy.length;
  }
}
