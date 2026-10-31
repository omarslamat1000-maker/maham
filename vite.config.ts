/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * يحدد المسار الأساسي تلقائيًا وفق نوع GitHub Pages:
 * - مستودع باسم <user>.github.io  → '/'
 * - مستودع مشروع عادي            → '/<repo>/'
 * - التطوير المحلي                → '/'
 * يمكن التجاوز يدويًا بالمتغير VITE_BASE.
 */
function resolveBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) return '/';
  if (repo.toLowerCase().endsWith('.github.io')) return '/';
  return `/${repo}/`;
}

const base = resolveBase();

/** سياسة أمان المحتوى — تُحقن في نسخة الإنتاج فقط لأن خادم التطوير يحتاج سكربتات مضمّنة */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // يُضاف أصل وسيط الذكاء الاصطناعي فقط إذا ضُبط صراحة أثناء البناء
  `connect-src 'self'${process.env.VITE_AI_PROXY_URL ? ' ' + new URL(process.env.VITE_AI_PROXY_URL).origin : ''}`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

const cspPlugin: Plugin = {
  name: 'maham-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    );
  },
};

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  plugins: [
    cspPlugin,
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' يمنع تشغيل نسخة قديمة بصمت: يظهر للمستخدم إشعار "تحديث متاح"
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'مهام | MAHAM',
        short_name: 'مهام',
        description: 'نظّم مهامك، تابع تقدمك، أنجز بذكاء',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#065f46',
        background_color: '#f6f7f5',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        categories: ['productivity', 'business'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    css: false,
  },
});
