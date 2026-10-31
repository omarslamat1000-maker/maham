import { getStore } from '@/data/store';
import { deliverableInputSchema, firstError, safeUrl, type DeliverableInput } from '@/domain/schemas';
import type { Deliverable, DeliverableApproval, DeliverableVersion, ID } from '@/types/entities';
import { checkFile, readFileAsArrayBuffer } from '@/utils/file';
import { uuid } from '@/utils/id';
import { nowIso } from '@/utils/date';
import { DELIVERABLE_APPROVAL_LABEL } from '@/utils/labels';
import { audit, logActivity, ServiceError, touched } from './core';
import { settingsService } from './settingsService';
import { taskService } from './taskService';

export type DeliverableSource = { file: File } | { url: string };

async function validateSource(
  src: DeliverableSource,
): Promise<{ file?: File; bytes?: Uint8Array; url?: string; kindHint?: Deliverable['kind'] }> {
  if ('file' in src) {
    const settings = await settingsService.get();
    const check = checkFile(src.file, settings.maxFileSizeMb);
    if (!check.ok) throw new ServiceError(check.error);
    // تُقرأ البايتات قبل أي معاملة: القراءة غير المتزامنة داخل المعاملة تُغلقها
    return { file: src.file, bytes: new Uint8Array(await readFileAsArrayBuffer(src.file)), kindHint: check.kind };
  }
  const parsed = safeUrl.safeParse(src.url);
  if (!parsed.success) throw new ServiceError(firstError(parsed.error));
  return { url: parsed.data };
}

