import type { DateOnly, Timestamp } from '@/types/entities';

/** جميع الحسابات التقويمية تتم بالتوقيت المحلي للجهاز */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateOnly(d: Date): DateOnly {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now: Date = new Date()): DateOnly {
  return toDateOnly(now);
}

let lastMs = 0;

/** طابع زمني متزايد بصرامة — يضمن ترتيبًا ثابتًا للأحداث المتتالية في نفس الملّي ثانية */
export function nowIso(): Timestamp {
  const ms = Math.max(Date.now(), lastMs + 1);
  lastMs = ms;
  return new Date(ms).toISOString();
}

/** يحوّل YYYY-MM-DD إلى Date عند منتصف الليل محليًا */
export function parseDateOnly(s: DateOnly): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isValidDateOnly(s: unknown): s is DateOnly {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDateOnly(s);
  return toDateOnly(d) === s;
}

/** الفرق بالأيام التقويمية (b − a) */
export function diffDays(a: DateOnly, b: DateOnly): number {
  const ms = parseDateOnly(b).getTime() - parseDateOnly(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDaysStr(s: DateOnly, days: number): DateOnly {
  const d = parseDateOnly(s);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

/** تاريخ تقويمي محلي من طابع زمني ISO */
export function timestampToDateOnly(ts: Timestamp): DateOnly {
  return toDateOnly(new Date(ts));
}

/** مفتاح الشهر YYYY-MM */
export function monthKey(d: DateOnly | Timestamp): string {
  return (d.length > 10 ? timestampToDateOnly(d) : d).slice(0, 7);
}

export function monthRange(key: string): { start: DateOnly; end: DateOnly } {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

export function lastMonthKeys(count: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return keys;
}

const LOCALE = 'ar';
const baseOpts: Intl.DateTimeFormatOptions = { calendar: 'gregory', numberingSystem: 'latn' };

const fmtShort = new Intl.DateTimeFormat(LOCALE, { ...baseOpts, day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayMonth = new Intl.DateTimeFormat(LOCALE, { ...baseOpts, day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat(LOCALE, { ...baseOpts, month: 'long', year: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat(LOCALE, { ...baseOpts, month: 'short' });
const fmtDateTime = new Intl.DateTimeFormat(LOCALE, {
  ...baseOpts,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { ...baseOpts, weekday: 'short' });

export function formatDate(s: DateOnly | null | undefined): string {
  if (!s) return '—';
  return fmtShort.format(parseDateOnly(s));
}

export function formatDayMonth(s: DateOnly): string {
  return fmtDayMonth.format(parseDateOnly(s));
}

export function formatDateTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  return fmtDateTime.format(new Date(ts));
}

export function formatMonth(key: string): string {
  return fmtMonth.format(parseDateOnly(`${key}-01`));
}

export function formatMonthShort(key: string): string {
  return fmtMonthShort.format(parseDateOnly(`${key}-01`));
}

export function formatWeekday(d: Date): string {
  return fmtWeekday.format(d);
}

/** وصف نسبي مختصر: "اليوم"، "غدًا"، "بعد 3 أيام"، "متأخرة يومين" */
export function relativeDue(due: DateOnly, now: Date = new Date()): string {
  const days = diffDays(todayStr(now), due);
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === -1) return 'أمس';
  if (days > 1) return `بعد ${days} ${days <= 10 ? 'أيام' : 'يومًا'}`;
  const n = Math.abs(days);
  return `منذ ${n} ${n <= 10 ? 'أيام' : 'يومًا'}`;
}

export function relativeTime(ts: Timestamp, now: Date = new Date()): string {
  const sec = Math.round((now.getTime() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return 'الآن';
  const min = Math.round(sec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.round(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return formatDate(timestampToDateOnly(ts));
}
