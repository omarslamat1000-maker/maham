/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** عنوان وسيط آمن اختياري لـ Gemini (يحتفظ بالمفتاح على الخادم). لا تضع أي مفتاح هنا. */
  readonly VITE_AI_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
