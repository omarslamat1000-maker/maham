// تطبيق السمة قبل الرسم لمنع الوميض (ملف خارجي ليتوافق مع سياسة CSP)
try {
  var t = localStorage.getItem('maham.theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
