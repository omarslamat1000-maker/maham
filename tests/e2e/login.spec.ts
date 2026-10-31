import { expect, test } from '@playwright/test';
import { login, openApp, TEST_PASSWORD } from './helpers';

test('صفحة الدخول: إنشاء كلمة المرور، رفض الخاطئة، استمرار الجلسة، والخروج', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  // لا يمكن الوصول للمحتوى دون دخول
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
  await page.reload();
  await expect(page.getByRole('button', { name: 'قائمة الحساب' })).toBeVisible();

  // تسجيل الخروج
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();

  // كلمة مرور خاطئة
  await page.getByRole('radio', { name: /مدير النظام/ }).click();
  await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-pass-1');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByRole('alert')).toContainText('غير صحيحة');

  await page.getByLabel('كلمة المرور', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  // يعود المستخدم إلى الصفحة التي طلبها قبل الدخول
  await expect(page.getByRole('heading', { level: 1, name: 'المهام' })).toBeVisible();
});

test('المدير الثاني يدخل بكلمة مروره، والأول يستطيع إعادة تعيينها', async ({ page }) => {
  await page.goto('/');
  await login(page, 'المدير الثاني', 'second-admin-77');
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();

  await openApp(page, '/settings');
  await page.getByRole('button', { name: 'إعادة تعيين كلمة مروره' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إعادة التعيين' }).click();
  await expect(page.getByText('تمت إعادة التعيين')).toBeVisible();
});
