import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { toCsv, toXlsx } from '@/utils/export';
import { checkFile, canPreviewInline, safeFileName } from '@/utils/file';
import { parseAIResponse } from '@/services/ai/parser';
import { buildPrompt } from '@/services/ai/promptBuilder';
import { decryptText, encryptText } from '@/utils/crypto';
import { diffDays, isValidDateOnly, monthRange } from '@/utils/date';
import { safeUrl } from '@/domain/schemas';

describe('التصدير', () => {
  it('CSV مع BOM ويحيّد حقن الصيغ', () => {
    const csv = toCsv({ columns: ['العنوان', 'القيمة'], rows: [['=SUM(A1)', 5], ['نص, مع فاصلة', null]] });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"نص, مع فاصلة"');
  });

  it('XLSX ملف ZIP صالح بأوراق RTL', () => {
    const bytes = toXlsx([{ name: 'المهام', columns: ['أ', 'ب'], rows: [['<script>', 1]] }]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('xl/workbook.xml');
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('&lt;script&gt;');
    expect(sheet).not.toContain('<script>');
  });
});

describe('أمان الملفات والروابط', () => {
  it('يتحقق من النوع والحجم', () => {
    expect(checkFile({ name: 'a.docx', size: 10 }, 1)).toEqual({ ok: true, kind: 'word' });
    expect(checkFile({ name: 'a.xlsx', size: 10 }, 1)).toEqual({ ok: true, kind: 'excel' });
    expect(checkFile({ name: 'a.html', size: 10 }, 1)).toEqual({ ok: true, kind: 'html' });
    expect(checkFile({ name: 'a.pdf', size: 2 * 1024 * 1024 }, 1).ok).toBe(false);
    expect(checkFile({ name: 'a.exe', size: 10 }, 1).ok).toBe(false);
  });

  it('لا يعاين HTML أو SVG داخل التطبيق', () => {
    expect(canPreviewInline('text/html', 'a.html')).toBe(false);
    expect(canPreviewInline('image/svg+xml', 'a.svg')).toBe(false);
    expect(canPreviewInline('image/png', 'a.png')).toBe(true);
  });

  it('ينظف أسماء الملفات ويرفض الروابط غير الآمنة', () => {
    expect(safeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(safeUrl.safeParse('data:text/html,x').success).toBe(false);
    expect(safeUrl.safeParse('https://youtu.be/x').success).toBe(true);
  });
});

describe('التواريخ', () => {
  it('يحسب الفروق ويتحقق من الصيغة', () => {
    expect(diffDays('2026-10-01', '2026-10-31')).toBe(30);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2026-02-28')).toBe(true);
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('التشفير', () => {
  it('AES-GCM يفك التشفير بنفس كلمة المرور فقط', async () => {
    const enc = await encryptText('بيانات خاصة', 'pass-1234', 1000);
    expect(enc.data).not.toContain('بيانات');
    expect(await decryptText(enc, 'pass-1234')).toBe('بيانات خاصة');
    await expect(decryptText(enc, 'wrong')).rejects.toBeTruthy();
  });
});

describe('MAHAM AI', () => {
  it('يحلل JSON داخل كتلة كود ويتحقق من البنية', () => {
    const r = parseAIResponse('suggest_steps', 'إليك الخطوات:\n```json\n{"steps":[{"title":"تحليل","weight":2},{"title":"تنفيذ"}]}\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.steps.map((s) => s.weight)).toEqual([2, 1]);
  });

  it('يرفض الردود غير المطابقة', () => {
    expect(parseAIResponse('improve_description', 'لا يوجد JSON').ok).toBe(false);
    expect(parseAIResponse('suggest_steps', '{"steps":[]}').ok).toBe(false);
    expect(parseAIResponse('prioritize', '{"items":[{"taskId":"1","priority":"super"}]}').ok).toBe(true);
  });

  it('يبني برومبت يتضمن البيانات ويخفي الأسماء عند الطلب', () => {
    const users = [{ id: 'u1', name: 'أحمد' }] as never;
    const task = {
      id: 't1',
      title: 'إطلاق الموقع',
      description: '',
      categoryId: null,
      project: '',
      entity: '',
      assigneeId: 'u1',
      priority: 'high',
      status: 'in_progress',
      submissionStatus: 'not_submitted',
      computedProgress: 40,
      manualProgress: null,
      startDate: null,
      dueDate: null,
      completedAt: null,
      deletedAt: null,
    } as never;
    const p = buildPrompt('suggest_steps', { task, steps: [], updates: [], users, categories: [], anonymize: true });
    expect(p).toContain('إطلاق الموقع');
    expect(p).toContain('مستخدم 1');
    expect(p).not.toContain('أحمد');
  });
});
