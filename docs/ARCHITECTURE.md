# البنية المعمارية — مهام | MAHAM

## 1. القيود الحاكمة

| القيد | الأثر على التصميم |
| --- | --- |
| GitHub Pages استضافة ثابتة | لا خادم، لا API، كل المنطق في المتصفح |
| لا قواعد بيانات خارجية | IndexedDB عبر Dexie لكل جهاز |
| لا أسرار في الواجهة | Gemini يدوي (نسخ/لصق) مع طبقة مزود قابلة للترقية |
| مستخدمان بصلاحيات متساوية | ملفا عمل محليان بكلمتي مرور (بصمات PBKDF2) — قفل محلي وليس مصادقة خادمية |

## 2. الطبقات

```
┌──────────────────────────────────────────────┐
│ pages / features / components   (React UI)  │
├──────────────────────────────────────────────┤
│ hooks/data.ts  (useLiveQuery → services)     │
├──────────────────────────────────────────────┤
│ services/*     (تحقق، معاملات، سجل نشاط)     │
├──────────────────────────────────────────────┤
│ domain/*       (منطق أعمال نقي + Zod)        │
├──────────────────────────────────────────────┤
│ data/          Repository ← DexieRepository  │
│                IndexedDB (maham)             │
└──────────────────────────────────────────────┘
```

- **الواجهة لا تستعلم قاعدة البيانات مباشرة.** الخطافات تستدعي دوال الخدمات داخل `useLiveQuery`، فيُعاد الرسم تلقائيًا عند أي تغيير.
- **`Repository<T>`** واجهة عامة؛ `DexieRepository` محوّلها المحلي. استبدالها لاحقًا بمحوّل REST/Sync لا يمس الواجهات.
- **`domain/`** دوال نقية قابلة للاختبار: `progress.ts`, `lifecycle.ts`, `checklist.ts`, `urgency.ts`, `metrics.ts`, `taskQuery.ts`, `schemas.ts`.

## 3. نموذج البيانات (IndexedDB v1)

| الجدول | الوصف | فهارس |
| --- | --- | --- |
| `users` | ملفا العمل | id |
| `categories` | التصنيفات (حذف منطقي) | id |
| `tasks` | المهام (حذف منطقي) | status, submissionStatus, assigneeId, categoryId, dueDate, updatedAt, sourceIdeaId |
| `steps` | الخطوات التنفيذية | taskId |
| `updates` | تحديثات المهمة | taskId, createdAt |
| `deliverables` | المخرجات | taskId |
| `deliverableVersions` | سجل إصدارات المخرجات | deliverableId, taskId |
| `blobs` | محتوى الملفات الثنائي | id |
| `checklist` | متطلبات التسليم | taskId |
| `approvals` | قرارات التسليم | taskId |
| `ideas` | بنك الأفكار | status |
| `notifications` | التنبيهات (مفتاح فريد لمنع التكرار) | &dedupeKey, taskId, createdAt |
| `activity` | سجل النشاط | taskId, at |
| `settings` | الإعدادات | id |

كل سجل: `id` (UUID v4)، `createdAt`, `updatedAt`, `createdBy`, `updatedBy`. الطوابع الزمنية متزايدة بصرامة لضمان ترتيب ثابت.

### الترحيلات
أضف `this.version(N).stores(...).upgrade(...)` في `src/data/db.ts`، وحدّث `SCHEMA_VERSION` و`migrateBackupData()` لاستيراد النسخ الأقدم.

## 4. منطق الأعمال الأساسي

### الإنجاز المرجح
```
Task Progress = Σ(weight_i × progress_i) / Σ(weight_i)
```
- لا خطوات → `null` (تُعرض 0%، أو 100% للمكتملة).
- الأوزان السالبة → 0، النسب تُقيَّد 0–100، مجموع أوزان صفري → أوزان متساوية.
- `computedProgress` محفوظ منفصلًا عن `manualProgress` (مع السبب والمنفذ والتاريخ). القيمة الفعّالة = اليدوية إن وُجدت.

### دورة الحياة
- الحالة: `new → in_progress → completed` (الإكمال عبر الاعتماد فقط).
- التسليم: `not_submitted → submitted → (changes_requested | approved)`، و`reopened` من المكتملة.
- الاعتماد يتطلب استيفاء متطلبات قائمة التحقق الإلزامية (منها قواعد آلية: كل الخطوات منجزة، ووجود مخرج نهائي).

### تعريفات المؤشرات
موثقة في رأس `src/domain/metrics.ts` وفي صفحة التقارير («منهجية حساب المؤشرات»).

## 5. الأمان
انظر [SECURITY.md](SECURITY.md).

## 6. PWA
- `vite-plugin-pwa` بنمط `prompt`: Service Worker يخزن الأصول مسبقًا، ويعرض «يتوفر إصدار جديد» بدل التشغيل الصامت لنسخة قديمة، مع `cleanupOutdatedCaches`.
- فحص التحديث كل ساعة.

## 7. المساعد الذكي (MAHAM AI)
```
actions.ts        كتالوج 10 إجراءات + مخطط Zod لكل رد
promptBuilder.ts  بناء برومبت بأقل بيانات لازمة (+ إخفاء الأسماء)
parser.ts         استخراج JSON والتحقق منه
providers.ts      AIProvider: manualGeminiProvider | GeminiProxyProvider (معطل حتى يُضبط وسيط آمن)
applyService.ts   تطبيق النتائج بعد موافقة المستخدم فقط
```
الترقية لاستدعاء مباشر: وفّر وسيطًا آمنًا يحتفظ بمفتاح Gemini على الخادم، واضبط `VITE_AI_PROXY_URL` عند البناء؛ يُضاف أصله تلقائيًا إلى CSP.
