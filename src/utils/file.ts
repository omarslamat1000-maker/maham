import type { DeliverableKind } from '@/types/entities';

const EXT_KIND: Record<string, DeliverableKind> = {
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  odp: 'powerpoint',
  xls: 'excel',
  xlsx: 'excel',
  ods: 'excel',
  csv: 'excel',
  pdf: 'pdf',
  html: 'html',
  htm: 'html',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  txt: 'other',
  md: 'other',
  zip: 'other',
};

const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv']);

export const ACCEPT_ATTR = Object.keys(EXT_KIND)
  .map((e) => `.${e}`)
  .join(',');

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export type FileCheck = { ok: true; kind: DeliverableKind } | { ok: false; error: string };

export function checkFile(file: { name: string; size: number }, maxMb: number): FileCheck {
  const ext = extOf(file.name);
  if (VIDEO_EXT.has(ext)) {
    return { ok: false, error: 'ملفات الفيديو كبيرة ولا تُخزَّن داخل التطبيق. أضفها كرابط فيديو خارجي.' };
  }
  const kind = EXT_KIND[ext];
  if (!kind) return { ok: false, error: `نوع الملف .${ext || '؟'} غير مدعوم` };
  if (file.size <= 0) return { ok: false, error: 'الملف فارغ' };
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `حجم الملف يتجاوز الحد المسموح (${maxMb} ميغابايت)` };
  }
  return { ok: true, kind };
}

/** معاينة آمنة داخل التطبيق: الصور النقطية فقط عبر <img> (لا HTML ولا SVG كمستند) */
export function canPreviewInline(mime: string | null, fileName: string | null): boolean {
  const ext = extOf(fileName ?? '');
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext) || (!!mime && /^image\/(png|jpeg|gif|webp|bmp)$/.test(mime));
}

/** اسم ملف آمن للتنزيل */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return cleaned.slice(0, 180) || 'file';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}

/**
 * تنزيل Blob كملف. يُفرض النوع application/octet-stream حتى لا يعرض المتصفح
 * ملفات HTML/SVG المرفوعة داخل أصل التطبيق (منع XSS).
 */
export function downloadBlob(blob: Blob, fileName: string, forceOctet = true): void {
  const out = forceOctet ? new Blob([blob], { type: 'application/octet-stream' }) : blob;
  const url = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, fileName: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), fileName, false);
}

export function readFileAsText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}
