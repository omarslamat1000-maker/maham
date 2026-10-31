# CLAUDE.md — مهام | MAHAM

مرجع دائم لجلسات Claude Code على هذا المستودع. اقرأه قبل أي تعديل.

## نظرة عامة

تطبيق ويب (PWA) عربي أولًا لإدارة المهام والمخرجات لمستخدمَين اثنين. **بلا خادم**: يُستضاف على GitHub Pages
ويحفظ كل البيانات في IndexedDB داخل متصفح المستخدم. لا توجد قاعدة بيانات مركزية ولا مزامنة بين الأجهزة.

## Architecture Rules

1. **الطبقات** (اتجاه الاعتماد من الأعلى للأسفل فقط):
   - `src/pages`, `src/features`, `src/components` — واجهة المستخدم فقط.
   - `src/hooks` — ربط الواجهة بالخدمات (`useLiveQuery` يستدعي دوال الخدمات، لا Dexie مباشرة).
   - `src/services` — منطق التطبيق، التحقق، المعاملات، سجل النشاط.
   - `src/domain` — منطق أعمال **نقي** بلا I/O (الإنجاز المرجح، دورة الحياة، المؤشرات، الإلحاح، المخططات Zod).
   - `src/data` — Dexie schema + `Repository` interface + `DexieRepository` adapter + `getStore()`.
2. **ممنوع** استيراد `@/data/db` أو Dexie داخل الصفحات/المكونات. استخدم الخدمات عبر الخطافات.
3. كل حساب للمؤشرات أو الإنجاز يجب أن يكون في `src/domain` ومغطى باختبار.
4. كل سجل له `id` (UUID) و`createdAt/updatedAt/createdBy/updatedBy`. استخدم `audit()` و`touched()` من `services/core.ts`.
5. كل تعديل ذو معنى يُسجَّل عبر `logActivity()`.
6. العمليات متعددة الجداول داخل `store.transaction()`.
7. التطبيق كله خلف `LoginPage` (`useAuthStore`). المستخدم الحالي = `useAuthStore.userId` (لكل تبويب)، وليس `settings.currentUserId`. لا تضف تبديل ملف دون كلمة مرور.
8. الإكمال لا يتم إلا عبر `approvalService.perform(taskId, 'approved')` بعد استيفاء قائمة التحقق.
9. تغيير بنية IndexedDB: أضف `this.version(N+1)` في `src/data/db.ts` (لا تعدّل النسخ السابقة) وحدّث `SCHEMA_VERSION` و`migrateBackupData`.
10. التوجيه عبر `HashRouter` (متوافق مع GitHub Pages دون أخطاء 404 عند التحديث).

## Coding Standards

- TypeScript صارم، بلا `any` إلا عند الضرورة مع تعليق eslint.
- نصوص الواجهة بالعربية، والاتجاه RTL. استخدم خصائص منطقية (`ms-`, `pe-`, `start-`) بدل left/right.
- مكونات UI بنمط shadcn في `src/components/ui` (Radix + Tailwind + cva).
- الأخطاء الموجهة للمستخدم: `ServiceError` برسالة عربية، وتُعرض عبر `useAction().run()`.
- التعليقات موجزة وبالعربية عند الحاجة.
- لا أرقام وهمية: عند غياب البيانات اعرض `EmptyState`.

## Security Rules

- لا `dangerouslySetInnerHTML` (ممنوع بقاعدة ESLint).
- لا مفاتيح API أو Tokens في الكود أو localStorage أو ملفات النشر. Gemini يعمل يدويًا (نسخ/لصق) أو عبر وسيط آمن مستقبلي (`VITE_AI_PROXY_URL`).
- لا `console.log` في الإنتاج (قاعدة ESLint). لا تسجّل بيانات المهام.
- الملفات المرفوعة: تحقق من النوع والحجم (`utils/file.ts#checkFile`). لا تعرض HTML/SVG داخل أصل التطبيق؛ التنزيل يُفرض بنوع `application/octet-stream`.
- الروابط الخارجية: `safeUrl` (http/https فقط) و`rel="noopener noreferrer"`.
- CSP تُحقن في نسخة الإنتاج من `vite.config.ts`.
- لا ترفع ملفات النسخ الاحتياطية للمستودع (`.gitignore`).
- Workflows بأقل صلاحيات، والإجراءات مثبتة بـ SHA.

