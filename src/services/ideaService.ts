import { getStore } from '@/data/store';
import { firstError, ideaInputSchema, type IdeaInput } from '@/domain/schemas';
import type { BacklogIdea, ID, Task } from '@/types/entities';
import { uuid } from '@/utils/id';
import { nowIso } from '@/utils/date';
import { audit, logActivity, ServiceError, touched } from './core';
import { taskService } from './taskService';

export const ideaService = {
  async list(): Promise<BacklogIdea[]> {
    const rows = await getStore().ideas.list();
    return rows.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: ID): Promise<BacklogIdea | undefined> {
    return getStore().ideas.get(id);
  },

  async create(input: IdeaInput): Promise<BacklogIdea> {
    const parsed = ideaInputSchema.safeParse(input);
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    const idea: BacklogIdea = {
      id: uuid(),
      ...parsed.data,
      status: 'open',
      convertedTaskId: null,
      convertedAt: null,
      deletedAt: null,
      ...audit(),
    };
    const store = getStore();
    await store.transaction(async () => {
      await store.ideas.put(idea);
      await logActivity('idea', idea.id, 'created', `تسجيل فكرة «${idea.title}»`);
    });
    return idea;
  },

  async update(id: ID, input: Partial<IdeaInput>): Promise<void> {
    const store = getStore();
    const idea = await store.ideas.get(id);
    if (!idea || idea.deletedAt) throw new ServiceError('الفكرة غير موجودة');
    const parsed = ideaInputSchema.safeParse({ ...idea, ...input });
    if (!parsed.success) throw new ServiceError(firstError(parsed.error));
    await store.ideas.put({ ...idea, ...parsed.data, ...touched() });
    await logActivity('idea', id, 'updated', `تعديل فكرة «${parsed.data.title}»`);
  },

  async setArchived(id: ID, archived: boolean): Promise<void> {
    const store = getStore();
    const idea = await store.ideas.get(id);
    if (!idea) throw new ServiceError('الفكرة غير موجودة');
    if (idea.status === 'converted') throw new ServiceError('لا يمكن أرشفة فكرة حُوّلت إلى مهمة');
    await store.ideas.put({ ...idea, status: archived ? 'archived' : 'open', ...touched() });
    await logActivity('idea', id, archived ? 'archived' : 'unarchived', `${archived ? 'أرشفة' : 'استعادة'} فكرة «${idea.title}»`);
  },

  async remove(id: ID): Promise<void> {
    const store = getStore();
    const idea = await store.ideas.get(id);
    if (!idea) return;
    await store.ideas.put({ ...idea, deletedAt: nowIso(), ...touched() });
    await logActivity('idea', id, 'deleted', `حذف فكرة «${idea.title}»`);
  },

  /**
   * تحويل الفكرة إلى مهمة: ينقل العنوان والوصف والتصنيف والأولوية،
   * ويحتفظ بمعرّف الفكرة في المهمة، ولا يحذف الفكرة الأصلية، ويسجّل تاريخ التحويل.
   */
  async convertToTask(id: ID): Promise<Task> {
    const store = getStore();
    return store.transaction(async () => {
      const idea = await store.ideas.get(id);
      if (!idea || idea.deletedAt) throw new ServiceError('الفكرة غير موجودة');
      if (idea.status === 'converted' && idea.convertedTaskId) {
        throw new ServiceError('تم تحويل هذه الفكرة إلى مهمة مسبقًا');
      }
      const description = [idea.description, idea.notes ? `ملاحظات الفكرة: ${idea.notes}` : ''].filter(Boolean).join('\n\n');
      const task = await taskService.create(
        { title: idea.title, description, categoryId: idea.categoryId, priority: idea.priority },
        { sourceIdeaId: idea.id },
      );
      const ts = nowIso();
      await store.ideas.put({ ...idea, status: 'converted', convertedTaskId: task.id, convertedAt: ts, ...touched() });
      await logActivity('idea', idea.id, 'converted', `تحويل الفكرة «${idea.title}» إلى مهمة`, task.id);
      return task;
    });
  },
};

export const categoryService = {
  async list(includeDeleted = false) {
    const rows = await getStore().categories.list();
    return rows.filter((c) => includeDeleted || !c.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async create(name: string, color: string) {
    const n = name.trim();
    if (!n) throw new ServiceError('اسم التصنيف إلزامي');
    if (n.length > 60) throw new ServiceError('اسم التصنيف طويل جدًا');
    const store = getStore();
    const dup = (await store.categories.list()).some((c) => !c.deletedAt && c.name === n);
    if (dup) throw new ServiceError('يوجد تصنيف بنفس الاسم');
    const cat = { id: uuid(), name: n, color, deletedAt: null, ...audit() };
    await store.categories.put(cat);
    await logActivity('category', cat.id, 'created', `إنشاء تصنيف «${n}»`);
    return cat;
  },

  async update(id: ID, patch: { name?: string; color?: string }) {
    const store = getStore();
    const c = await store.categories.get(id);
    if (!c) throw new ServiceError('التصنيف غير موجود');
    const name = patch.name?.trim() ?? c.name;
    if (!name) throw new ServiceError('اسم التصنيف إلزامي');
    await store.categories.put({ ...c, name, color: patch.color ?? c.color, ...touched() });
    await logActivity('category', id, 'updated', `تعديل تصنيف «${name}»`);
  },

  /** حذف منطقي: المهام المرتبطة تحتفظ بالمرجع وتظهر باسم التصنيف */
  async remove(id: ID) {
    const store = getStore();
    const c = await store.categories.get(id);
    if (!c) return;
    await store.categories.put({ ...c, deletedAt: nowIso(), ...touched() });
    await logActivity('category', id, 'deleted', `حذف تصنيف «${c.name}»`);
  },
};