export const deliverableService = {
  async list(taskId: ID): Promise<Deliverable[]> {
    const rows = await getStore().deliverables.where('taskId', taskId);
    return rows.filter((d) => !d.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async versions(deliverableId: ID): Promise<DeliverableVersion[]> {
    const rows = await getStore().deliverableVersions.where('deliverableId', deliverableId);
    return rows.sort((a, b) => b.version - a.version);
  },

  async versionsForTask(taskId: ID): Promise<DeliverableVersion[]> {
    return getStore().deliverableVersions.where('taskId', taskId);
  },

  async getBlob(blobId: ID): Promise<Blob | undefined> {
    const b = await getStore().blobs.get(blobId);
    return b ? new Blob([b.data as Uint8Array<ArrayBuffer>], { type: b.type }) : undefined;
  },

  async create(taskId: ID, input: DeliverableInput, src: DeliverableSource, note = ''): Promise<Deliverable> {
    const parsed = deliverableInputSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const v = await validateSource(src);
    if (parsed.data.kind === 'video_link' && !v.url) {
      throw new ServiceError('مخرجات الفيديو تُضاف كرابط خارجي فقط');
    }
    const store = getStore();
    return store.transaction(async () => {
      const task = await store.tasks.get(taskId);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      const a = audit();
      const deliverableId = uuid();
      const blobId = v.file ? uuid() : null;
      if (v.file && v.bytes && blobId) await store.blobs.put({ id: blobId, data: v.bytes, type: v.file.type || 'application/octet-stream', createdAt: nowIso() });
      const version: DeliverableVersion = {
        id: uuid(),
        deliverableId,
        taskId,
        version: 1,
        fileName: v.file?.name ?? null,
        mimeType: v.file?.type || null,
        size: v.file?.size ?? 0,
        blobId,
        externalUrl: v.url ?? null,
        note,
        ...a,
      };
      const deliverable: Deliverable = {
        id: deliverableId,
        taskId,
        ...parsed.data,
        version: 1,
        approvalStatus: 'pending',
        currentVersionId: version.id,
        deletedAt: null,
        ...a,
      };
      if (deliverable.isFinal) await this._clearOtherFinals(taskId, deliverableId);
      await store.deliverableVersions.put(version);
      await store.deliverables.put(deliverable);
      await taskService.touch(taskId);
      await logActivity('deliverable', deliverableId, 'created', `إضافة مخرج «${deliverable.name}» (الإصدار 1)`, taskId);
      return deliverable;
    });
  },

  /** استبدال الملف/الرابط بإصدار جديد مع الاحتفاظ بسجل الإصدارات */
  async addVersion(deliverableId: ID, src: DeliverableSource, note = ''): Promise<DeliverableVersion> {
    const v = await validateSource(src);
    const store = getStore();
    return store.transaction(async () => {
      const d = await store.deliverables.get(deliverableId);
      if (!d || d.deletedAt) throw new ServiceError('المخرج غير موجود');
      const blobId = v.file ? uuid() : null;
      if (v.file && v.bytes && blobId) await store.blobs.put({ id: blobId, data: v.bytes, type: v.file.type || 'application/octet-stream', createdAt: nowIso() });
      const version: DeliverableVersion = {
        id: uuid(),
        deliverableId,
        taskId: d.taskId,
        version: d.version + 1,
        fileName: v.file?.name ?? null,
        mimeType: v.file?.type || null,
        size: v.file?.size ?? 0,
        blobId,
        externalUrl: v.url ?? null,
        note,
        ...audit(),
      };
      await store.deliverableVersions.put(version);
      // الإصدار الجديد يعود لحالة "قيد المراجعة"
      await store.deliverables.put({ ...d, version: version.version, currentVersionId: version.id, approvalStatus: 'pending', ...touched() });
      await taskService.touch(d.taskId);
      await logActivity('deliverable', deliverableId, 'version', `رفع الإصدار ${version.version} من «${d.name}»`, d.taskId);
      return version;
    });
  },

  async update(deliverableId: ID, patch: Partial<Pick<Deliverable, 'name' | 'description' | 'kind'>>): Promise<void> {
    const store = getStore();
    const d = await store.deliverables.get(deliverableId);
    if (!d) throw new ServiceError('المخرج غير موجود');
    const parsed = deliverableInputSchema.safeParse({ ...d, ...patch });
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    await store.deliverables.put({ ...d, name: parsed.data.name, description: parsed.data.description, kind: parsed.data.kind, ...touched() });
    await logActivity('deliverable', deliverableId, 'updated', `تعديل بيانات المخرج «${parsed.data.name}»`, d.taskId);
  },

  async setApproval(deliverableId: ID, status: DeliverableApproval): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const d = await store.deliverables.get(deliverableId);
      if (!d) throw new ServiceError('المخرج غير موجود');
      await store.deliverables.put({ ...d, approvalStatus: status, ...touched() });
      await logActivity('deliverable', deliverableId, 'approval', `حالة اعتماد «${d.name}»: ${DELIVERABLE_APPROVAL_LABEL[status]}`, d.taskId);
    });
  },

  async setFinal(deliverableId: ID, isFinal: boolean): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const d = await store.deliverables.get(deliverableId);
      if (!d) throw new ServiceError('المخرج غير موجود');
      if (isFinal) await this._clearOtherFinals(d.taskId, deliverableId);
      await store.deliverables.put({ ...d, isFinal, ...touched() });
      await logActivity('deliverable', deliverableId, 'final', isFinal ? `تحديد «${d.name}» كمخرج نهائي` : `إلغاء تحديد «${d.name}» كمخرج نهائي`, d.taskId);
    });
  },

  async _clearOtherFinals(taskId: ID, keepId: ID): Promise<void> {
    const store = getStore();
    const others = await store.deliverables.where('taskId', taskId);
    for (const o of others) {
      if (o.id !== keepId && o.isFinal) await store.deliverables.put({ ...o, isFinal: false, ...touched() });
    }
  },

  /** حذف المخرج نهائيًا مع جميع إصداراته وملفاته (لتحرير مساحة التخزين) */
  async remove(deliverableId: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const d = await store.deliverables.get(deliverableId);
      if (!d) return;
      const versions = await store.deliverableVersions.where('deliverableId', deliverableId);
      await store.blobs.bulkDelete(versions.map((v) => v.blobId).filter((b): b is string => !!b));
      await store.deliverableVersions.bulkDelete(versions.map((v) => v.id));
      await store.deliverables.delete(deliverableId);
      await logActivity('deliverable', deliverableId, 'deleted', `حذف المخرج «${d.name}» وجميع إصداراته`, d.taskId);
    });
  },
};