## Folder Structure

```
.github/workflows/   deploy.yml (Pages), ci.yml (PR checks + e2e)
public/              أيقونات PWA، logo.svg، theme-init.js
src/app/             App.tsx (bootstrap + routes), nav.ts
src/components/ui/   مكونات أساسية (button, form, misc, overlay)
src/components/      layout/ (AppShell, banners, PWA updater), tasks/ (badges, TaskRow, QuickAdd)
src/features/        task-detail/ (تبويبات صفحة المهمة)
src/pages/           صفحات التطبيق
src/services/        خدمات + ai/ (actions, promptBuilder, parser, providers, applyService)
src/domain/          منطق أعمال نقي
src/data/            Dexie + Repository
src/hooks/           data.ts, useTheme, usePwa
src/types/           entities.ts
src/utils/           date, file, crypto, export, labels, id, cn
tests/unit/          Vitest (domain, services على fake-indexeddb, utils)
tests/e2e/           Playwright
docs/                التوثيق
```

## Development Commands

```bash
npm install          # تثبيت الحزم
npm run dev          # خادم التطوير http://localhost:5173
npm run build        # بناء الإنتاج إلى dist/
npm run preview      # معاينة نسخة الإنتاج
npm run icons        # توليد أيقونات PWA من public/logo.svg
```

## Testing Commands

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # Vitest (unit + services)
npm run test:e2e     # Playwright (يبني ويشغّل preview على 4174)
npm run check        # typecheck + lint + test + build
```

أول تشغيل لـ e2e: `npx playwright install chromium`. الاختبارات تسجّل الدخول تلقائيًا عبر `openApp()` بكلمة مرور اختبارية (`tests/e2e/helpers.ts`).

## Deployment Process

- الدفع إلى `main` يشغّل `.github/workflows/deploy.yml`: فحوصات ← بناء ← رفع ← نشر على Pages.
- المسار الأساسي `base` يُحسب تلقائيًا من `GITHUB_REPOSITORY` (`/<repo>/` أو `/` لمستودع `*.github.io`).
- مصدر Pages يجب أن يكون **GitHub Actions** (Settings → Pages → Source).
- تفاصيل: `docs/DEPLOYMENT.md`.

## Known Limitations

- البيانات محلية لكل متصفح/جهاز؛ النقل يدوي عبر النسخ الاحتياطي.
- تسجيل الدخول محلي (`services/authService.ts`): بصمات PBKDF2 + إيقاف مؤقت + قفل تلقائي. ليس مصادقة خادمية، والبيانات غير مشفّرة في IndexedDB. لا تصفه بأنه "آمن خادميًا".
- التنبيهات تُولَّد فقط أثناء فتح التطبيق.
- Gemini يدوي (لا استدعاء API مباشر).
- PDF عبر نافذة طباعة المتصفح.
- انظر `docs/BACKEND_ROADMAP.md`.

## Definition of Done

- [ ] `npm run check` ناجح، و`npm run test:e2e` ناجح.
- [ ] منطق أعمال جديد في `src/domain` مع اختبارات.
- [ ] لا بيانات وهمية، وحالات تحميل/فراغ/خطأ موجودة.
- [ ] يعمل على الجوال (لا تمرير أفقي) والوضع الداكن وRTL.
- [ ] لا أسرار ولا `dangerouslySetInnerHTML` ولا `console.log`.
- [ ] التوثيق محدّث إن تغيّر السلوك.
