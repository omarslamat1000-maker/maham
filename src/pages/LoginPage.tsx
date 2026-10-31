import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Gauge, KeyRound, Lock, LogIn, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { useUsers } from '@/hooks/data';
import { authService, AuthError, hasPassword, MIN_PASSWORD_LENGTH } from '@/services/authService';
import { toUserMessage } from '@/services/core';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/entities';
import { cn } from '@/utils/cn';

const FEATURES = [
  { icon: Gauge, title: 'متابعة دقيقة للإنجاز', text: 'إنجاز مرجّح بالخطوات ومؤشرات أداء حية' },
  { icon: ShieldCheck, title: 'اعتماد وتسليم منظّم', text: 'مسار مراجعة موثّق بسجل نشاط كامل' },
  { icon: WifiOff, title: 'يعمل دون اتصال', text: 'بياناتك تبقى على جهازك' },
];

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) s++;
  if (pw.length >= 12) s++;
  if (/\d/.test(pw) && /[^\d]/.test(pw)) s++;
  if (/[^A-Za-z0-9؀-ۿ]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  return { score: s, label: ['ضعيفة جدًا', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'][s] };
}

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000)) : 0;
}

function ProfileCard({ user, selected, onSelect }: { user: User; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start transition-all',
        selected ? 'border-primary bg-primary-soft shadow-sm' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-inner"
        style={{ background: user.color }}
        aria-hidden
      >
        {user.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{user.name}</span>
        <span className="block truncate text-xs text-muted-foreground" dir="auto">
          {user.title}
        </span>
        {!hasPassword(user) && <span className="mt-1 inline-block text-[11px] font-medium text-warning">يتطلب إنشاء كلمة مرور</span>}
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
        aria-hidden
      >
        {selected && <Check className="size-3.5" />}
      </span>
    </button>
  );
}

export default function LoginPage() {
  const users = useUsers();
  const setUser = useAuthStore((s) => s.setUser);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const remaining = useCountdown(lockedUntil);

  const selected = useMemo(() => users?.find((u) => u.id === selectedId), [users, selectedId]);
  const creating = !!selected && !hasPassword(selected);
  const st = strength(password);

  useEffect(() => {
    setPassword('');
    setConfirm('');
    setError(null);
    setLockedUntil(selected?.lockedUntil && new Date(selected.lockedUntil).getTime() > Date.now() ? selected.lockedUntil : null);
    if (selectedId) setTimeout(() => passwordRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || pending || remaining > 0) return;
    setPending(true);
    setError(null);
    try {
      const u = creating ? await authService.createPassword(selected.id, password, confirm) : await authService.login(selected.id, password);
      setUser(u.id);
    } catch (err) {
      setError(toUserMessage(err));
      if (err instanceof AuthError && err.lockedUntil) setLockedUntil(err.lockedUntil);
      setPassword('');
      setConfirm('');
      passwordRef.current?.focus();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* لوحة الهوية */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#064e3b] via-[#065f46] to-[#134e4a] p-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(circle at 85% 15%, rgba(52,211,153,0.25), transparent 40%), radial-gradient(circle at 10% 90%, rgba(45,212,191,0.2), transparent 45%)',
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -bottom-24 -start-24 size-96 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 -start-40 size-[32rem] rounded-full border border-white/5" aria-hidden />

        <div className="relative flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={48} height={48} className="size-12 rounded-2xl shadow-lg ring-1 ring-white/20" />
          <div className="leading-tight">
            <div className="text-2xl font-bold">مهام</div>
            <div className="text-xs tracking-[0.3em] text-emerald-200/80">MAHAM</div>
          </div>
        </div>

        <div className="relative my-auto max-w-md space-y-8 py-12">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-100 ring-1 ring-white/15">
              <Sparkles className="size-3.5" aria-hidden />
              نظام ذكي لإدارة المهام والمخرجات
            </p>
            <h1 className="text-4xl leading-tight font-bold">
              نظّم مهامك،
              <br />
              تابع تقدمك،
              <br />
              <span className="text-emerald-300">أنجز بذكاء.</span>
            </h1>
          </div>
          <ul className="space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="size-5 text-emerald-200" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="block text-sm text-emerald-100/75">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-emerald-100/60">© {new Date().getFullYear()} مهام | MAHAM</p>
      </aside>

      {/* نموذج الدخول */}
      <main className="flex flex-col">
        <div className="flex items-center gap-3 bg-gradient-to-br from-[#064e3b] to-[#134e4a] px-6 py-6 text-white lg:hidden">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={40} height={40} className="size-10 rounded-xl ring-1 ring-white/20" />
          <div className="leading-tight">
            <div className="text-xl font-bold">مهام</div>
            <div className="text-xs text-emerald-100/80">نظّم مهامك، تابع تقدمك، أنجز بذكاء</div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Lock className="size-6" aria-hidden />
              </span>
              <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
              <p className="text-sm text-muted-foreground">اختر ملف العمل وأدخل كلمة المرور للمتابعة.</p>
            </div>

            <form onSubmit={submit} className="space-y-6" noValidate>
              <fieldset>
                <legend className="mb-3 text-sm font-medium">ملف العمل</legend>
                <div role="radiogroup" aria-label="ملف العمل" className="grid gap-3">
                  {!users
                    ? Array.from({ length: 2 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)
                    : users.map((u) => <ProfileCard key={u.id} user={u} selected={u.id === selectedId} onSelect={() => setSelectedId(u.id)} />)}
                </div>
              </fieldset>

              {selected && (
                <div className="space-y-4">
                  {/* اسم مستخدم مخفي لدعم مديري كلمات المرور */}
                  <input type="text" name="username" autoComplete="username" value={selected.name} readOnly hidden />
                  {creating && (
                    <div role="note" className="flex gap-2 rounded-xl border border-info/30 bg-info-soft p-3 text-sm">
                      <KeyRound className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                      <span>
                        أول دخول لـ«{selected.name}». أنشئ كلمة مرور ({MIN_PASSWORD_LENGTH} أحرف على الأقل، حروف وأرقام).
                      </span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">{creating ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</Label>
                    <div className="relative">
                      <Input
                        ref={passwordRef}
                        id="login-password"
                        type={show ? 'text' : 'password'}
                        autoComplete={creating ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={!!error}
                        aria-describedby={error ? 'login-error' : undefined}
                        className="h-12 pl-12 text-base"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        className="absolute left-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        aria-pressed={show}
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {creating && password && (
                      <div className="flex items-center gap-2 pt-1" aria-live="polite">
                        <div className="flex flex-1 gap-1" aria-hidden>
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={cn(
                                'h-1.5 flex-1 rounded-full',
                                i < st.score ? (st.score <= 1 ? 'bg-danger' : st.score === 2 ? 'bg-warning' : 'bg-success') : 'bg-muted',
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">قوة كلمة المرور: {st.label}</span>
                      </div>
                    )}
                  </div>
                  {creating && (
                    <div className="space-y-1.5">
                      <Label htmlFor="login-confirm">تأكيد كلمة المرور</Label>
                      <Input
                        id="login-confirm"
                        type={show ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="h-12 text-base"
                        dir="ltr"
                      />
                    </div>
                  )}

                  {(error || remaining > 0) && (
                    <p id="login-error" role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                      {error ?? 'تم إيقاف المحاولات مؤقتًا.'}
                      {remaining > 0 && <span className="tabular block pt-1 font-medium">أعد المحاولة بعد {remaining} ثانية</span>}
                    </p>
                  )}

                  <Button type="submit" size="lg" className="h-12 w-full text-base" loading={pending} disabled={!password || remaining > 0}>
                    {!pending && <LogIn aria-hidden />}
                    {creating ? 'إنشاء كلمة المرور والدخول' : 'تسجيل الدخول'}
                  </Button>

                  {!creating && (
                    <button type="button" onClick={() => setForgotOpen(true)} className="mx-auto block text-sm text-primary hover:underline">
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
              )}
            </form>

            <p className="mt-10 flex gap-2 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                دخول محلي يحمي الوصول إلى التطبيق على هذا الجهاز، مع قفل تلقائي عند عدم النشاط. كلمات المرور لا تُخزَّن، بل بصمتها المشفّرة فقط. البيانات
                غير مرسلة لأي خادم؛ لحماية كاملة احمِ حساب جهازك وصدّر نسخًا احتياطية مشفّرة.
              </span>
            </p>
          </div>
        </div>
      </main>

      <ForgotDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}

function ForgotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => setTyped(''), [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="نسيت كلمة المرور؟" description="لا يوجد خادم لاستعادة كلمات المرور، لذلك تتوفر الخيارات التالية:">
        <ol className="list-inside list-decimal space-y-3 text-sm">
          <li>
            <strong>الطريقة الموصى بها:</strong> يسجّل المستخدم الآخر دخوله ثم يعيد تعيين كلمة مرورك من <em>الإعدادات ← الأمان وتسجيل الدخول</em>،
            وتنشئ كلمة جديدة عند دخولك التالي.
          </li>
          <li>
            <strong>الملاذ الأخير:</strong> حذف جميع بيانات التطبيق من هذا المتصفح، ثم استيراد آخر نسخة احتياطية (تتضمن كلمات المرور التي كانت وقت التصدير).
          </li>
        </ol>
        <div className="mt-4 space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3">
          <Label htmlFor="wipe-confirm" className="text-danger">
            للحذف الكامل اكتب «حذف جميع البيانات»
          </Label>
          <Input id="wipe-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim() !== 'حذف جميع البيانات'}
            loading={pending}
            onClick={async () => {
              setPending(true);
              await authService.wipeAllData();
              location.reload();
            }}
          >
            حذف جميع البيانات نهائيًا
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
