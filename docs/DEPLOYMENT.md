# دليل النشر — GitHub Pages

## البنية

| المكوّن | الدور |
| --- | --- |
| GitHub Repository | الكود المصدري |
| GitHub Actions | `ci.yml` لطلبات الدمج، `deploy.yml` للنشر من `main` |
| GitHub Pages | استضافة الملفات الثابتة (`dist/`) |
| GitHub Releases | إصدارات موسومة `vX.Y.Z` |

## الإعداد لأول مرة

1. أنشئ المستودع وادفع الكود إلى `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**
   (أو عبر CLI: `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`).
3. يعمل `deploy.yml` تلقائيًا مع كل دفع إلى `main`، أو يدويًا من تبويب Actions (`workflow_dispatch`).

> GitHub Pages للمستودعات الخاصة يتطلب خطة مدفوعة. التطبيق لا يحتوي بيانات مستخدمين في المستودع، لذا المستودع العام آمن.

## خطوات Workflow النشر

`npm ci` ← `typecheck` ← `lint` ← `test` ← `npm audit (prod)` ← `build` ← `upload-pages-artifact` ← `deploy-pages`.

- الصلاحيات: `contents: read` عامة، و`pages: write` + `id-token: write` لمهمة النشر فقط.
- الإجراءات الرسمية مثبتة بـ SHA كامل مع رقم الإصدار في تعليق. Dependabot يحدّثها شهريًا.

## المسار الأساسي (Base Path)

يُحسب تلقائيًا في `vite.config.ts`:
- مستودع `<user>.github.io` ← `/`
- مستودع مشروع `maham` ← `/maham/`
- محليًا ← `/`
- تجاوز يدوي: `VITE_BASE=/custom/ npm run build`

التوجيه بـ `HashRouter` (`/#/tasks/...`) فلا تحدث أخطاء 404 عند تحديث الصفحة على Pages.

## إصدار جديد

```bash
npm version minor          # يحدّث package.json وينشئ وسم vX.Y.0
git push --follow-tags
gh release create v1.1.0 --generate-notes
```

يكتشف Service Worker الإصدار الجديد ويعرض للمستخدم «تحديث الآن».

## استكشاف الأخطاء

| المشكلة | الحل |
| --- | --- |
| صفحة بيضاء بعد النشر | تحقق من `base` (اسم المستودع) وأن Source = GitHub Actions |
| فشل `deploy` بخطأ صلاحيات | فعّل Pages أولًا، وتأكد من بيئة `github-pages` |
| المستخدمون يرون نسخة قديمة | سيظهر لهم «يتوفر إصدار جديد» خلال ساعة أو عند إعادة الفتح |

## الذكاء الاصطناعي عبر GitHub Actions (غير مفعّل عمدًا)

تشغيل Gemini داخل Actions بمفتاح في GitHub Secrets ممكن تقنيًا، لكنه **غير مناسب** هنا لأن:
1. بيانات المهام موجودة في متصفح المستخدم فقط ولا يصل إليها Workflow.
2. تمرير البيانات كمدخلات `workflow_dispatch` يجعلها مرئية في سجلات Actions — وهي **عامة** في المستودع العام.
3. Actions ليست خادم API لحظيًا.

البديل المعتمد: الوضع اليدوي (نسخ/لصق)، أو مستقبلًا وسيط آمن (انظر BACKEND_ROADMAP.md).
