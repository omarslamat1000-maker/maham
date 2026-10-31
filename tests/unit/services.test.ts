// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/data/db';
import { getStore } from '@/data/store';
import { ensureSetup, seedDefaultCategories } from '@/services/setupService';
import { keyring } from '@/data/keyring';
import { taskService } from '@/services/taskService';
import { stepService } from '@/services/stepService';
import { updateService } from '@/services/updateService';
import { deliverableService } from '@/services/deliverableService';
import { approvalService, checklistService } from '@/services/approvalService';
import { ideaService } from '@/services/ideaService';
import { notificationService } from '@/services/notificationService';
import { activityService, isQuotaError, toUserMessage } from '@/services/core';
import { decryptBackup, exportBackup, importBackup, parseBackupText, readBackupFile, summarizeImport } from '@/services/backupService';
import { addDaysStr, todayStr } from '@/utils/date';

function file(name: string, content = 'hello', type = 'application/octet-stream'): File {
  return new File([content], name, { type });
}

beforeEach(async () => {
  await resetDbForTests();
  await ensureSetup();
  // فتح حلقة المفاتيح بمفتاح اختباري (يعادل تسجيل الدخول) ثم البذر الأولي
  keyring.unlock(keyring.generateMaster());
  await seedDefaultCategories();
});

describe('التهيئة', () => {
  it('ينشئ ملفي عمل وتصنيفات افتراضية دون مهام وهمية', async () => {
    const store = getStore();
    expect(await store.users.count()).toBe(2);
    expect(await store.categories.count()).toBeGreaterThan(0);
    expect(await store.tasks.count()).toBe(0);
    // استدعاء ثانٍ لا يكرر البيانات
    await ensureSetup();
    await seedDefaultCategories();
    expect(await store.users.count()).toBe(2);
    expect(await store.categories.count()).toBe(4);
  });
});

describe('إدارة المهام', () => {
  it('ينشئ مهمة ويرفض العنوان الفارغ', async () => {
    const t = await taskService.create({ title: '  إعداد التقرير  ', priority: 'high' });
    expect(t.title).toBe('إعداد التقرير');
    expect(t.status).toBe('new');
    expect((await checklistService.list(t.id)).length).toBe(4);
    await expect(taskService.create({ title: '   ' })).rejects.toThrow('عنوان المهمة إلزامي');
  });

  it('يرفض تاريخ نهاية قبل البداية', async () => {
    await expect(taskService.create({ title: 'x', startDate: '2026-10-10', dueDate: '2026-10-01' })).rejects.toThrow(/بعد تاريخ البداية/);
  });

  it('يعدّل المهمة ويسجل التغييرات في سجل النشاط', async () => {
    const t = await taskService.create({ title: 'أ' });
    await taskService.update(t.id, { title: 'ب', priority: 'urgent' });
    const updated = await taskService.get(t.id);
    expect(updated?.title).toBe('ب');
    expect(updated?.priority).toBe('urgent');
    const log = await activityService.forTask(t.id);
    expect(log.some((l) => l.details.includes('الأولوية'))).toBe(true);
    expect(log.every((l) => l.userId)).toBe(true);
  });

  it('الحذف منطقي وقابل للاسترجاع، والحذف النهائي يزيل التوابع', async () => {
    const t = await taskService.create({ title: 'للحذف' });
    await stepService.add(t.id, { title: 's' });
    await taskService.softDelete(t.id);
    expect((await taskService.listActive()).length).toBe(0);
    expect((await taskService.listDeleted()).length).toBe(1);
    await taskService.restore(t.id);
    expect((await taskService.listActive()).length).toBe(1);
    await taskService.purge(t.id);
    expect(await getStore().tasks.count()).toBe(0);
    expect(await getStore().steps.count()).toBe(0);
  });

  it('لا يسمح بإكمال المهمة يدويًا', async () => {
    const t = await taskService.create({ title: 'x' });
    await expect(taskService.setStatus(t.id, 'completed')).rejects.toThrow(/قدّمها للمراجعة/);
  });
});

