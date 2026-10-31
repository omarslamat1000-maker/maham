import type { Table } from 'dexie';

/**
 * واجهة المستودع العامة — طبقة الخدمات تعتمد عليها وليس على Dexie مباشرة،
 * مما يسمح مستقبلًا باستبدال المحوّل المحلي بمحوّل خادمي (REST/Sync) دون تغيير الواجهات.
 */
export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  getMany(ids: readonly string[]): Promise<T[]>;
  list(): Promise<T[]>;
  /** استعلام مساواة على حقل مفهرس */
  where<K extends keyof T & string>(field: K, value: T[K] & (string | number)): Promise<T[]>;
  put(entity: T): Promise<void>;
  bulkPut(entities: readonly T[]): Promise<void>;
  update(id: string, changes: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: readonly string[]): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/** محوّل IndexedDB المحلي عبر Dexie */
export class DexieRepository<T extends { id: string }> implements Repository<T> {
  constructor(private readonly table: Table<T, string>) {}

  get(id: string) {
    return this.table.get(id);
  }

  async getMany(ids: readonly string[]) {
    const rows = await this.table.bulkGet([...ids]);
    return rows.filter((r): r is T => r !== undefined);
  }

  list() {
    return this.table.toArray();
  }

  where<K extends keyof T & string>(field: K, value: T[K] & (string | number)) {
    return this.table.where(field).equals(value).toArray();
  }

  async put(entity: T) {
    await this.table.put(entity);
  }

  async bulkPut(entities: readonly T[]) {
    await this.table.bulkPut([...entities]);
  }

  async update(id: string, changes: Partial<T>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.table.update(id, changes as any);
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
}
