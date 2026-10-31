import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('واجهة الجوال', () => {
  test('التنقل السفلي والإنشاء السريع ولا يوجد تمرير أفقي', async ({ page }) => {
    await openApp(page);
    const bottomNav = page.getByRole('navigation', { name: 'التنقل السفلي' });
    await expect(bottomNav).toBeVisible();
    // الشريط الجانبي مخفي على الجوال
    await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeHidden();

    await bottomNav.getByRole('button', { name: 'مهمة جديدة' }).click();
    const dialog = page.getByRole('dialog', { name: 'مهمة جديدة' });
    await dialog.getByLabel('عنوان المهمة').fill('مهمة من الجوال');
    await dialog.getByRole('button', { name: 'حفظ المهمة' }).click();
    await expect(dialog).toBeHidden();

    await bottomNav.getByRole('link', { name: 'المهام' }).click();
    await expect(page.getByRole('link', { name: 'مهمة من الجوال' })).toBeVisible();

    // قائمة "المزيد"
    await bottomNav.getByRole('button', { name: 'المزيد' }).click();
    await page.getByRole('link', { name: 'التقويم' }).click();
    await expect(page.getByRole('heading', { name: 'التقويم' })).toBeVisible();

    for (const path of ['/', '/tasks', '/calendar', '/reports', '/settings', '/ai', '/backlog']) {
      await openApp(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `تمرير أفقي في ${path}`).toBeLessThanOrEqual(1);
    }
  });
});
