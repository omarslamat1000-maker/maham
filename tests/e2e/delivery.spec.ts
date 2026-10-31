import { expect, test } from '@playwright/test';
import { confirm, createTask, openApp, openTab } from './helpers';

test('رفع مخرج، تقديم للمراجعة، رفض بسبب، ثم اعتماد', async ({ page }) => {
  await openApp(page);
  await createTask(page, 'دراسة الجدوى');

  // رفع مخرج نهائي
  await openTab(page, 'المخرجات');
  await page.getByRole('button', { name: 'إضافة مخرج' }).click();
  const dlg = page.getByRole('dialog', { name: 'إضافة مخرج' });
  await dlg.getByLabel('اسم المخرج').fill('الدراسة النهائية');
  await dlg.getByLabel('الملف').setInputFiles({ name: 'study.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('docx-bytes') });
  await dlg.getByLabel('هذا هو المخرج النهائي للتسليم').check();
  await dlg.getByRole('button', { name: 'حفظ المخرج' }).click();
  await expect(page.getByText('الدراسة النهائية')).toBeVisible();
  await expect(page.getByText('الإصدار 1')).toBeVisible();

  // نوع غير مدعوم مرفوض
  await page.getByRole('button', { name: 'إضافة مخرج' }).click();
  await dlg.getByLabel('الملف').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(dlg.getByText(/غير مدعوم/)).toBeVisible();
  await dlg.getByRole('button', { name: 'إلغاء' }).click();

  // قائمة التحقق: الاعتماد ممنوع قبل استيفاء المتطلبات
  await openTab(page, 'التسليم والاعتماد');
  await page.getByRole('button', { name: 'تقديم للمراجعة' }).click();
  await confirm(page, 'تقديم');
  await expect(page.getByRole('button', { name: 'اعتماد' })).toBeDisabled();
  await expect(page.getByText('لا يمكن الاعتماد قبل استيفاء:')).toBeVisible();

  // رفض مع سبب
  await page.getByRole('button', { name: 'طلب تعديلات' }).click();
  await confirm(page, 'طلب تعديلات', 'ينقص تحليل المخاطر');
  await expect(page.getByText('ملاحظات المراجعة')).toBeVisible();
  await expect(page.getByText('ينقص تحليل المخاطر').first()).toBeVisible();
  await expect(page.getByText('قيد التنفيذ').first()).toBeVisible();

  // استيفاء المتطلبات اليدوية ثم إعادة التقديم والاعتماد
  for (const name of ['مراجعة المحتوى', 'استكمال متطلبات التسليم']) {
    const box = page.getByRole('checkbox', { name });
    await box.click();
    await expect(box).toBeChecked();
  }
  await page.getByRole('button', { name: 'تقديم للمراجعة' }).click();
  await confirm(page, 'تقديم');
  await expect(page.getByRole('button', { name: 'اعتماد' })).toBeEnabled();
  await page.getByRole('button', { name: 'اعتماد' }).click();
  await confirm(page, 'اعتماد', 'ممتاز');
  await expect(page.getByText('مكتملة').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة فتح' })).toBeVisible();

  // سجل القرارات
  await expect(page.getByText('طلب تعديلات —').first()).toBeVisible();

  // التقارير تعكس الإنجاز الفعلي
  await openApp(page, '/reports');
  await expect(page.getByRole('region', { name: 'ملخص المؤشرات' }).getByText('المكتملة في الفترة').locator('..')).toContainText('1');
});

test('بنك الأفكار: إنشاء فكرة وتحويلها إلى مهمة', async ({ page }) => {
  await openApp(page, '/backlog');
  await page.getByRole('button', { name: 'فكرة جديدة' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'فكرة جديدة' });
  await dlg.getByLabel('عنوان الفكرة').fill('بوابة خدمة ذاتية');
  await dlg.getByLabel('وصف مختصر').fill('تمكين العملاء من تتبع الطلبات');
  await dlg.getByLabel('القيمة المتوقعة').selectOption({ label: 'قيمة عالية' });
  await dlg.getByRole('button', { name: 'حفظ الفكرة' }).click();
  await expect(page.getByRole('heading', { name: 'بوابة خدمة ذاتية' })).toBeVisible();

  await page.getByRole('button', { name: 'تحويل إلى مهمة' }).click();
  await confirm(page, 'تحويل');
  await expect(page.getByRole('heading', { level: 1, name: 'بوابة خدمة ذاتية' })).toBeVisible();
  await expect(page.getByLabel('وصف المهمة')).toHaveValue(/تمكين العملاء/);

  // الفكرة الأصلية محفوظة بحالة "حُوّلت"
  await openApp(page, '/backlog');
  await page.getByRole('tab', { name: /حُوّلت إلى مهمة/ }).click();
  await expect(page.getByRole('link', { name: /فتح المهمة/ })).toBeVisible();
});
