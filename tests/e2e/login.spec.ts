import { expect, test } from '@playwright/test';
import { login, openApp, TEST_PASSWORD } from './helpers';

test('الدخول: إنشاء كلمة المرور، رفض الخاطئة، القفل عند إعادة التحميل، والخروج', async ({ page }) => {
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(2);

  // كلمة مرور ضعيفة مرفوضة
  await page.getByRole('radio', { name: /مدير النظام/ }).click();
  await page.getByLabel('كلمة المرور الجديدة').fill('123');
  await page.getByLabel('تأكيد كلمة المرور').fill('123');
  await page.getByRole('button', { name: 'إنشاء كلمة المرور والدخول' }).click();
  await expect(page.getByRole('alert')).toContainText('8 أحرف');

  await login(page);
  // يعود المستخدم إلى الصفحة التي طلبها قبل الدخول
  await expect(page.getByRole('heading', { level: 1, name: 'المهام' })).toBeVisible();

  // مفتاح البيانات في الذاكرة فقط: إعادة التحميل تتطلب الدخول مجددًا
  await page.reload();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();

  await page.getByRole('radio', { name: /مدير النظام/ }).click();
  await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-pass-1');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByRole('alert')).toContainText('غير صحيحة');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByRole('button', { name: 'قائمة الحساب' })).toBeVisible();

  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
});

test('تفعيل المدير الثاني بكلمة مؤقتة ثم إلزامه بتغييرها، ورؤيته لنفس البيانات', async ({ page }) => {
  await openApp(page, '/tasks');
  await page.getByRole('button', { name: 'مهمة جديدة' }).first().click();
  await page.getByRole('dialog', { name: 'مهمة جديدة' }).getByLabel('عنوان المهمة').fill('مهمة مشتركة مشفّرة');
  await page.getByRole('button', { name: 'حفظ المهمة' }).click();

  // الملف الثاني بانتظار التفعيل
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
  await page.getByRole('radio', { name: /المدير الثاني/ }).click();
  await expect(page.getByText('هذا الملف بانتظار التفعيل')).toBeVisible();

  // الأول يعيّن كلمة مؤقتة
  await login(page);
  await openApp(page, '/settings');
  await page.getByLabel('كلمة المرور المؤقتة').fill('temp-pass-42');
  await page.getByLabel('تأكيد الكلمة المؤقتة').fill('temp-pass-42');
  await page.getByRole('button', { name: 'تعيين كلمة مرور مؤقتة' }).click();
  await expect(page.getByText('تم تعيين كلمة المرور المؤقتة')).toBeVisible();
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();

  // الثاني يدخل بالمؤقتة ويُلزم بتعيين كلمة دائمة
  await page.getByRole('radio', { name: /المدير الثاني/ }).click();
  await page.getByLabel('كلمة المرور', { exact: true }).fill('temp-pass-42');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByText('دخلت بكلمة مرور مؤقتة')).toBeVisible();
  await page.getByLabel('كلمة المرور الجديدة').fill('second-admin-77');
  await page.getByLabel('تأكيد كلمة المرور').fill('second-admin-77');
  await page.getByRole('button', { name: 'حفظ كلمة المرور والدخول' }).click();
  await expect(page.getByRole('button', { name: 'قائمة الحساب' })).toBeVisible();
  await openApp(page, '/tasks');
  await expect(page.getByRole('link', { name: 'مهمة مشتركة مشفّرة' })).toBeVisible();

  // البيانات الخام في IndexedDB لا تحتوي العنوان
  const raw = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('maham');
        req.onsuccess = () => {
          const tx = req.result.transaction('tasks', 'readonly');
          const all = tx.objectStore('tasks').getAll();
          all.onsuccess = () => resolve(JSON.stringify(all.result));
        };
      }),
  );
  expect(raw).not.toContain('مهمة مشتركة');
});
