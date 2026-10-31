import { expect, test } from '@playwright/test';
import { confirm, createTask, isoDate, login, openApp, openTab } from './helpers';

test.describe('إدارة المهام', () => {
  test('إنشاء وتعديل وحذف مهمة بعد التأكيد ثم استرجاعها', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('ابدأ بأول مهمة')).toBeVisible();

    await createTask(page, 'إعداد خطة التسويق');
    await page.getByLabel('عنوان المهمة').fill('إعداد خطة التسويق 2027');
    await page.getByLabel('الأولوية').selectOption({ label: 'عالية' });
    await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'إعداد خطة التسويق 2027' })).toBeVisible();

    await openTab(page, 'سجل النشاط');
    await expect(page.getByText(/تغيير الأولوية من «متوسطة» إلى «عالية»/)).toBeVisible();

    // الحذف يتطلب تأكيدًا
    await page.getByRole('button', { name: 'خيارات المهمة' }).click();
    await page.getByRole('menuitem', { name: 'حذف المهمة' }).click();
    await confirm(page, 'حذف');
    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(page.getByText('لا توجد مهام بعد')).toBeVisible();

    await openApp(page, '/settings');
    await page.getByRole('button', { name: 'استرجاع' }).click();
    await openApp(page, '/tasks');
    await expect(page.getByRole('link', { name: 'إعداد خطة التسويق 2027' })).toBeVisible();
  });

  test('رفض العنوان الفارغ في الإنشاء السريع', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'مهمة جديدة' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'مهمة جديدة' });
    await dialog.getByRole('button', { name: 'حفظ المهمة' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('عنوان المهمة إلزامي');
  });

  test('الخطوات والأوزان والإنجاز المرجح', async ({ page }) => {
    await openApp(page);
    await createTask(page, 'إطلاق الموقع');
    await openTab(page, 'الخطوات');

    const addStep = async (title: string, weight: string) => {
      await page.getByLabel('عنوان الخطوة').fill(title);
      await page.getByLabel('الوزن', { exact: true }).fill(weight);
      await page.getByRole('button', { name: 'إضافة', exact: true }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    };
    await addStep('التصميم', '3');
    await addStep('البرمجة', '1');

    await page.getByLabel('حالة التصميم').selectOption({ label: 'منجزة' });
    await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '75');

    // تعديل الوزن يعيد الحساب: 3/(3+3) = 50%
    const weight = page.getByLabel('وزن البرمجة');
    await weight.fill('3');
    await weight.press('Enter');
    await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '50');

    // الوزن السالب مرفوض
    await weight.fill('-2');
    await weight.press('Enter');
    await expect(page.getByText('لا يمكن أن يكون الوزن سالبًا')).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '50');
  });

  test('إضافة تحديث مع مرفق وظهوره في الخط الزمني', async ({ page }) => {
    await openApp(page);
    await createTask(page, 'متابعة المورد');
    await openTab(page, 'التحديثات');
    await page.getByLabel('وصف التحديث').fill('تم استلام العرض الفني');
    await page.getByLabel('التحديات').fill('تأخر رد الإدارة المالية');
    await page.getByLabel('الإجراء التالي').fill('متابعة هاتفية');
    await page.getByLabel('مرفق (اختياري)').setInputFiles({ name: 'offer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
    await page.getByRole('button', { name: 'إضافة التحديث' }).click();
    const timeline = page.getByRole('list', { name: 'الخط الزمني للتحديثات' });
    await expect(timeline.getByText('تم استلام العرض الفني')).toBeVisible();
    await expect(timeline.getByText('offer.pdf')).toBeVisible();

    // يظهر في لوحة القيادة ضمن أسباب التعثر
    await openApp(page, '/');
    await expect(page.getByText('تأخر رد الإدارة المالية')).toBeVisible();
  });

  test('البحث والتصفية وبطاقات المؤشرات', async ({ page }) => {
    await openApp(page);
    await createTask(page, 'تقرير المبيعات الشهري', { priority: 'عاجلة', openDetails: false });
    await createTask(page, 'مراجعة العقود', { startDate: isoDate(-10), dueDate: isoDate(-3), openDetails: false });
    await createTask(page, 'تجديد الاشتراكات', { dueDate: isoDate(20), openDetails: false });

    // بطاقة "متأخرة" تفتح قائمة مفلترة
    await openApp(page, '/');
    await page.getByRole('link', { name: /^متأخرة/ }).click();
    await expect(page).toHaveURL(/flag=overdue/);
    await expect(page.getByRole('link', { name: 'مراجعة العقود' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'تجديد الاشتراكات' })).toHaveCount(0);

    await openApp(page, '/tasks');
    await page.getByRole('searchbox', { name: 'بحث', exact: true }).fill('تقرير المبيعات');
    await expect(page.getByRole('link', { name: 'تقرير المبيعات الشهري' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'مراجعة العقود' })).toHaveCount(0);

    await page.getByRole('button', { name: 'مسح الفلاتر' }).click();
    await page.getByLabel('الأولوية').selectOption({ label: 'عاجلة' });
    await expect(page.getByRole('list', { name: 'قائمة المهام' }).getByRole('listitem')).toHaveCount(1);

    // صفحة العاجلة
    await openApp(page, '/urgent');
    await expect(page.getByRole('link', { name: 'مراجعة العقود' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'تقرير المبيعات الشهري' })).toBeVisible();
  });

  test('استمرار البيانات بعد إعادة تحميل الصفحة', async ({ page }) => {
    await openApp(page);
    await createTask(page, 'مهمة دائمة');
    await page.reload();
    // بعد إعادة التحميل يُطلب الدخول لفك التشفير، ثم تظهر البيانات كما هي
    await login(page);
    await expect(page.getByRole('heading', { level: 1, name: 'مهمة دائمة' })).toBeVisible();
    await openApp(page, '/tasks');
    await expect(page.getByRole('link', { name: 'مهمة دائمة' })).toBeVisible();
  });

  test('الوضع الداكن يُحفظ بعد إعادة التحميل', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'تفعيل الوضع الداكن' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});
