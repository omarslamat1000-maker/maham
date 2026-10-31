import { getStore } from '@/data/store';
import { firstError, updateInputSchema, type UpdateInput } from '@/domain/schemas';
import type { ID, TaskUpdate } from '@/types/entities';
import { checkFile } from '@/utils/file';
import { uuid } from '@/utils/id';
import { nowIso } from '@/utils/date';
import { actor, audit, logActivity, ServiceError } from './core';
import { settingsService } from './settingsService';
import { taskService } from './taskService';

export const updateService = {
  async list(taskId: ID): Promise<TaskUpdate[]> {
    const rows = await getStore().updates.where('taskId', taskId);
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },

  async recentWithChallenges(limit = 8): Promise<TaskUpdate[]> {
    const rows = await getStore().updates.list();
    return rows
      .filter((u) => u.challenges.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },

  async recent(limit = 8): Promise<TaskUpdate[]> {
    const rows = await getStore().updates.list();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },

  async add(taskId: ID, input: UpdateInput, file?: File | null): Promise<TaskUpdate> {
    const parsed = updateInputSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    let blobId: string | null = null;
    if (file) {
      const settings = await settingsService.get();
      const check = checkFile(file, settings.maxFileSizeMb);
      if (!check.ok) throw new ServiceError(check.error);
      blobId = uuid();
    }
    const store = getStore();
    return store.transaction(async () => {
      const task = await store.tasks.get(taskId);
      if (!task || task.deletedAt) throw new ServiceError('المهمة غير موجودة');
      if (file && blobId) await store.blobs.put({ id: blobId, blob: file, createdAt: nowIso() });
      const update: TaskUpdate = {
        id: uuid(),
        taskId,
        userId: actor(),
        ...parsed.data,
        progressAtUpdate: Math.round(parsed.data.progressAtUpdate),
        attachmentBlobId: blobId,
        attachmentName: file?.name ?? null,
        attachmentMime: file?.type || null,
        ...audit(),
      };
      await store.updates.put(update);
      await taskService.touch(taskId);
      await logActivity('update', update.id, 'created', `إضافة تحديث: ${update.description.slice(0, 80)}`, taskId);
      return update;
    });
  },

  async remove(updateId: ID): Promise<void> {
    const store = getStore();
    await store.transaction(async () => {
      const u = await store.updates.get(updateId);
      if (!u) return;
      if (u.attachmentBlobId) await store.blobs.delete(u.attachmentBlobId);
      await store.updates.delete(updateId);
      await logActivity('update', updateId, 'deleted', 'حذف تحديث', u.taskId);
    });
  },
};
