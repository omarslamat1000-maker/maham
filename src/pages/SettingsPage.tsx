import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { Download, HardDrive, Lock, MonitorSmartphone, Palette, Plus, RotateCcw, Shield, Tags, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingBlock, PageHeader, Progress } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { useAction, useCategories, useCurrentUser, useDeletedTasks, useSettings, useUsers } from '@/hooks/data';
import { useInstallPrompt } from '@/hooks/usePwa';
import { useTheme } from '@/hooks/useTheme';
import { confirmDialog } from '@/stores/uiStore';
import { settingsService, userService } from '@/services/settingsService';
import { categoryService } from '@/services/ideaService';
import { taskService } from '@/services/taskService';
import { ensureSetup } from '@/services/setupService';
import {
  decryptBackup,
  exportBackup,
  importBackup,
  readBackupFile,
  requestPersistence,
  storageInfo,
  summarizeImport,
  type BackupFile,
  type ImportMode,
  type ImportSummary,
  type StorageInfo,
} from '@/services/backupService';
import { CATEGORY_COLORS } from '@/utils/labels';
import { downloadBlob, formatBytes } from '@/utils/file';
import { formatDateTime } from '@/utils/date';

function Section({ id, icon: Icon, title, children }: { id?: string; icon: typeof Users; title: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5 text-primary" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ProfilesSection() {
  const users = useUsers();
  const me = useCurrentUser();
  const { run } = useAction();
  if (!users) return <LoadingBlock rows={2} />;
  return (
    <Section icon={Users} title="ملفات العمل">
      <p className="text-sm text-muted-foreground">
        ملفان محليان لتنظيم الإسناد وسجل التدقيق، بالصلاحيات نفسها. هذه ليست حسابات موثّقة ولا توفر حماية للبيانات — أي شخص يستخدم هذا المتصفح يمكنه الوصول لها.
      </p>
      {users.map((u) => (
        <form
          key={u.id}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(() => userService.update(u.id, { name: String(fd.get('name')), color: String(fd.get('color')) }), 'تم الحفظ');
          }}
        >
          <Field label={u.title} htmlFor={`u-${u.id}`} className="min-w-48 flex-1">
            <Input id={`u-${u.id}`} name="name" defaultValue={u.name} maxLength={60} />
          </Field>
          <Field label="اللون" htmlFor={`uc-${u.id}`}>
            <input id={`uc-${u.id}`} name="color" type="color" defaultValue={u.color} className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card" />
          </Field>
          <Button type="submit" variant="outline">
            حفظ
          </Button>
          {u.id === me?.id ? (
            <Badge tone="primary">النشط</Badge>
          ) : (
            <Button variant="ghost" onClick={() => run(() => settingsService.switchUser(u.id), `أنت الآن تعمل باسم: ${u.name}`)}>
              التبديل إليه
            </Button>
          )}
        </form>
      ))}
    </Section>
  );
}

