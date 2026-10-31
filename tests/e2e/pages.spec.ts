import { expect, test } from '@playwright/test';
import { createTask, openApp } from './helpers';

test('جميع الصفحات تعمل دون أخطاء في وحدة التحكم', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await openApp(page);
  await createTask(page, 'مهمة للفحص', { openDetails: false });
  const pages: [string, string][] = [
    ['/', 'لوحة القيادة التنفيذية'],
    ['/tasks', 'المهام'],
    ['/urgent', 'المهام العاجلة'],
    ['/backlog', 'بنك الأفكار'],
    ['/calendar', 'التقويم'],
    ['/reports', 'التقارير والتحليلات'],
    ['/notifications', 'مركز التنبيهات'],
    ['/ai', 'MAHAM AI'],
    ['/settings', 'الإعدادات'],
    ['/does-not-exist', 'الصفحة غير موجودة'],
  ];
  for (const [path, heading] of pages) {
    await openApp(page, path);
    await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('MAHAM AI: بناء البرومبت وتحليل الرد وتطبيق الخطوات بعد الموافقة', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await createTask(page, 'تنظيم ورشة عمل');
  await page.getByRole('button', { name: 'خيارات المهمة' }).click();
  await page.getByRole('menuitem', { name: 'تحليل بالمساعد الذكي' }).click();
  await expect(page.getByRole('heading', { name: 'MAHAM AI' })).toBeVisible();
  await page.getByRole('button', { name: 'إنشاء البرومبت' }).click();
  await expect(page.getByRole('textbox', { name: 'البرومبت' })).toHaveValue(/تنظيم ورشة عمل/);
  // إخفاء الأسماء مفعّل افتراضيًا
  await expect(page.getByRole('textbox', { name: 'البرومبت' })).not.toHaveValue(/مدير النظام/);

  await page.getByLabel('رد Gemini').fill('```json\n{"steps":[{"title":"حجز القاعة","weight":2},{"title":"دعوة المشاركين","weight":1}]}\n```');
  await page.getByRole('button', { name: 'تحليل الرد والتحقق منه' }).click();
  await expect(page.getByText('تم التحقق من البنية')).toBeVisible();
  await page.getByRole('button', { name: /تطبيق العناصر المحددة/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تطبيق' }).click();
  await expect(page.getByText('تم تطبيق التغييرات')).toBeVisible();

  await page.goto(page.url().replace(/#.*$/, '#/tasks'));
  await page.getByRole('link', { name: 'تنظيم ورشة عمل' }).click();
  await page.getByRole('tab', { name: 'الخطوات' }).click();
  await expect(page.getByText('حجز القاعة')).toBeVisible();
  await expect(page.getByText('دعوة المشاركين')).toBeVisible();

  // رد غير صالح يُرفض
  await page.goto(page.url().replace(/#.*$/, '#/ai'));
  await page.getByRole('button', { name: /ملخص تنفيذي/ }).click();
  await page.getByLabel('رد Gemini').fill('هذا ليس JSON');
  await page.getByRole('button', { name: 'تحليل الرد والتحقق منه' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'JSON' })).toBeVisible();
});