describe('الخطوات والإنجاز المرجح', () => {
  it('يعيد حساب نسبة المهمة تلقائيًا عند إضافة/تعديل الخطوات والأوزان', async () => {
    const t = await taskService.create({ title: 'خطة' });
    const s1 = await stepService.add(t.id, { title: 'تحليل', weight: 1, progress: 100 });
    const s2 = await stepService.add(t.id, { title: 'تنفيذ', weight: 3, progress: 0 });
    let task = await taskService.get(t.id);
    expect(task?.computedProgress).toBe(25);
    expect(task?.status).toBe('in_progress');

    await stepService.update(s2.id, { weight: 1 });
    task = await taskService.get(t.id);
    expect(task?.computedProgress).toBe(50);

    await stepService.update(s2.id, { status: 'done' });
    task = await taskService.get(t.id);
    expect(task?.computedProgress).toBe(100);

    await stepService.remove(s1.id);
    await stepService.remove(s2.id);
    task = await taskService.get(t.id);
    expect(task?.computedProgress).toBeNull();
  });

  it('يرفض الأوزان السالبة والنسب فوق 100', async () => {
    const t = await taskService.create({ title: 'x' });
    await expect(stepService.add(t.id, { title: 's', weight: -1 })).rejects.toThrow(/سالب/);
    await expect(stepService.add(t.id, { title: 's', progress: 120 })).rejects.toThrow(/100/);
  });

  it('يحفظ التعديل اليدوي منفصلًا مع السبب والمنفذ', async () => {
    const t = await taskService.create({ title: 'x' });
    await stepService.add(t.id, { title: 's', progress: 80 });
    await expect(taskService.setManualProgress(t.id, 50, '')).rejects.toThrow(/سبب/);
    await taskService.setManualProgress(t.id, 50, 'تقدير ميداني');
    const task = await taskService.get(t.id);
    expect(task?.manualProgress).toBe(50);
    expect(task?.computedProgress).toBe(80);
    expect(task?.manualProgressReason).toBe('تقدير ميداني');
    expect(task?.manualProgressBy).toBeTruthy();
    expect(task?.manualProgressAt).toBeTruthy();
  });
});