function CategoriesSection() {
  const categories = useCategories();
  const { run } = useAction();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  if (!categories) return <LoadingBlock rows={2} />;
  return (
    <Section icon={Tags} title="التصنيفات">
      <ul className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-border py-1 pe-1 ps-3 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name}
            <button
              type="button"
              aria-label={`حذف التصنيف ${c.name}`}
              className="rounded-full p-1 text-muted-foreground hover:bg-danger-soft hover:text-danger"
              onClick={async () => {
                if (await confirmDialog({ title: `حذف التصنيف «${c.name}»؟`, description: 'تحتفظ المهام المرتبطة بالمرجع، ويختفي التصنيف من القوائم.', destructive: true, confirmText: 'حذف' }))
                  await run(() => categoryService.remove(c.id), 'تم حذف التصنيف');
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => categoryService.create(name, color), 'تمت إضافة التصنيف');
          if (r) setName('');
        }}
      >
        <Field label="تصنيف جديد" htmlFor="cat-name" className="min-w-48 flex-1">
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <div className="flex gap-1" role="radiogroup" aria-label="لون التصنيف">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={`size-7 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <Button type="submit" disabled={!name.trim()}>
          <Plus aria-hidden />
          إضافة
        </Button>
      </form>
    </Section>
  );
}

function PreferencesSection() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { run } = useAction();
  if (!settings) return <LoadingBlock rows={2} />;
  const num = (k: 'dueSoonDays' | 'staleDays' | 'maxFileSizeMb') => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (v !== settings[k]) void run(() => settingsService.update({ [k]: v }), 'تم الحفظ').then((r) => r === false && (e.target.value = String(settings[k])));
  };
  return (
    <Section icon={Palette} title="التفضيلات">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="المظهر" htmlFor="pref-theme">
          <Select id="pref-theme" value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
            <option value="light">فاتح</option>
            <option value="dark">داكن</option>
          </Select>
        </Field>
        <Field label="بداية الأسبوع" htmlFor="pref-week">
          <Select id="pref-week" value={settings.weekStartsOn} onChange={(e) => run(() => settingsService.update({ weekStartsOn: Number(e.target.value) as 0 | 1 | 6 }))}>
            <option value={0}>الأحد</option>
            <option value={6}>السبت</option>
            <option value={1}>الاثنين</option>
          </Select>
        </Field>
        <Field label="أيام «قريبة الاستحقاق»" htmlFor="pref-due" hint="للتنبيهات وصفحة العاجلة">
          <Input id="pref-due" type="number" min={0} max={60} defaultValue={settings.dueSoonDays} onBlur={num('dueSoonDays')} />
        </Field>
        <Field label="أيام اعتبار المهمة «غير محدثة»" htmlFor="pref-stale">
          <Input id="pref-stale" type="number" min={1} max={365} defaultValue={settings.staleDays} onBlur={num('staleDays')} />
        </Field>
        <Field label="الحد الأقصى لحجم الملف (م.ب)" htmlFor="pref-size">
          <Input id="pref-size" type="number" min={1} max={200} defaultValue={settings.maxFileSizeMb} onBlur={num('maxFileSizeMb')} />
        </Field>
      </div>
    </Section>
  );
}

function BackupSection() {
  const settings = useSettings();
  const { run, pending } = useAction();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; summary: ImportSummary } | null>(null);
  const [encryptedFile, setEncryptedFile] = useState<Awaited<ReturnType<typeof readBackupFile>> | null>(null);
  const [importPassword, setImportPassword] = useState('');

  const doExport = async () => {
    if (encrypt && (password.length < 8 || password !== password2)) {
      toast.error(password.length < 8 ? 'كلمة المرور يجب ألا تقل عن 8 أحرف' : 'كلمتا المرور غير متطابقتين');
      return;
    }
    const r = await run(() => exportBackup({ includeFiles, password: encrypt ? password : undefined }), 'تم إنشاء النسخة الاحتياطية');
    if (r) {
      downloadBlob(r.blob, r.fileName, false);
      setPassword('');
      setPassword2('');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    const parsed = await run(() => readBackupFile(file));
    if (!parsed) return;
    if (parsed.kind === 'encrypted') {
      setEncryptedFile(parsed);
      setImportPassword('');
      return;
    }
    const summary = await run(() => summarizeImport(parsed.backup));
    if (summary) setPendingImport({ backup: parsed.backup, summary });
  };

  const decrypt = async () => {
    if (encryptedFile?.kind !== 'encrypted') return;
    const backup = await run(() => decryptBackup(encryptedFile.encrypted, importPassword));
    if (!backup) return;
    const summary = await run(() => summarizeImport(backup));
    setEncryptedFile(null);
    if (summary) setPendingImport({ backup, summary });
  };

  const doImport = async (mode: ImportMode) => {
    if (!pendingImport) return;
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'استبدال جميع البيانات الحالية؟',
        description: `سيُحذف كل ما على هذا الجهاز (${pendingImport.summary.currentTotal} سجل) ويُستبدل بمحتوى النسخة. يُنصح بتصدير نسخة من البيانات الحالية أولًا. لا يمكن التراجع.`,
        destructive: true,
        confirmText: 'استبدال الكل',
      });
      if (!ok) return;
    }
    const r = await run(async () => {
      const res = await importBackup(pendingImport.backup, mode);
      await ensureSetup();
      return res;
    });
    if (r) {
      toast.success(`اكتمل الاستيراد: ${r.added} جديد، ${r.updated} محدّث، ${r.skipped} بلا تغيير، ${r.blobs} ملف`);
      setPendingImport(null);
    }
  };

  const s = pendingImport?.summary;
  return (
    <Section id="backup" icon={Shield} title="النسخ الاحتياطي والاستعادة">
      <div role="note" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm">
        البيانات محفوظة في هذا المتصفح فقط ولا تتزامن تلقائيًا بين الأجهزة. لنقلها: صدّر نسخة هنا ثم استوردها على الجهاز الآخر. لا ترفع ملفات النسخ إلى مستودعات عامة.
      </div>
      <p className="text-sm text-muted-foreground">آخر نسخة احتياطية: {settings?.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'لم تُنشأ بعد'}</p>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">تصدير نسخة احتياطية</h3>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
          تضمين المرفقات والملفات المحفوظة محليًا
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} />
          <Lock className="size-4" aria-hidden />
          تشفير النسخة بكلمة مرور (AES-256-GCM)
        </label>
        {encrypt && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="كلمة المرور" htmlFor="bk-pass" hint="8 أحرف على الأقل. لا يمكن استعادتها إن نُسيت.">
              <Input id="bk-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="تأكيد كلمة المرور" htmlFor="bk-pass2">
              <Input id="bk-pass2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </Field>
          </div>
        )}
        <Button onClick={doExport} loading={pending}>
          <Download aria-hidden />
          تصدير النسخة الاحتياطية
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">استيراد نسخة احتياطية</h3>
        <p className="text-sm text-muted-foreground">يُتحقق من سلامة الملف وبنيته، ويُعرض ملخص قبل أي تغيير.</p>
        <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" id="bk-file" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} loading={pending}>
          <Upload aria-hidden />
          اختيار ملف النسخة
        </Button>
      </div>

      <Dialog open={encryptedFile !== null} onOpenChange={(o) => !o && setEncryptedFile(null)}>
        <DialogContent title="نسخة مشفّرة" description="أدخل كلمة المرور لفك التشفير.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decrypt();
            }}
          >
            <Field label="كلمة المرور" htmlFor="imp-pass">
              <Input id="imp-pass" type="password" autoFocus value={importPassword} onChange={(e) => setImportPassword(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEncryptedFile(null)}>
                إلغاء
              </Button>
              <Button type="submit" loading={pending} disabled={!importPassword}>
                فك التشفير
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingImport !== null} onOpenChange={(o) => !o && setPendingImport(null)}>
        {s && (
          <DialogContent title="ملخص النسخة قبل الاستيراد" wide>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">تاريخ التصدير</dt>
                <dd>{formatDateTime(s.exportedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">صدّرها</dt>
                <dd>{s.exportedByName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">المرفقات</dt>
                <dd>{s.includesFiles ? `${s.blobCount} ملف` : 'غير مضمّنة'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">المهام</dt>
                <dd className="tabular">{s.counts.tasks ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الخطوات</dt>
                <dd className="tabular">{s.counts.steps ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">الأفكار</dt>
                <dd className="tabular">{s.counts.ideas ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">سجلات جديدة</dt>
                <dd className="tabular text-success">{s.incoming}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">موجودة مسبقًا</dt>
                <dd className="tabular">{s.existing}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">متعارضة (نسخ مختلفة)</dt>
                <dd className="tabular text-warning">{s.conflicts}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
              <p>
                <strong>دمج (موصى به):</strong> يضيف الجديد، وعند التعارض يحتفظ بالنسخة الأحدث تعديلًا. لا يحذف شيئًا من بياناتك.
              </p>
              <p>
                <strong>استبدال كامل:</strong> يحذف جميع البيانات الحالية ({s.currentTotal} سجل) ويستبدلها بالنسخة.
                {!s.includesFiles && ' تنبيه: النسخة لا تتضمن المرفقات، فستُفقد الملفات الحالية.'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingImport(null)}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={() => doImport('replace')} disabled={pending}>
                استبدال كامل
              </Button>
              <Button onClick={() => doImport('merge')} loading={pending}>
                دمج
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = () => storageInfo().then(setInfo);
  useEffect(() => {
    void refresh();
  }, []);
  if (!info) return null;
  const pct = info.quota ? (info.usage / info.quota) * 100 : 0;
  return (
    <Section icon={HardDrive} title="مساحة التخزين">
      {!info.supported ? (
        <p className="text-sm text-muted-foreground">المتصفح لا يوفر معلومات عن المساحة.</p>
      ) : (
        <>
          <div className="flex justify-between text-sm">
            <span>
              مستخدم: <span className="tabular">{formatBytes(info.usage)}</span>
            </span>
            <span className="text-muted-foreground">
              المتاح للموقع تقريبًا: <span className="tabular">{formatBytes(info.quota)}</span>
            </span>
          </div>
          <Progress value={Math.max(pct, info.usage ? 1 : 0)} label="نسبة استخدام التخزين" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={info.persisted ? 'success' : 'warning'}>{info.persisted ? 'تخزين دائم مفعّل' : 'تخزين قابل للمسح من المتصفح'}</Badge>
            {!info.persisted && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await requestPersistence();
                  toast[ok ? 'success' : 'info'](ok ? 'تم تفعيل التخزين الدائم' : 'لم يوافق المتصفح حاليًا — تثبيت التطبيق يزيد فرص الموافقة');
                  void refresh();
                }}
              >
                طلب تخزين دائم
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">عند امتلاء المساحة احذف مرفقات قديمة أو مهام محذوفة نهائيًا بعد تصدير نسخة احتياطية.</p>
        </>
      )}
    </Section>
  );
}

function DeletedSection() {
  const deleted = useDeletedTasks();
  const { run } = useAction();
  if (!deleted) return null;
  return (
    <Section icon={RotateCcw} title={`المهام المحذوفة (${deleted.length})`}>
      {deleted.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مهام محذوفة.</p>
      ) : (
        <ul className="divide-y divide-border">
          {deleted.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(t.deletedAt)}</span>
              <Button size="sm" variant="outline" onClick={() => run(() => taskService.restore(t.id), 'تم استرجاع المهمة')}>
                استرجاع
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={async () => {
                  if (await confirmDialog({ title: 'حذف نهائي؟', description: `ستُحذف «${t.title}» وجميع خطواتها وتحديثاتها وملفاتها نهائيًا. لا يمكن التراجع.`, destructive: true, confirmText: 'حذف نهائي' }))
                    await run(() => taskService.purge(t.id), 'تم الحذف النهائي');
                }}
              >
                حذف نهائي
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function InstallSection() {
  const { canInstall, install, standalone, ios } = useInstallPrompt();
  return (
    <Section icon={MonitorSmartphone} title="تثبيت التطبيق">
      {standalone ? (
        <p className="text-sm text-success">التطبيق مثبت ويعمل كتطبيق مستقل.</p>
      ) : canInstall ? (
        <Button onClick={install}>
          <Download aria-hidden />
          تثبيت «مهام» على هذا الجهاز
        </Button>
      ) : ios ? (
        <p className="text-sm text-muted-foreground">على iPhone/iPad: افتح التطبيق في Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</p>
      ) : (
        <p className="text-sm text-muted-foreground">استخدم خيار «تثبيت التطبيق» من قائمة المتصفح (Chrome/Edge على الحاسوب وAndroid).</p>
      )}
      <p className="text-xs text-muted-foreground">بعد التثبيت يعمل التطبيق دون اتصال بالإنترنت، ويُعرض إشعار عند توفر إصدار جديد.</p>
    </Section>
  );
}

export default function SettingsPage() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#backup' || window.location.hash.endsWith('#backup')) {
      setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [location]);
  return (
    <div className="space-y-6">
      <PageHeader title="الإعدادات" />
      <BackupSection />
      <ProfilesSection />
      <PreferencesSection />
      <CategoriesSection />
      <StorageSection />
      <InstallSection />
      <DeletedSection />
      <p className="text-center text-xs text-muted-foreground">مهام | MAHAM v{__APP_VERSION__} — نظّم مهامك، تابع تقدمك، أنجز بذكاء</p>
    </div>
  );
}
