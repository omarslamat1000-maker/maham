import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Bell, ChevronDown, CloudOff, Menu, Moon, Plus, Search, Sun, UserRound, X } from 'lucide-react';
import { NAV_ITEMS } from '@/app/nav';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { useAction, useCurrentUser, useUnreadCount, useUsers } from '@/hooks/data';
import { useTheme } from '@/hooks/useTheme';
import { useOnline } from '@/hooks/usePwa';
import { useUIStore } from '@/stores/uiStore';
import { settingsService } from '@/services/settingsService';
import { cn } from '@/utils/cn';
import { isTyping } from '@/utils/dom';
import { DataBanners } from './DataBanners';

function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="مهام — الصفحة الرئيسية">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-9 rounded-xl" width={36} height={36} />
      <div className="leading-tight">
        <div className="text-lg font-bold">مهام</div>
        <div className="text-[10px] tracking-[0.2em] opacity-70">MAHAM</div>
      </div>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const unread = useUnreadCount();
  return (
    <nav aria-label="التنقل الرئيسي" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground/85 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <item.icon className="size-[18px]" aria-hidden />
          <span className="flex-1">{item.label}</span>
          {item.to === '/notifications' && unread > 0 && (
            <span className="tabular rounded-full bg-emerald-400 px-1.5 text-[11px] font-bold text-emerald-950">{unread}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserSwitcher() {
  const users = useUsers();
  const me = useCurrentUser();
  const { run } = useAction();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="ملف العمل الحالي">
          <span className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: me?.color ?? '#047857' }}>
            {me?.name.slice(0, 1) ?? <UserRound />}
          </span>
          <span className="hidden max-w-28 truncate text-sm md:inline">{me?.name}</span>
          <ChevronDown className="hidden md:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>ملف العمل النشط (للتنظيم فقط — ليس تسجيل دخول)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users?.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => run(() => settingsService.switchUser(u.id), `أنت الآن تعمل باسم: ${u.name}`)}>
            <span className="size-2.5 rounded-full" style={{ background: u.color }} aria-hidden />
            <span className="flex-1">{u.name}</span>
            {u.id === me?.id && <span className="text-xs text-primary">نشط</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">إدارة الملفات والإعدادات</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTyping(e)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative hidden max-w-sm flex-1 md:block"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/tasks?q=${encodeURIComponent(q.trim())}`);
        ref.current?.blur();
      }}
    >
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث في المهام…"
        aria-label="البحث في المهام"
        className="h-10 w-full rounded-lg border border-input bg-muted/50 pe-10 ps-9 text-sm outline-none focus:border-ring focus:bg-card"
      />
      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">
        <Kbd>/</Kbd>
      </span>
    </form>
  );
}

export function AppShell() {
  const { theme, toggle } = useTheme();
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const unread = useUnreadCount();
  const online = useOnline();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMoreOpen(false), [location.pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // اختصار N لإنشاء مهمة من أي صفحة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'n' || e.key === 'N' || e.key === 'ى') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e)) {
        if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-2">
        تخطَّ إلى المحتوى
      </a>

      {/* الشريط الجانبي — الشاشات الكبيرة */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-sidebar p-4 text-white lg:flex">
        <Logo className="px-2 pt-1 text-white" />
        <Button onClick={() => openQuickAdd()} className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400">
          <Plus aria-hidden />
          مهمة جديدة
          <Kbd>N</Kbd>
        </Button>
        <SidebarNav />
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-sidebar-foreground/60">
          نظّم مهامك، تابع تقدمك، أنجز بذكاء
          <br />
          البيانات محفوظة على هذا الجهاز فقط.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <Logo className="lg:hidden" />
          <GlobalSearch />
          <div className="ms-auto flex items-center gap-1">
            {!online && (
              <span className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline-flex" title="التطبيق يعمل دون اتصال">
                <CloudOff className="size-3.5" aria-hidden />
                دون اتصال
              </span>
            )}
            <Button onClick={() => openQuickAdd()} className="hidden sm:inline-flex lg:hidden" size="sm">
              <Plus aria-hidden />
              مهمة جديدة
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label={`التنبيهات${unread ? ` (${unread} غير مقروءة)` : ''}`}>
              <Link to="/notifications" className="relative">
                <Bell className="size-5" />
                {unread > 0 && (
                  <span className="tabular absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}>
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <UserSwitcher />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          <DataBanners />
          <Outlet />
        </main>
      </div>

      {/* شريط التنقل السفلي — الجوال والتابلت */}
      <nav
        aria-label="التنقل السفلي"
        className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          {NAV_ITEMS.filter((n) => n.mobile)
            .slice(0, 2)
            .map((item) => (
              <BottomLink key={item.to} {...item} />
            ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openQuickAdd()}
              aria-label="مهمة جديدة"
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          {NAV_ITEMS.filter((n) => n.mobile)
            .slice(2)
            .map((item) => (
              <BottomLink key={item.to} {...item} />
            ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
          >
            {moreOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            المزيد
            {unread > 0 && !moreOpen && <span className="sr-only">({unread} تنبيهات)</span>}
          </button>
        </div>
      </nav>

      {moreOpen && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)} aria-hidden />
          <div id="more-menu" className="fixed inset-x-3 bottom-20 z-30 max-h-[70dvh] overflow-y-auto rounded-2xl bg-sidebar p-3 shadow-xl lg:hidden">
            <SidebarNav onNavigate={() => setMoreOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function BottomLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Plus }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'font-semibold text-primary' : 'text-muted-foreground')
      }
    >
      <Icon className="size-5" aria-hidden />
      <span className="max-w-full truncate px-1">{label.replace('المهام العاجلة', 'العاجلة')}</span>
    </NavLink>
  );
}
