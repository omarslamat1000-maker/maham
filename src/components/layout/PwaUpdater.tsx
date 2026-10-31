import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

/**
 * تسجيل Service Worker بنمط "prompt": عند توفر إصدار جديد يُعرض إشعار للمستخدم
 * ليحدّث فورًا بدل تشغيل نسخة قديمة مخزنة. يفحص التحديثات كل ساعة.
 */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined);
      }, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.success('التطبيق جاهز للعمل دون اتصال');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    toast('يتوفر إصدار جديد من التطبيق', {
      duration: Infinity,
      action: { label: 'تحديث الآن', onClick: () => updateServiceWorker(true) },
      cancel: { label: 'لاحقًا', onClick: () => setNeedRefresh(false) },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
