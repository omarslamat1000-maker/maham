import { Link } from 'react-router';
import { HardDrive, ShieldAlert, X } from 'lucide-react';
import { useSettings, useTasks } from '@/hooks/data';
import { settingsService } from '@/services/settingsService';
import { diffDays, timestampToDateOnly, todayStr } from '@/utils/date';

/**
 * تحذيرات حماية البيانات:
 * 1) أول استخدام: البيانات محلية ولا تتزامن تلقائيًا بين الأجهزة.
 * 2) تذكير بالنسخ الاحتياطي إذا مضى أكثر من 7 أيام (أو لم يُنشأ نسخة قط) مع وجود مهام.
 */
export function DataBanners() {
  const settings = useSettings();
  const tasks = useTasks();
  if (!settings || !tasks) return null;

  if (!settings.onboardingDismissed) {
    return (
      <div role="note" className="no-print mb-5 flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <div className="flex-1 space-y-1">
          <p className="font-semibold text-foreground">بياناتك محفوظة على هذا الجهاز وهذا المتصفح فقط</p>
          <p className="text-muted-foreground">
            لا توجد مزامنة تلقائية بين الأجهزة، ومسح بيانات المتصفح يحذفها. صدّر نسخة احتياطية بانتظام من{' '}
            <Link to="/settings#backup" className="font-medium text-primary underline">
              الإعدادات
            </Link>
            ، ويمكنك نقلها لجهاز آخر بالاستيراد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => settingsService.update({ onboardingDismissed: true })}
          className="rounded-md p-1 text-muted-foreground hover:bg-card"
          aria-label="إخفاء التنبيه"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const needsBackup =
    tasks.length > 0 && (!settings.lastBackupAt || diffDays(timestampToDateOnly(settings.lastBackupAt), todayStr()) >= 7);
  if (!needsBackup) return null;
  return (
    <div role="note" className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
      <HardDrive className="size-5 shrink-0 text-warning" aria-hidden />
      <p className="flex-1 text-foreground">
        {settings.lastBackupAt ? 'مضى أكثر من أسبوع على آخر نسخة احتياطية.' : 'لم تُنشئ نسخة احتياطية بعد.'} احمِ بياناتك من الفقد.
      </p>
      <Link to="/settings#backup" className="font-medium text-warning underline">
        إنشاء نسخة الآن
      </Link>
    </div>
  );
}