describe('التحديثات والمرفقات', () => {
  it('يضيف تحديثًا مع مرفق', async () => {
    const t = await taskService.create({ title: 'x' });
    const u = await updateService.add(
      t.id,
      { date: todayStr(), description: 'تم الاجتماع', progressAtUpdate: 30, challenges: 'تأخر البيانات', nextAction: 'متابعة' },
      file('minutes.pdf', '%PDF', 'application/pdf'),
    );
    expect(u.attachmentBlobId).toBeTruthy();
    expect((await updateService.list(t.id)).length).toBe(1);
    expect(await getStore().blobs.count()).toBe(1);
  });

  it('يرفع مخرجًا مدعومًا ويدير الإصدارات', async () => {
    const t = await taskService.create({ title: 'x' });
    const d = await deliverableService.create(t.id, { name: 'العرض', kind: 'powerpoint', isFinal: true }, { file: file('deck.pptx') });
    expect(d.version).toBe(1);
    await deliverableService.addVersion(d.id, { file: file('deck-v2.pptx', 'v2') }, 'تعديل الألوان');
    const versions = await deliverableService.versions(d.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    const blob = await deliverableService.getBlob(versions[0].blobId!);
    expect(blob?.size).toBe(2);
  });

  it('يرفض أنواع الملفات غير المدعومة والفيديو والروابط غير الآمنة', async () => {
    const t = await taskService.create({ title: 'x' });
    await expect(deliverableService.create(t.id, { name: 'a', kind: 'other' }, { file: file('run.exe') })).rejects.toThrow(/غير مدعوم/);
    await expect(deliverableService.create(t.id, { name: 'a', kind: 'other' }, { file: file('clip.mp4') })).rejects.toThrow(/رابط/);
    await expect(deliverableService.create(t.id, { name: 'a', kind: 'link' }, { url: 'javascript:alert(1)' })).rejects.toThrow(/https/);
    const v = await deliverableService.create(t.id, { name: 'فيديو', kind: 'video_link' }, { url: 'https://example.com/v' });
    expect(v.kind).toBe('video_link');
  });
});

describe('التسليم والاعتماد', () => {
  async function readyTask() {
    const t = await taskService.create({ title: 'تسليم' });
    await stepService.add(t.id, { title: 's', progress: 100 });
    await deliverableService.create(t.id, { name: 'نهائي', kind: 'pdf', isFinal: true }, { file: file('final.pdf') });
    for (const item of await checklistService.list(t.id)) if (!item.autoRule) await checklistService.toggle(item.id, true);
    return t;
  }

  it('تقديم ثم رفض مع سبب: تبقى قيد التنفيذ مع ملاحظات المراجعة', async () => {
    const t = await readyTask();
    await approvalService.perform(t.id, 'submitted');
    await expect(approvalService.perform(t.id, 'changes_requested', '')).rejects.toThrow(/سبب/);
    const r = await approvalService.perform(t.id, 'changes_requested', 'الملخص غير مكتمل');
    expect(r.status).toBe('in_progress');
    expect(r.submissionStatus).toBe('changes_requested');
    expect(r.reviewNotes).toBe('الملخص غير مكتمل');
    const notes = await notificationService.list();
    expect(notes.some((n) => n.type === 'changes_requested')).toBe(true);
  });

  it('الاعتماد يكمل المهمة ويسجل القرار', async () => {
    const t = await readyTask();
    await approvalService.perform(t.id, 'submitted');
    const r = await approvalService.perform(t.id, 'approved');
    expect(r.status).toBe('completed');
    expect(r.completedAt).toBeTruthy();
    expect(r.approvedBy).toBeTruthy();
    const hist = await approvalService.history(t.id);
    expect(hist.map((h) => h.action)).toEqual(['approved', 'submitted']);
    const reopened = await approvalService.perform(t.id, 'reopened', 'ملاحظة متأخرة');
    expect(reopened.status).toBe('in_progress');
    expect(reopened.completedAt).toBeNull();
  });

  it('يمنع الاعتماد دون استيفاء قائمة التحقق', async () => {
    const t = await taskService.create({ title: 'ناقصة' });
    await approvalService.perform(t.id, 'submitted');
    await expect(approvalService.perform(t.id, 'approved')).rejects.toThrow(/غير مستوفاة/);
    expect((await taskService.get(t.id))?.status).not.toBe('completed');
  });
});

describe('بنك الأفكار', () => {
  it('ينشئ فكرة ويحولها إلى مهمة دون حذفها', async () => {
    const idea = await ideaService.create({ title: 'منصة تدريب', description: 'وصف الفكرة', priority: 'high', expectedValue: 'high' });
    const task = await ideaService.convertToTask(idea.id);
    expect(task.title).toBe('منصة تدريب');
    expect(task.description).toContain('وصف الفكرة');
    expect(task.sourceIdeaId).toBe(idea.id);
    const after = await ideaService.get(idea.id);
    expect(after?.status).toBe('converted');
    expect(after?.convertedTaskId).toBe(task.id);
    expect(after?.convertedAt).toBeTruthy();
    await expect(ideaService.convertToTask(idea.id)).rejects.toThrow(/مسبقًا/);
  });
});

describe('التنبيهات', () => {
  it('يولّد تنبيهات المتأخرة والقريبة دون تكرار', async () => {
    await taskService.create({ title: 'متأخرة', dueDate: addDaysStr(todayStr(), -2) });
    await taskService.create({ title: 'قريبة', dueDate: addDaysStr(todayStr(), 1) });
    await taskService.create({ title: 'بعيدة', dueDate: addDaysStr(todayStr(), 30) });
    expect(await notificationService.generate()).toBe(2);
    expect(await notificationService.generate()).toBe(0);
    const types = (await notificationService.list()).map((n) => n.type).sort();
    expect(types).toEqual(['due_soon', 'overdue']);
  });
});

describe('النسخ الاحتياطي والاستيراد', () => {
  it('يصدّر ويستورد نسخة كاملة مع المرفقات (استبدال)', async () => {
    const t = await taskService.create({ title: 'مهمة للنسخ' });
    await deliverableService.create(t.id, { name: 'ملف', kind: 'pdf' }, { file: file('a.pdf', 'PDFDATA') });
    const { blob } = await exportBackup({ includeFiles: true });
    const parsed = await readBackupFile(blob);
    expect(parsed.kind).toBe('plain');
    if (parsed.kind !== 'plain') return;
    const summary = await summarizeImport(parsed.backup);
    expect(summary.counts.tasks).toBe(1);
    expect(summary.blobCount).toBe(1);

    await taskService.purge(t.id);
    expect(await getStore().tasks.count()).toBe(0);

    await importBackup(parsed.backup, 'replace');
    expect((await taskService.listActive()).map((x) => x.title)).toEqual(['مهمة للنسخ']);
    const [b] = await getStore().blobs.list();
    expect(new TextDecoder().decode(b.data)).toBe('PDFDATA');
  });

  it('الدمج لا يحذف البيانات المحلية ويحتفظ بالأحدث عند التعارض', async () => {
    const t = await taskService.create({ title: 'قديم' });
    const { blob } = await exportBackup({ includeFiles: false });
    await taskService.update(t.id, { title: 'أحدث محليًا' });
    await taskService.create({ title: 'محلية فقط' });
    const parsed = await readBackupFile(blob);
    if (parsed.kind !== 'plain') throw new Error();
    const res = await importBackup(parsed.backup, 'merge');
    expect(res.updated).toBe(0);
    const titles = (await taskService.listActive()).map((x) => x.title).sort();
    expect(titles).toEqual(['أحدث محليًا', 'محلية فقط'].sort());
  });

  it('يشفّر النسخة ويفك تشفيرها بكلمة المرور الصحيحة فقط', async () => {
    await taskService.create({ title: 'سري' });
    const { blob } = await exportBackup({ includeFiles: false, password: 'correct-horse' });
    const text = await blob.text();
    expect(text).not.toContain('سري');
    const parsed = await readBackupFile(blob);
    expect(parsed.kind).toBe('encrypted');
    if (parsed.kind !== 'encrypted') return;
    await expect(decryptBackup(parsed.encrypted, 'wrong-password')).rejects.toThrow(/كلمة المرور/);
    const backup = await decryptBackup(parsed.encrypted, 'correct-horse');
    expect(backup.payload.tables.tasks).toHaveLength(1);
  }, 30_000);

  it('يرفض الملفات غير الصالحة والمعدّلة', async () => {
    await expect(parseBackupText('not json')).rejects.toThrow(/JSON/);
    await expect(parseBackupText('{"app":"other"}')).rejects.toThrow(/ليس نسخة/);
    await expect(parseBackupText('{"app":"maham","format":1}')).rejects.toThrow(/غير صالحة/);
    await taskService.create({ title: 'أصلي' });
    const { blob } = await exportBackup({ includeFiles: false });
    const tampered = (await blob.text()).replace('أصلي', 'معدّل');
    await expect(parseBackupText(tampered)).rejects.toThrow(/سلامة/);
    await expect(readBackupFile(new Blob([]))).rejects.toThrow(/فارغ/);
  });
});

describe('معالجة الأخطاء', () => {
  it('يكتشف امتلاء مساحة التخزين ويعرض رسالة مفهومة', () => {
    const quota = Object.assign(new Error('x'), { name: 'QuotaExceededError' });
    expect(isQuotaError(quota)).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(toUserMessage(quota)).toMatch(/مساحة التخزين/);
    expect(toUserMessage(new TypeError('internal secret'))).not.toMatch(/secret/);
  });
});
