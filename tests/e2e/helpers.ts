import { expect, type Page } from '@playwright/test';

/** كلمة مرور اختبارية للبيئة المحلية فقط */
export const TEST_PASSWORD = 'maham-e2e-2026';

/** يختار ملف العمل ويسجل الدخول (وينشئ كلمة المرور في أول دخول) */
export async function login(page: Page, profile = 'مدير النظام', password = TEST_PASSWORD) {
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(profile) }).click();
  await page.getByLabel(/^كلمة المرور/).fill(password);
  const confirm = page.getByLabel('تأكيد كلمة المرور');
  if (await confirm.isVisible()) {
    await confirm.fill(password);
    await page.getByRole('button', { name: 'إنشاء كلمة المرور والدخول' }).click();
  } else {
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  }
  await expect(page.getByRole('button', { name: 'قائمة الحساب' })).toBeVisible();
}

export async function openApp(page: Page, path = '/') {
  await page.goto(`/#${path}`);
  const loginHeading = page.getByRole('heading', { name: 'تسجيل الدخول', exact: true });
  const shell = page.getByRole('button', { name: 'قائمة الحساب' });
  await expect(loginHeading.or(shell)).toBeVisible();
  if (await loginHeading.isVisible()) await login(page);
  await expect(page.locator('#main')).toBeVisible();
}

/** إنشاء مهمة عبر نافذة الإنشاء السريع ثم فتح تفاصيلها */
export async function createTask(
  page: Page,
  title: string,
  opts: { startDate?: string; dueDate?: string; priority?: string; openDetails?: boolean } = {},
) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'مهمة جديدة' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'مهمة جديدة' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('عنوان المهمة').fill(title);
  if (opts.startDate) await dialog.getByLabel('تاريخ البداية').fill(opts.startDate);
  if (opts.dueDate) await dialog.getByLabel('تاريخ النهاية').fill(opts.dueDate);
  if (opts.priority) await dialog.getByLabel('الأولوية').selectOption({ label: opts.priority });
  if (opts.openDetails ?? true) {
    await dialog.getByRole('button', { name: 'حفظ وفتح التفاصيل' }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  } else {
    await dialog.getByRole('button', { name: 'حفظ المهمة' }).click();
    await expect(dialog).toBeHidden();
  }
}

export async function confirm(page: Page, button: string, reason?: string) {
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toBeVisible();
  if (reason !== undefined) await dlg.getByRole('textbox').fill(reason);
  await dlg.getByRole('button', { name: button, exact: true }).click();
  await expect(dlg).toBeHidden();
}

export async function openTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
}

export function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
