import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmHost } from '@/components/layout/ConfirmHost';
import { PwaUpdater } from '@/components/layout/PwaUpdater';
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog';
import { LoadingBlock } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ensureSetup } from '@/services/setupService';
import { notificationService } from '@/services/notificationService';
import { requestPersistence } from '@/services/backupService';
import { useTheme } from '@/hooks/useTheme';
import DashboardPage from '@/pages/DashboardPage';
import TasksPage from '@/pages/TasksPage';

// تحميل كسول للصفحات الأقل استخدامًا لتسريع الفتح الأول
const TaskDetailPage = lazy(() => import('@/pages/TaskDetailPage'));
const UrgentPage = lazy(() => import('@/pages/UrgentPage'));
const BacklogPage = lazy(() => import('@/pages/BacklogPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const AiPage = lazy(() => import('@/pages/AiPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: unknown) {
    // لا تُسجَّل بيانات المهام؛ نوع الخطأ فقط
    console.error('MAHAM render error:', error instanceof Error ? error.name : 'unknown');
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-bold">حدث خطأ غير متوقع في عرض الصفحة</h1>
          <p className="mt-2 text-sm text-muted-foreground">بياناتك محفوظة. أعد تحميل الصفحة للمتابعة.</p>
          <Button className="mt-4" onClick={() => location.reload()}>
            إعادة التحميل
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function useBootstrap() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let timer: number | undefined;
    const check = () => notificationService.generate().catch(() => undefined);
    ensureSetup()
      .then(() => {
        setState('ready');
        void requestPersistence();
        void check();
        timer = window.setInterval(check, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', onVisible);
      })
      .catch(() => setState('error'));
    function onVisible() {
      if (document.visibilityState === 'visible') void check();
    }
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return state;
}

export function App() {
  const state = useBootstrap();
  const { theme } = useTheme();

  if (state === 'error') {
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">تعذّر فتح قاعدة البيانات المحلية</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          قد يكون المتصفح في وضع التصفح الخاص أو أن التخزين معطّل. فعّل تخزين المواقع ثم أعد المحاولة.
        </p>
        <Button className="mt-4" onClick={() => location.reload()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="mx-auto mt-24 max-w-md p-6">
        <LoadingBlock rows={3} />
      </div>
    );
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<Lazy><TaskDetailPage /></Lazy>} />
            <Route path="urgent" element={<Lazy><UrgentPage /></Lazy>} />
            <Route path="backlog" element={<Lazy><BacklogPage /></Lazy>} />
            <Route path="calendar" element={<Lazy><CalendarPage /></Lazy>} />
            <Route path="reports" element={<Lazy><ReportsPage /></Lazy>} />
            <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
            <Route path="ai" element={<Lazy><AiPage /></Lazy>} />
            <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
            <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
          </Route>
        </Routes>
        <QuickAddDialog />
        <ConfirmHost />
      </ErrorBoundary>
      <PwaUpdater />
      <Toaster dir="rtl" position="top-center" richColors closeButton theme={theme} toastOptions={{ style: { fontFamily: 'inherit' } }} />
    </HashRouter>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock rows={4} />}>{children}</Suspense>;
}
