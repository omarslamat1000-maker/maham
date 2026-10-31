import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createTask, openApp } from './helpers';

test('تصدير نسخة احتياطية واستيرادها في متصفح نظيف', async ({ page, browser }) => {
  await openApp(page);
  await createTask(page, 'مهمة للنقل بين الأجهزة');

  await openApp(page, '/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير النسخة الاحتياطية' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^maham-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.app).toBe('maham');
  expect(json.payload.tables.tasks).toHaveLength(1);

  // سياق جديد = جهاز آخر بقاعدة بيانات فارغة
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await openApp(other, '/settings');
  await other.locator('#bk-file').setInputFiles(path);
  const summary = other.getByRole('dialog', { name: 'ملخص النسخة قبل الاستيراد' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('سجلات جديدة')).toBeVisible();
  await summary.getByRole('button', { name: 'دمج' }).click();
  await expect(other.getByText(/اكتمل الاستيراد/)).toBeVisible();
  await openApp(other, '/tasks');
  await expect(other.getByRole('link', { name: 'مهمة للنقل بين الأجهزة' })).toBeVisible();
  await ctx.close();
});

test('رفض ملف استيراد غير صالح', async ({ page }) => {
  await openApp(page, '/settings');
  await page.locator('#bk-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('هذا الملف ليس نسخة احتياطية من تطبيق مهام')).toBeVisible();
  await page.locator('#bk-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await expect(page.getByText('الملف ليس بصيغة JSON صالحة')).toBeVisible();
});

test('النسخة المشفرة تتطلب كلمة المرور الصحيحة', async ({ page }) => {
  await openApp(page);
  await createTask(page, 'مهمة سرية', { openDetails: false });
  await openApp(page, '/settings');
  await page.getByLabel(/تشفير النسخة/).check();
  await page.getByLabel('كلمة المرور', { exact: true }).fill('strong-pass-1');
  await page.getByLabel('تأكيد كلمة المرور').fill('strong-pass-1');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير النسخة الاحتياطية' }).click();
  const path = await (await dl).path();
  expect(readFileSync(path, 'utf8')).not.toContain('مهمة سرية');

  await page.locator('#bk-file').setInputFiles(path);
  const pw = page.getByRole('dialog', { name: 'نسخة مشفّرة' });
  await pw.getByLabel('كلمة المرور').fill('wrong-password');
  await pw.getByRole('button', { name: 'فك التشفير' }).click();
  await expect(page.getByText('كلمة المرور غير صحيحة أو الملف تالف')).toBeVisible();
  await pw.getByLabel('كلمة المرور').fill('strong-pass-1');
  await pw.getByRole('button', { name: 'فك التشفير' }).click();
  await expect(page.getByRole('dialog', { name: 'ملخص النسخة قبل الاستيراد' })).toBeVisible();
});
