import { AI_SCHEMAS, type AIActionId, type AIResult } from './actions';

export type ParseResult<A extends AIActionId> = { ok: true; data: AIResult<A> } | { ok: false; error: string };

/** يستخرج كائن JSON من رد النموذج (قد يكون داخل ```json أو محاطًا بنص) */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('الرد فارغ');
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* يتابع إلى الخطأ أدناه */
      }
    }
    throw new Error('تعذّر العثور على JSON صالح في الرد');
  }
}

/** يحلل الرد ويتحقق منه وفق مخطط الإجراء — لا يُطبَّق أي شيء دون موافقة المستخدم */
export function parseAIResponse<A extends AIActionId>(action: A, text: string): ParseResult<A> {
  if (text.length > 200_000) return { ok: false, error: 'الرد طويل جدًا' };
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const r = AI_SCHEMAS[action].safeParse(json);
  if (!r.success) {
    const issue = r.error.issues[0];
    return { ok: false, error: `الرد لا يطابق البنية المطلوبة${issue?.path.length ? ` (الحقل: ${issue.path.join('.')})` : ''}` };
  }
  return { ok: true, data: r.data as AIResult<A> };
}
