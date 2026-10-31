/**
 * طبقة تجريد مزودي الذكاء الاصطناعي.
 *
 * - ManualGeminiProvider (الافتراضي): يبني البرومبت، ينسخه المستخدم إلى Gemini،
 *   ثم يلصق الرد ليُحلَّل ويُتحقق منه. لا مفاتيح API في الواجهة إطلاقًا.
 * - GeminiProxyProvider: محوّل جاهز للترقية عند توفر وسيط آمن يحتفظ بالمفتاح على الخادم
 *   (يُفعَّل فقط عند ضبط VITE_AI_PROXY_URL أثناء البناء). لا يُرسل أي مفتاح من المتصفح.
 */

export interface AIProvider {
  id: string;
  label: string;
  mode: 'manual' | 'api';
  /** هل المزود قابل للاستخدام الآن؟ */
  isAvailable(): boolean;
  unavailableReason?: string;
  /** للمزودين الآليين فقط */
  complete?(prompt: string, signal?: AbortSignal): Promise<string>;
}

export const manualGeminiProvider: AIProvider = {
  id: 'gemini-manual',
  label: 'Google Gemini (يدوي: نسخ ولصق)',
  mode: 'manual',
  isAvailable: () => true,
};

export class GeminiProxyProvider implements AIProvider {
  id = 'gemini-proxy';
  label = 'Google Gemini (عبر وسيط آمن)';
  mode = 'api' as const;
  unavailableReason = 'لم يُضبط وسيط آمن (VITE_AI_PROXY_URL). المفتاح يجب ألا يوضع في الواجهة.';

  constructor(private readonly endpoint: string | undefined) {}

  isAvailable(): boolean {
    if (!this.endpoint) return false;
    try {
      return new URL(this.endpoint).protocol === 'https:';
    } catch {
      return false;
    }
  }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    if (!this.isAvailable()) throw new Error(this.unavailableReason);
    const res = await fetch(this.endpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`فشل الطلب (${res.status})`);
    const json = (await res.json()) as { text?: unknown };
    if (typeof json.text !== 'string') throw new Error('رد غير متوقع من الوسيط');
    return json.text;
  }
}

export function getProviders(): AIProvider[] {
  const proxy = new GeminiProxyProvider(import.meta.env.VITE_AI_PROXY_URL as string | undefined);
  return proxy.isAvailable() ? [proxy, manualGeminiProvider] : [manualGeminiProvider, proxy];
}
