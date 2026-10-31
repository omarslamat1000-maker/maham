import { useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import { AlertTriangle, Bell, BellOff, BellRing, CheckCheck, Clock, Flame, Info, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, LoadingBlock, PageHeader, type Tone } from '@/components/ui/misc';
import { useAction, useNotifications, useSettings } from '@/hooks/data';
import { browserNotificationsSupported, notificationService } from '@/services/notificationService';
import { settingsService } from '@/services/settingsService';
import type { NotificationType } from '@/types/entities';
import { NOTIFICATION_TYPE_LABEL } from '@/utils/labels';
import { relativeTime } from '@/utils/date';
import { cn } from '@/utils/cn';
import { isIos, isStandalone } from '@/hooks/usePwa';

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  due_soon: Clock,
  overdue: AlertTriangle,
  urgent: Flame,
  needs_review: Send,
  changes_requested: RotateCcw,
};
const TYPE_TONE: Record<NotificationType, Tone> = {
  due_soon: 'info',
  overdue: 'danger',
  urgent: 'warning',
  needs_review: 'primary',
  changes_requested: 'warning',
};

export default function NotificationsPage() {
  const notifications = useNotifications();
  const settings = useSettings();
  const { run } = useAction();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const supported = browserNotificationsSupported();
  const permission = supported ? Notification.permission : 'unsupported';

  const enableBrowser = async () => {
    const p = await notificationService.requestPermission();
    if (p === 'granted') await run(() => settingsService.update({ browserNotifications: true }), 'تم تفعيل تنبيهات المتصفح');
    else if (p === 'denied') toast.error('رُفض إذن التنبيهات. يمكنك تفعيله من إعدادات الموقع في المتصفح.');
  };

  if (!notifications || !settings) return <LoadingBlock />;
  const list = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div>
      <PageHeader
        title="مركز التنبيهات"
        description="يُفحص الاستحقاق والتأخير عند فتح التطبيق وكل 5 دقائق أثناء استخدامه."
        actions={
          <Button variant="outline" onClick={() => run(() => notificationService.markAllRead(), 'تم تعليم الكل كمقروء')} disabled={!notifications.some((n) => !n.read)}>
            <CheckCheck aria-hidden />
            تعليم الكل كمقروء
          </Button>
        }
      />

      <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {settings.browserNotifications && permission === 'granted' ? (
            <BellRing className="size-5 text-success" aria-hidden />
          ) : (
            <BellOff className="size-5 text-muted-foreground" aria-hidden />
          )}
          <div className="flex-1">
            <p className="font-medium">تنبيهات المتصفح / النظام</p>
            <p className="text-muted-foreground">
              {!supported
                ? isIos() && !isStandalone()
                  ? 'على iPhone/iPad: ثبّت التطبيق على الشاشة الرئيسية أولًا لتفعيل التنبيهات.'
                  : 'هذا المتصفح لا يدعم تنبيهات الويب.'
                : permission === 'denied'
                  ? 'رُفض الإذن. فعّله من إعدادات الموقع في المتصفح.'
                  : settings.browserNotifications && permission === 'granted'
                    ? 'مفعّلة.'
                    : 'غير مفعّلة.'}
            </p>
          </div>
          {supported && permission !== 'denied' && (
            settings.browserNotifications && permission === 'granted' ? (
              <Button variant="outline" size="sm" onClick={() => run(() => settingsService.update({ browserNotifications: false }), 'تم الإيقاف')}>
                إيقاف
              </Button>
            ) : (
              <Button size="sm" onClick={enableBrowser}>
                تفعيل
              </Button>
            )
          )}
        </div>
        <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          القيود: التطبيق بلا خادم، لذا تُولَّد التنبيهات فقط أثناء فتح التطبيق (أو بقائه في الخلفية). عند إغلاقه بالكامل لن تصل تنبيهات حتى تفتحه مجددًا،
          وعندها تظهر جميع التنبيهات المستحقة.
        </p>
      </div>

      <div className="mb-3 flex gap-1">
        {(['unread', 'all'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'soft' : 'ghost'} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f === 'unread' ? `غير المقروءة (${notifications.filter((n) => !n.read).length})` : `الكل (${notifications.length})`}
          </Button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Bell} title="لا توجد تنبيهات" description={filter === 'unread' ? 'أنت مطّلع على كل شيء.' : undefined} />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const Icon = TYPE_ICON[n.type];
            return (
              <li key={n.id} className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3.5', !n.read && 'border-s-4 border-s-primary')}>
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    <Badge tone={TYPE_TONE[n.type]}>{NOTIFICATION_TYPE_LABEL[n.type]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    {n.taskId && (
                      <Link to={`/tasks/${n.taskId}`} onClick={() => notificationService.markRead(n.id)} className="font-medium text-primary hover:underline">
                        فتح المهمة
                      </Link>
                    )}
                    {!n.read && (
                      <button type="button" onClick={() => notificationService.markRead(n.id)} className="text-muted-foreground hover:text-foreground">
                        تعليم كمقروء
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
