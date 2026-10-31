import { Bell, CalendarDays, ChartColumn, Flame, LayoutDashboard, Lightbulb, ListTodo, Settings, Sparkles, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** يظهر في شريط الجوال السفلي */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard, mobile: true },
  { to: '/tasks', label: 'المهام', icon: ListTodo, mobile: true },
  { to: '/urgent', label: 'المهام العاجلة', icon: Flame, mobile: true },
  { to: '/backlog', label: 'بنك الأفكار', icon: Lightbulb },
  { to: '/calendar', label: 'التقويم', icon: CalendarDays },
  { to: '/reports', label: 'التقارير', icon: ChartColumn },
  { to: '/notifications', label: 'التنبيهات', icon: Bell },
  { to: '/ai', label: 'MAHAM AI', icon: Sparkles },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
];
